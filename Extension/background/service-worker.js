// ── SmartApply Background Service Worker ─────────────────────────────────

import { createDefaultState } from '../shared/schemas.js';
import { HEARTBEAT_INTERVAL, API_BASE, GOOGLE_CLIENT_ID } from '../shared/constants.js';

let appState = createDefaultState();
let pendingConfirmation = null;
let heartbeatTimer = null;

// ── Storage ───────────────────────────────────────────────────────────────

async function saveState() {
  const stateToSave = JSON.parse(JSON.stringify(appState));
  delete stateToSave.runtime.token;
  await chrome.storage.local.set({ appState: stateToSave });

  if (appState.runtime.token) {
    await chrome.storage.session.set({ userToken: appState.runtime.token });
  } else {
    await chrome.storage.session.remove('userToken');
  }
}

async function loadState() {
  const result = await chrome.storage.local.get('appState');
  const sessionResult = await chrome.storage.session.get('userToken');
  if (result.appState) {
    const defaults = createDefaultState();
    // Deep-merge each top-level key so new schema fields are never undefined
    appState = {
      ...defaults,
      ...result.appState,
      profile: { ...defaults.profile, ...(result.appState.profile || {}) },
      runtime: { ...defaults.runtime, ...(result.appState.runtime || {}) },
      settings: { ...defaults.settings, ...(result.appState.settings || {}) },
    };
    appState.runtime.isRunning = false;
    appState.runtime.isPaused = false;
    if (sessionResult.userToken) {
      appState.runtime.token = sessionResult.userToken;
    }
    
    if (appState.runtime.activeAutomationTabId) {
      try {
        await chrome.tabs.get(appState.runtime.activeAutomationTabId);
      } catch (e) {
        appState.runtime.activeAutomationTabId = null;
        saveState().catch(() => {});
      }
    }
  }
}

// ── API Bridge ────────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    const controller = new AbortController();
    let timeout;
    
    const requestOptions = {
      ...options,
      headers: {
        ...(options?.headers || {})
      },
      signal: controller.signal
    };

    const timeoutMs = 
      url.includes('/ai/') ? 45000 :
      url.includes('/profile/') ? 15000 :
      url.includes('/auth/') ? 15000 :
      15000;

    let res;
    try {
      try {
        timeout = setTimeout(() => controller.abort(), timeoutMs);
        res = await fetch(url, requestOptions);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }
    
    if (res.ok) {
      try {
        return await res.json();
      } catch (err) {
        throw new Error(`Invalid JSON response from API ${res.status}`);
      }
    }

    const errorText = await res.text();

    if (res.status === 401 || res.status === 403) {
      console.error(`[SmartApply] Global Auth Expiry (HTTP ${res.status})`);
      appState.runtime.isRunning = false;
      saveState().catch(() => {});
      chrome.runtime.sendMessage({ type: 'AUTH_EXPIRED' }).catch(() => {});
      throw new Error('Authentication expired. Please login again.');
    }

    if (res.status === 429) {
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`API ${res.status}: ${errorText}`);
      }
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }

    if (res.status < 500) {
      throw new Error(`API ${res.status}: ${errorText}`);
    }

    attempt++;
    if (attempt >= maxRetries) {
      throw new Error(`API ${res.status}: ${errorText}`);
    }
    
    await sleep(Math.pow(2, attempt) * 1000); // Exponential back-off
  }
}

async function apiGet(endpoint, token) {
  return fetchWithRetry(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiPost(endpoint, body, token) {
  return fetchWithRetry(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

// ── Extension WebSocket Manager ───────────────────────────────────────────

let _extWs = null;
let _extWsReady = false;
let _extWsPingTimer = null;
let _extWsReconnectTimer = null;
let _lastScoredJdHash = '';

async function connectExtensionWebSocket() {
  if (_extWs && (_extWs.readyState === WebSocket.OPEN || _extWs.readyState === WebSocket.CONNECTING)) return;
  const stored = await chrome.storage.session.get('userToken');
  const token = stored.userToken || appState.runtime.token;
  if (!token) return;

  try {
    // Get one-time ticket
    const ticketData = await fetchWithRetry(
      `${API_BASE}/ws-ticket`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      },
      2
    );
    const ticket = ticketData?.ticket;
    if (!ticket) throw new Error('No ticket returned');

    // Build WSS URL from API_BASE (e.g. https://www.smartapplies.app/api → wss://www.smartapplies.app/ws/realtime)
    const wsBase = API_BASE.replace(/\/api$/, '').replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    const wsUrl = `${wsBase}/ws/realtime?ticket=${ticket}`;

    _extWs = new WebSocket(wsUrl);

    _extWs.onopen = () => {
      _extWsReady = true;
      console.log('[SmartApply WS] Extension WebSocket connected');
      // Ping every 25s (server heartbeat window is 30s)
      _extWsPingTimer = setInterval(() => {
        if (_extWs?.readyState === WebSocket.OPEN) {
          _extWs.send(JSON.stringify({ type: 'PING' }));
        }
      }, 25000);
    };

    _extWs.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        // Forward server-push events to popup UI
        if (['MATCH_SCORE', 'JOB_APPLIED', 'JOB_FAILED', 'JOB_SKIPPED', 'NOTIFICATION', 'BOT_RUN_SUMMARY'].includes(msg.type)) {
          chrome.runtime.sendMessage({ type: 'WS_EVENT', event: msg }).catch(() => {});
        }
        if (msg.type === 'FORCE_REAUTH' || msg.type === 'SESSION_REVOKED') {
          _extWsReady = false;
          _extWs = null;
        }
      } catch (_) {}
    };

    _extWs.onclose = (evt) => {
      _extWsReady = false;
      _extWs = null;
      clearInterval(_extWsPingTimer);
      console.log(`[SmartApply WS] Disconnected (code=${evt.code}). Reconnecting in 5s…`);
      _extWsReconnectTimer = setTimeout(async () => {
        const s = await chrome.storage.session.get('userToken');
        if (s.userToken || appState.runtime.token) connectExtensionWebSocket();
      }, 5000);
    };

    _extWs.onerror = (e) => {
      console.warn('[SmartApply WS] WebSocket error:', e?.message || e);
    };

  } catch (e) {
    console.warn('[SmartApply WS] Failed to connect:', e.message);
    _extWsReconnectTimer = setTimeout(connectExtensionWebSocket, 15000);
  }
}

function disconnectExtensionWebSocket() {
  clearInterval(_extWsPingTimer);
  clearTimeout(_extWsReconnectTimer);
  if (_extWs) {
    _extWs.onclose = null; // prevent auto-reconnect on manual disconnect
    _extWs.close();
    _extWs = null;
  }
  _extWsReady = false;
}

// ── Auth ──────────────────────────────────────────────────────────────────

async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

async function loadProfile(token) {
  return apiGet('/profile/me', token);
}

async function connectExtension(token) {
  // Step 1: get pairing code using user JWT
  const codeData = await apiPost('/extension/pairing-code', {}, token);
  const pairingCode = codeData.pairing_code;

  // Step 2: exchange pairing code for long-lived extension token (no auth header needed)
  const exchangeData = await apiPost('/extension/exchange', {
    pairing_code: pairingCode,
    device_info: { device_name: 'Chrome Extension', user_agent: navigator.userAgent }
  });
  return exchangeData.extension_token;
}

async function pairExtension(pairingCode) {
  const navigatorInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language
  };
  const data = await apiPost('/extension/exchange', {
    pairing_code: pairingCode,
    device_info: navigatorInfo
  }, null);
  return data;
}

// ── Heartbeat ─────────────────────────────────────────────────────────────

function startHeartbeat(extToken) {
  chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
}

function stopHeartbeat() {
  chrome.alarms.clear('heartbeat');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'heartbeat') {
    try {
      const extToken = appState.runtime.extensionToken;
      if (!extToken) return;
      // We don't have a heartbeat endpoint in extension_auth yet, but we will add one, or we can just send ping on the websocket
      // For now, keep the old endpoint or update it. Since we deprecated the old token system, let's change to the new one.
      await apiPost('/extension/heartbeat', { token: extToken });
    } catch (e) {
      console.warn('[SmartApply SW] Heartbeat failed:', e.message);
    }
  }
});

// ── Backend Reports ───────────────────────────────────────────────────────

async function reportStep(step, status, message, data) {
  const extToken = appState.runtime.extensionToken;
  if (!extToken) return;
  try {
    await apiPost('/jobs/extension/report-step', {
      token: extToken,
      session_id: appState.runtime.sessionId,
      step, status, message, data,
    });
  } catch (e) {
    console.warn('[SmartApply SW] Report step failed:', e.message);
  }
}

async function reportResult(resultData) {
  const extToken = appState.runtime.extensionToken;
  if (!extToken) return;
  try {
    await apiPost('/jobs/extension/report-result', {
      token: extToken,
      session_id: appState.runtime.sessionId,
      result: resultData,
    });
  } catch (e) {
    console.warn('[SmartApply SW] Report result failed:', e.message);
  }
}

async function scrapeJobDescription(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Try multiple selectors for LinkedIn JD
        const selectors = [
          '#job-details',
          'article.jobs-description__container',
          '.jobs-description-content__text',
          '.jobs-description__content',
          '.jobs-box__html-content',
          '.jobs-description',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim().length > 50) {
            return el.innerText.trim().substring(0, 5000);
          }
        }
        return '';
      },
    });
    return results?.[0]?.result || '';
  } catch (e) {
    console.warn('[SmartApply SW] JD scrape failed:', e.message);
    return '';
  }
}

// ── URL Builder ───────────────────────────────────────────────────────────

function buildLinkedInSearchUrl(profile, termIndex = -1) {
  const params = new URLSearchParams();

  const terms = profile.search_terms;
  if (Array.isArray(terms) && terms.length > 0) {
    if (termIndex >= 0 && termIndex < terms.length) {
      // Use a single search term for even rotation
      params.set('keywords', terms[termIndex]);
    } else {
      // Fallback: combine all terms (legacy behavior)
      params.set('keywords', terms.join(' OR '));
    }
  } else if (profile.linkedin_headline) {
    const role = profile.linkedin_headline.split(/[|,—\-]/)[0].trim();
    if (role) params.set('keywords', role);
  }

  // Automatically filter to "Easy Apply" jobs
  params.set('f_LF', 'f_AL');

  // Location parameters
  const loc = profile.search_location || profile.current_city || 'India';
  params.set('location', loc);

  const dateMap = {
    'Past 24 hours': 'r86400',
    'Past week':     'r604800',
    'Past month':    'r2592000',
  };
  params.set('f_TPR', dateMap[profile.date_posted] || 'r2592000');

  if (profile.easy_apply_only !== false) {
    params.set('f_LF', 'f_AL');
  }

  const expMap = { 'Internship': '1', 'Entry level': '2', 'Associate': '3', 'Mid-Senior level': '4', 'Director': '5', 'Executive': '6' };
  const expLevels = Array.isArray(profile.experience_level) ? profile.experience_level : [];
  const expCodes = expLevels.map(e => expMap[e]).filter(Boolean);
  if (expCodes.length) params.set('f_E', expCodes.join(','));

  const modeMap = { 'On-site': '1', 'Remote': '2', 'Hybrid': '3' };
  const modes = Array.isArray(profile.on_site) ? profile.on_site : [];
  const modeCodes = modes.map(m => modeMap[m]).filter(Boolean);
  if (modeCodes.length) params.set('f_WT', modeCodes.join(','));

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getLinkedInTabs() {
  return new Promise(resolve =>
    chrome.tabs.query({ url: ['https://www.linkedin.com/*', 'https://linkedin.com/*'] }, resolve)
  );
}

async function broadcastToLinkedIn(message) {
  const tabs = await getLinkedInTabs();
  if (!tabs.length) return;

  if (appState.runtime.activeAutomationTabId && message.type === 'START_AUTOMATION') {
    return;
  }

  // START only on one controlled tab
  if (message.type === 'START_AUTOMATION') {
    const activeTab = tabs.find(t => t.active) || tabs[0];
    appState.runtime.activeAutomationTabId = activeTab.id; // SET LOCK
    saveState();
    chrome.tabs.sendMessage(activeTab.id, message).catch(() => {
      appState.runtime.activeAutomationTabId = null;
      saveState().catch(() => {});
    });
    return;
  }

  // STOP clears the lock
  if (message.type === 'STOP_AUTOMATION' || message.type === 'USER_CANCELLED') {
    appState.runtime.activeAutomationTabId = null; // CLEAR LOCK
    saveState();
  }

  // STOP / PAUSE / RESUME can affect all tabs
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

/**
 * Wait until a tab reaches 'complete' status.
 * Resolves early if tab is already complete.
 */
function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    // Check current status first
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) { resolve(); return; }
      if (tab.status === 'complete') { resolve(); return; }

      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);

      function listener(id, changeInfo) {
        if (id === tabId && changeInfo.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * Ping the content script with retries until it responds.
 * This handles the race between SW sending and content script registering.
 */
async function pingUntilReady(tabId, maxAttempts = 20, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 800);
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (r) => {
          clearTimeout(t);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      if (res && res.ok) {
        console.log(`[SmartApply SW] Content script ready after ${i + 1} attempt(s)`);
        return true;
      }
    } catch (_) {
      // Not ready yet
    }
    await sleep(intervalMs);
  }
  console.error('[SmartApply SW] Content script never responded to PING');
  return false;
}

// ── Navigate → Wait → Ping → Start ───────────────────────────────────────

async function navigateAndStart(state, resumeCounters = null) {
  if (appState.runtime.isStartingAutomation) return;
  appState.runtime.isStartingAutomation = true;
  await saveState();

  try {
    if (appState.runtime.activeAutomationTabId) {
      try {
        await chrome.tabs.get(appState.runtime.activeAutomationTabId);
        // If this is a pagination continuation (resumeCounters exists), we WANT to reuse the tab.
        // If it's a fresh start, the user wants to reuse the open tab. We MUST NOT abort here.
      } catch (e) {
        // Tab is dead, clear stale lock securely
        appState.runtime.activeAutomationTabId = null;
      }
    }

    const terms = state.profile.search_terms;
    const termIndex = state.runtime.currentSearchTermIndex || 0;
    const hasMultipleTerms = Array.isArray(terms) && terms.length > 1;
    const searchUrl = buildLinkedInSearchUrl(state.profile, hasMultipleTerms ? termIndex : -1);
    const currentTerm = hasMultipleTerms ? terms[termIndex] : (Array.isArray(terms) && terms[0]) || 'all terms';
    const totalTerms = terms?.length || 1;
    console.log(`[SmartApply SW] Target URL (term ${termIndex + 1}/${totalTerms}: "${currentTerm}"):`, searchUrl);

    // Save and broadcast active search term for popup display
    state.runtime.currentSearchTerm = currentTerm;
    await saveState();
    chrome.runtime.sendMessage({
      type: 'SEARCH_TERM_UPDATE',
      term: currentTerm,
      index: termIndex,
      total: totalTerms,
    }).catch(() => {});

    notifyPopup('LOG', `🔎 Searching: "${currentTerm}" (${termIndex + 1}/${totalTerms})`);

    // Get or create LinkedIn tab
    const existing = await getLinkedInTabs();
    let tab;
    if (existing.length > 0) {
      tab = existing[0];
      await chrome.tabs.update(tab.id, { url: searchUrl, active: true });
    } else {
      tab = await chrome.tabs.create({ url: searchUrl, active: true });
    }

    const tabId = tab.id;
    appState.runtime.activeAutomationTabId = tabId; // INITIALIZE LOCK
    await saveState();

    // Step 1: Wait for tab to reach 'complete'
    notifyPopup('LOG', 'Waiting for LinkedIn to load…');
    await waitForTabComplete(tabId, 15000);

    // Step 2: Extra wait — LinkedIn is a heavy SPA, JS hydrates after 'complete'
    await sleep(4000);

    notifyPopup('LOG', 'Connecting to page…');

    // Step 3: Ping content script until it responds (retry loop handles the race)
    const ready = await pingUntilReady(tabId, 25, 1000);

    if (!ready) {
      notifyPopup('LOG', '❌ Could not connect to LinkedIn page. Try reloading LinkedIn and clicking Start again.');
      appState.runtime.isRunning = false;
      appState.runtime.activeAutomationTabId = null; // CLEAR LOCK ON FAILURE
      appState.runtime.isStartingAutomation = false;
      await saveState();
      chrome.runtime.sendMessage({ type: 'AUTOMATION_ERROR', error: 'Content script not responding. Reload LinkedIn tab and retry.' }).catch(() => {});
      return;
    }

    // Step 4: Send START_AUTOMATION (include resume counters if switching terms)
    notifyPopup('LOG', '✓ Connected. Starting automation…');

    appState.runtime.isStartingAutomation = false;
    saveState().catch(() => {});

    chrome.tabs.sendMessage(tabId, { type: 'START_AUTOMATION', state, resumeCounters }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[SmartApply SW] START_AUTOMATION failed:', chrome.runtime.lastError.message);
        appState.runtime.activeAutomationTabId = null; // CLEAR LOCK ON SEND FAILURE
        saveState().catch(() => {});
      }
    });
  } catch (err) {
    console.error('[SmartApply SW] navigateAndStart fatal error:', err);
    appState.runtime.activeAutomationTabId = null;
    appState.runtime.isStartingAutomation = false;
    appState.runtime.isRunning = false;
    await saveState();
    chrome.runtime.sendMessage({ type: 'AUTOMATION_ERROR', error: err.message }).catch(() => {});
  }
}

function notifyPopup(type, text) {
  if (type === 'LOG') {
    chrome.runtime.sendMessage({ type: 'POPUP_LOG', text }).catch(() => {});
  }
}

// ── Message Handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ ok: false, error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {

    case 'LOGIN': {
      const { email, password } = message;
      const loginData = await login(email, password);
      
      // FIX: Store token in non-persistent session storage only (Security Hardening)
      appState.runtime.token = loginData.access_token;
      appState.runtime.userEmail = email;

      const profileData = await loadProfile(loginData.access_token);
      const p  = profileData.profile || {};
      const jp = profileData.job_preferences || {};

      appState.profile = {
        ...appState.profile,
        ...p,
        ...jp,
        fullName:         `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        firstName:        p.first_name || '',
        lastName:         p.last_name  || '',
        email:            loginData.user?.email || email,
        phoneCountryCode: p.phone_country_code || '+91',
        phoneNumber:      p.phone_number || '',
        resumePath:       p.resumePath || '',
        resumeUrl:        p.resumeUrl || '',
        resumeFileName:   p.resumeFileName || '',
        resumeMimeType:   p.resumeMimeType || '',
        resumeUploadedAt: p.resumeUploadedAt || '',
      };
      
      console.log('[SmartApply] Resume Sync:', appState.profile.resumePath);

      try {
        const extToken = await connectExtension(loginData.access_token);
        appState.runtime.extensionToken = extToken;
        startHeartbeat(extToken);
      } catch (err) {
        console.warn('[SmartApply] Extension pairing failed (non-fatal):', err.message);
        // Login still succeeds — heartbeat simply won't run until re-paired
      }
      await saveState();
      connectExtensionWebSocket().catch(() => {});

      return { ok: true, user: loginData.user, paired: !!appState.runtime.extensionToken };
    }

    case 'GOOGLE_LOGIN': {
      try {
        // Use native Chrome Identity API for Google Sign-in
        const token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!token) {
              reject(new Error('Failed to retrieve auth token.'));
            } else {
              resolve(token);
            }
          });
        });

        // Send the Google access token to our new backend endpoint
        const loginData = await apiPost('/auth/verify-token', { access_token: token });

        if (!loginData.access_token) {
          return { ok: false, error: 'Failed to authenticate with SmartApply backend.' };
        }

        // Store token
        appState.runtime.token = loginData.access_token;
        appState.runtime.userEmail = loginData.user?.email || '';

        // Load profile (same as email/password login)
        const profileData = await loadProfile(loginData.access_token);
        const p  = profileData.profile || {};
        const jp = profileData.job_preferences || {};

        appState.profile = {
          ...appState.profile,
          ...p,
          ...jp,
          fullName:         `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          firstName:        p.first_name || '',
          lastName:         p.last_name  || '',
          email:            loginData.user?.email || '',
          phoneCountryCode: p.phone_country_code || '+91',
          phoneNumber:      p.phone_number || '',
          resumePath:       p.resumePath || '',
          resumeUrl:        p.resumeUrl || '',
          resumeFileName:   p.resumeFileName || '',
          resumeMimeType:   p.resumeMimeType || '',
          resumeUploadedAt: p.resumeUploadedAt || '',
        };

        // Pair extension (non-fatal)
        try {
          const extToken = await connectExtension(loginData.access_token);
          appState.runtime.extensionToken = extToken;
          startHeartbeat(extToken);
        } catch (err) {
          console.warn('[SmartApply] Extension pairing after Google login failed (non-fatal):', err.message);
        }

        await saveState();
        connectExtensionWebSocket().catch(() => {});
        return { ok: true, user: loginData.user, paired: !!appState.runtime.extensionToken };

      } catch (err) {
        console.error('[SmartApply SW] GOOGLE_LOGIN error:', err);
        if (err.message?.includes('canceled') || err.message?.includes('cancelled') || err.message?.includes('closed')) {
          return { ok: false, error: 'Google sign-in was cancelled.' };
        }
        return { ok: false, error: err.message || 'Google sign-in failed' };
      }
    }

    case 'PAIR_EXTENSION': {
      try {
        const { pairingCode } = message;
        if (!pairingCode) return { ok: false, error: 'Pairing code required' };

        const data = await pairExtension(pairingCode);
        if (!data.extension_token) throw new Error("Invalid response from server");

        appState.runtime.extensionToken = data.extension_token;
        startHeartbeat(data.extension_token);
        await saveState();
        return { ok: true, message: 'Extension paired successfully' };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'LOGOUT': {
      disconnectExtensionWebSocket();
      stopHeartbeat();
      appState = createDefaultState();
      await saveState();
      return { ok: true };
    }

    case 'SYNC_PROFILE': {
      if (message.user) {
        // Update token if provided in sync (session bridge)
        if (message.user.token) {
          appState.runtime.token = message.user.token;
        }

        if (message.user.profile) {
          const p = message.user.profile;
          appState.profile = {
            ...appState.profile,
            ...p,
            resumePath: p.resumePath || '',
            resumeUrl: p.resumeUrl || '',
            resumeFileName: p.resumeFileName || '',
            resumeMimeType: p.resumeMimeType || '',
            resumeUploadedAt: p.resumeUploadedAt || '',
          };
          console.log('[SmartApply] Resume Sync:', appState.profile.resumePath);
        }
        await saveState();
      }
      return { ok: true };
    }

    // ── Secure Authenticated Resume Fetch ─────────────────────────────────
    case 'FETCH_RESUME': {
      const storedSession = await chrome.storage.session.get('userToken');

      const resumeToken =
        storedSession.userToken ||
        appState.runtime.token ||
        appState.runtime.extensionToken;

      if (!resumeToken) {
        console.warn('[SmartApply] Resume fetch failed: Missing auth token');
        return { ok: false, error: 'missing_token' };
      }

      // Direct authenticated resume stream endpoint
      const directUrl = `${API_BASE}/resume/stream-active`;

      let rawBytes = null;
      const maxAttempts = 3;
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const ctrl = new AbortController();

          let timeout;
          let resp;

          try {
            timeout = setTimeout(() => ctrl.abort(), 30000);

            resp = await fetch(directUrl, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${resumeToken}`,
                Accept: 'application/pdf,*/*',
              },
              signal: ctrl.signal,
            });
          } finally {
            if (timeout) clearTimeout(timeout);
          }

          if (resp.status === 401 || resp.status === 403) {
            chrome.runtime.sendMessage({
              type: 'AUTH_EXPIRED',
            }).catch(() => {});

            return {
              ok: false,
              error: 'auth_expired',
              status: resp.status,
            };
          }

          if (resp.status === 404) {
            return {
              ok: false,
              error: 'not_found',
            };
          }

          if (!resp.ok) {
            lastError = `HTTP ${resp.status}`;

            if (attempt < maxAttempts) {
              await sleep(Math.pow(2, attempt) * 1000);
              continue;
            }

            return {
              ok: false,
              error: 'server_error',
              status: resp.status,
            };
          }

          rawBytes = await resp.arrayBuffer();
          break;
        } catch (err) {
          lastError = err?.message || 'Unknown network error';

          console.error(
            '[SmartApply] Resume stream failed:',
            lastError
          );

          if (attempt < maxAttempts) {
            await sleep(Math.pow(2, attempt) * 1000);
            continue;
          }

          return {
            ok: false,
            error: 'network_error',
            detail: lastError,
          };
        }
      }

      if (!rawBytes) {
        return {
          ok: false,
          error: 'max_retries_exceeded',
          detail: lastError,
        };
      }

      try {
        const uint8 = new Uint8Array(rawBytes);

        let binary = '';

        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }

        const base64 = btoa(binary);

        const profile = appState.profile || {};

        const mimeType =
          profile.resumeMimeType ||
          'application/pdf';

        const fileName =
          profile.resumeFileName ||
          'resume.pdf';

        console.log(
          `[SmartApply] Resume fetch success — ${rawBytes.byteLength} bytes, file: ${fileName}`
        );

        return {
          ok: true,
          base64,
          mimeType,
          fileName,
          byteLength: rawBytes.byteLength,
        };
      } catch (err) {
        return {
          ok: false,
          error: 'encode_error',
          detail: err?.message || 'Base64 encoding failed',
        };
      }
    }

    case 'GET_STATE': {
      const stored = await chrome.storage.session.get('userToken');
      // Inject session token into runtime state so popup remains oblivious to storage mechanics
      const enrichedState = JSON.parse(JSON.stringify(appState));
      enrichedState.runtime.token = stored.userToken || '';
      return { ok: true, state: enrichedState };
    }


    case 'SET_SETTINGS': {
      appState.settings = { ...appState.settings, ...message.settings };
      appState.settings.delayBetweenApps = Math.max(3000, appState.settings.delayBetweenApps || 3000);
      await saveState();
      return { ok: true };
    }

    case 'START_AUTOMATION': {
      if (appState.runtime.isRunning) return { ok: false, reason: 'already_running' };
      appState.runtime.isRunning  = true;
      appState.runtime.isPaused   = false;
      appState.runtime.sessionId  = `session_${Date.now()}`;
      appState.runtime.totalApplied  = 0;
      appState.runtime.totalFailed   = 0;
      appState.runtime.totalSkipped  = 0;
      appState.runtime.currentSearchTermIndex = 0;
      appState.runtime.currentSearchTerm = '';
      await saveState();

      navigateAndStart(appState).catch(async (err) => {
        console.error('[SmartApply SW] navigateAndStart error:', err);
        appState.runtime.isRunning = false;
        await saveState();
        chrome.runtime.sendMessage({ type: 'AUTOMATION_ERROR', error: err.message }).catch(() => {});
      });

      return { ok: true };
    }

    case 'STOP_AUTOMATION': {
      appState.runtime.isRunning = false;
      appState.runtime.isPaused  = false;
      await saveState();
      await broadcastToLinkedIn({ type: 'STOP_AUTOMATION' });

      // Notify backend to trigger summary email
      const token = appState.runtime.token;
      if (token) {
        apiPost('/automation/stop', {}, token).catch(e => console.warn('[SmartApply] Backend stop failed:', e.message));
      }
      return { ok: true };
    }

    case 'PAUSE_AUTOMATION': {
      appState.runtime.isPaused = true;
      await saveState();
      await broadcastToLinkedIn({ type: 'PAUSE_AUTOMATION' });
      return { ok: true };
    }

    case 'RESUME_AUTOMATION': {
      appState.runtime.isPaused = false;
      await saveState();
      await broadcastToLinkedIn({ type: 'RESUME_AUTOMATION' });
      return { ok: true };
    }

    case 'USER_CONFIRMED': {
      await broadcastToLinkedIn({ type: 'USER_CONFIRMED' });
      return { ok: true };
    }

    case 'USER_CANCELLED': {
      await broadcastToLinkedIn({ type: 'USER_CANCELLED' });
      return { ok: true };
    }

    case 'LOG_STEP': {
      const { step, status, message: msg, data } = message.payload;
      await reportStep(step, status, msg, data);
      return { ok: true };
    }

    case 'REPORT_RESULT': {
      const result = message.payload;
      // Scrape job description from the active tab if not already present
      if (!result.job_description && appState.runtime.activeAutomationTabId) {
        try {
          const jd = await scrapeJobDescription(appState.runtime.activeAutomationTabId);
          if (jd) result.job_description = jd;
        } catch (e) {
          console.warn('[SmartApply SW] JD scrape on report failed:', e.message);
        }
      }
      await reportResult(result);
      chrome.runtime.sendMessage({ type: 'RESULT_UPDATE', payload: result }).catch(() => {});
      return { ok: true };
    }

    case 'NEEDS_CONFIRMATION': {
      pendingConfirmation = message.jobInfo;
      chrome.runtime.sendMessage({ type: 'SHOW_CONFIRM', jobInfo: message.jobInfo }).catch(() => {});
      return { ok: true };
    }

    case 'STATE_CHANGED': {
      appState.runtime.currentStep = message.state;
      await saveState();
      chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state: message.state }).catch(() => {});
      return { ok: true };
    }

    case 'PRE_APPLY_SCORE': {
      const stored = await chrome.storage.session.get('userToken');
      const token = stored.userToken || appState.runtime.token;
      if (!token) return { ok: false, eligible: false, score: 0, reason: 'not_logged_in' };

      try {
        const response = await apiPost('/ai/pre-apply-score', {
          job_description: message.job_description || '',
          job_title: message.job_title || '',
          company: message.company || '',
        }, token);

        return {
          ok: true,
          eligible: !!response.eligible,
          score: response.score || 0,
          matched_skills: response.matched_skills || [],
          missing_skills: response.missing_skills || [],
          skill_gap: response.skill_gap || {},
          reason: response.reason || 'unknown',
          summary: response.summary || '',
        };
      } catch (err) {
        console.error('[SmartApply SW] PRE_APPLY_SCORE error:', err);
        return { ok: false, eligible: false, score: 0, reason: 'network_error', error: err.message };
      }
    }

    case 'SCORE_JOB': {
      // Triggered by content script when user views a job. Debounced by JD hash.
      const stored = await chrome.storage.session.get('userToken');
      const token = stored.userToken || appState.runtime.token;
      if (!token) break;

      const jd = (message.job_description || '').trim();
      if (!jd || jd.length < 80) break;

      // Debounce: skip if same JD scored within last 60s
      const jdHash = jd.slice(0, 120);
      if (_lastScoredJdHash === jdHash) break;
      _lastScoredJdHash = jdHash;
      setTimeout(() => { _lastScoredJdHash = ''; }, 60000);

      // Fire-and-forget background scoring
      (async () => {
        try {
          const result = await apiPost(
            '/ai/pre-apply-score',
            {
              job_description: jd,
              job_title: message.job_title || '',
              company: message.company || '',
            },
            token
          );

          // Forward score to popup immediately (popup listens for WS_EVENT)
          chrome.runtime.sendMessage({
            type: 'WS_EVENT',
            event: {
              type: 'MATCH_SCORE',
              payload: {
                score: result.score || 0,
                eligible: !!result.eligible,
                matched_skills: result.matched_skills || [],
                missing_skills: result.missing_skills || [],
                job_title: message.job_title || '',
                company: message.company || '',
                source: 'live_browse',
              },
              timestamp: new Date().toISOString(),
            },
          }).catch(() => {});
          // Note: backend already pushes MATCH_SCORE via WebSocket to the website dashboard
          // inside /api/ai/pre-apply-score after CHANGE 3 is applied.
        } catch (e) {
          console.warn('[SmartApply] SCORE_JOB failed:', e.message);
        }
      })();
      break;
    }

    case 'HIGH_MATCH_FAILED': {
      // A high-match job (>= 75%) failed to apply — notify user via backend
      const stored = await chrome.storage.session.get('userToken');
      const token = stored.userToken || appState.runtime.token;
      if (!token) break;

      (async () => {
        try {
          await apiPost('/ai/high-match-failed', {
            job_title: message.job_title || '',
            company: message.company || '',
            job_url: message.job_url || '',
            match_score: message.match_score || 0,
            error_detail: message.error_detail || '',
          }, token);
          console.log('[SmartApply] HIGH_MATCH_FAILED notification sent');
        } catch (e) {
          console.warn('[SmartApply] HIGH_MATCH_FAILED notify failed:', e.message);
        }
      })();
      break;
    }

    case 'ASK_AI_QUESTION': {
      const stored = await chrome.storage.session.get('userToken');
      const token = stored.userToken || appState.runtime.token;
      if (!token) return { ok: false, error: 'Not logged in' };

      try {
        const p = message.profile || {};
        const safeProfile = {
          first_name: p.first_name,
          last_name: p.last_name,
          fullName: p.fullName,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone_number: p.phone_number,
          phone_country_code: p.phone_country_code,
          phoneNumber: p.phoneNumber,
          phoneCountryCode: p.phoneCountryCode,
          years_of_experience: p.years_of_experience,
          current_city: p.current_city,
          desired_salary: p.desired_salary,
          current_ctc: p.current_ctc,
          notice_period: p.notice_period,
          available_date: p.available_date,
          require_visa: p.require_visa,
          work_authorization: p.work_authorization,
          us_citizenship: p.us_citizenship,
          willing_to_relocate: p.willing_to_relocate,
          highest_degree: p.highest_degree,
          degree: p.degree,
          education: p.education,
          gpa: p.gpa,
          cgpa: p.cgpa,
          graduation_year: p.graduation_year,
          major: p.major,
          field_of_study: p.field_of_study,
          university: p.university,
          college: p.college,
          certifications: p.certifications,
          cover_letter: p.cover_letter,
          linkedin_profile: p.linkedin_profile,
          github: p.github,
          website: p.website,
          portfolio: p.portfolio,
          disability_status: p.disability_status,
          veteran_status: p.veteran_status,
          gender: p.gender,
          ethnicity: p.ethnicity,
          language_proficiency: p.language_proficiency,
          date_of_birth: p.date_of_birth,
          age: p.age,
          dynamic_answers: { ...(p.answers || {}), ...(p.dynamic_answers || {}) }
        };

        const userInfo = `Resume/Profile Context:\n${JSON.stringify(safeProfile, null, 2)}`;
        
        const system_prompt = `You are filling a job application form.
Rules:
- Answer ONLY based on provided profile/resume context.
- Return ONLY the answer value as plain string, nothing else.
- No explanations, no markdown, no punctuation around the answer.
- If answer not in profile, return empty string "".
- Never invent or assume data.
- For Yes/No questions return exactly "Yes" or "No".
- For number fields return only the number.
- For dropdown fields return exactly one of the available_options values.`;

        const response = await apiPost('/ai/answer-screening-question', {
          question: message.question,
          user_info: userInfo,
          job_description: message.jobDescription || '',
          field_type: message.fieldType || '',
          available_options: message.availableOptions || [],
          system_prompt: system_prompt
        }, token);

        return { ok: true, answer: response.answer };
      } catch (err) {
        console.error('[SmartApply SW] ASK_AI_QUESTION error:', err);
        return { ok: false, error: err.message };
      }
    }

    case 'ASK_AI_BATCH': {
      const stored2 = await chrome.storage.session.get('userToken');
      const token2 = stored2.userToken || appState.runtime.token;
      if (!token2) return { ok: false, error: 'Not logged in', answers: {} };

      try {
        const p = message.profile || {};
        const safeProfile = {
          first_name: p.first_name,
          last_name: p.last_name,
          fullName: p.fullName,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone_number: p.phone_number,
          phone_country_code: p.phone_country_code,
          phoneNumber: p.phoneNumber,
          phoneCountryCode: p.phoneCountryCode,
          years_of_experience: p.years_of_experience,
          current_city: p.current_city,
          desired_salary: p.desired_salary,
          current_ctc: p.current_ctc,
          notice_period: p.notice_period,
          available_date: p.available_date,
          require_visa: p.require_visa,
          work_authorization: p.work_authorization,
          us_citizenship: p.us_citizenship,
          willing_to_relocate: p.willing_to_relocate,
          highest_degree: p.highest_degree,
          degree: p.degree,
          education: p.education,
          gpa: p.gpa,
          cgpa: p.cgpa,
          graduation_year: p.graduation_year,
          major: p.major,
          field_of_study: p.field_of_study,
          university: p.university,
          college: p.college,
          certifications: p.certifications,
          cover_letter: p.cover_letter,
          linkedin_profile: p.linkedin_profile,
          github: p.github,
          website: p.website,
          portfolio: p.portfolio,
          disability_status: p.disability_status,
          veteran_status: p.veteran_status,
          gender: p.gender,
          ethnicity: p.ethnicity,
          language_proficiency: p.language_proficiency,
          date_of_birth: p.date_of_birth,
          age: p.age,
          dynamic_answers: { ...(p.answers || {}), ...(p.dynamic_answers || {}) }
        };

        const userInfo = `Resume/Profile Context:\n${JSON.stringify(safeProfile, null, 2)}`;
        
        const system_prompt = `You are filling a job application form.
Rules:
- Answer ONLY based on provided profile/resume context.
- Return ONLY the answer value as plain string, nothing else.
- No explanations, no markdown, no punctuation around the answer.
- If answer not in profile, return empty string "".
- Never invent or assume data.
- For Yes/No questions return exactly "Yes" or "No".
- For number fields return only the number.
- For dropdown fields return exactly one of the available_options values.`;

        const response = await apiPost('/ai/answer-screening-batch', {
          questions: message.questions,
          user_info: userInfo,
          job_description: message.jobDescription || '',
          system_prompt: system_prompt
        }, token2);

        return { ok: true, answers: response.answers || {} };
      } catch (err) {
        console.error('[SmartApply SW] ASK_AI_BATCH error:', err);
        return { ok: false, error: err.message, answers: {} };
      }
    }

    case 'PROGRESS_UPDATE': {
      const { totalApplied, totalFailed, totalSkipped } = message.payload;
      appState.runtime.totalApplied  = totalApplied;
      appState.runtime.totalFailed   = totalFailed;
      appState.runtime.totalSkipped  = totalSkipped;
      await saveState();
      chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', payload: message.payload }).catch(() => {});
      return { ok: true };
    }

    case 'AUTOMATION_FINISHED': {
      appState.runtime.isRunning = false;
      await saveState();
      chrome.runtime.sendMessage({ type: 'AUTOMATION_FINISHED', payload: message.payload }).catch(() => {});

      // Notify backend to trigger summary email
      const token = appState.runtime.token;
      if (token) {
        apiPost('/automation/stop', {}, token).catch(e => console.warn('[SmartApply] Backend finish notification failed:', e.message));
      }
      return { ok: true };
    }

    case 'SWITCH_SEARCH_TERM': {
      const terms = appState.profile.search_terms;
      if (!Array.isArray(terms) || terms.length <= 1) {
        return { ok: false, reason: 'single_term' };
      }

      // Increment term index (wrap around)
      const nextIndex = ((appState.runtime.currentSearchTermIndex || 0) + 1) % terms.length;
      appState.runtime.currentSearchTermIndex = nextIndex;

      // Carry over cumulative counters from content script
      const counters = message.counters || {};
      appState.runtime.totalApplied  = counters.totalApplied  || appState.runtime.totalApplied;
      appState.runtime.totalFailed   = counters.totalFailed   || appState.runtime.totalFailed;
      appState.runtime.totalSkipped  = counters.totalSkipped  || appState.runtime.totalSkipped;
      await saveState();

      const nextTerm = terms[nextIndex];
      appState.runtime.currentSearchTerm = nextTerm;
      console.log(`[SmartApply SW] Switching to search term ${nextIndex + 1}/${terms.length}: "${nextTerm}"`);
      notifyPopup('LOG', `🔄 Switching to: "${nextTerm}" (${nextIndex + 1}/${terms.length})`);

      // Navigate and restart with resumed counters
      navigateAndStart(appState, {
        totalApplied: appState.runtime.totalApplied,
        totalFailed: appState.runtime.totalFailed,
        totalSkipped: appState.runtime.totalSkipped,
      }).catch(async (err) => {
        console.error('[SmartApply SW] SWITCH_SEARCH_TERM navigateAndStart error:', err);
        appState.runtime.isRunning = false;
        await saveState();
        chrome.runtime.sendMessage({ type: 'AUTOMATION_ERROR', error: err.message }).catch(() => {});
      });

      return { ok: true };
    }

    case 'CONTENT_READY': {
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

// ── External Messages ─────────────────────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ok: true, version: '1.0.0' });
    return;
  }
  if (message.type === 'SCRAPE_LINKEDIN') {
    getLinkedInTabs().then(async (tabs) => {
      if (!tabs.length) return sendResponse({ ok: false, error: 'no_linkedin_tab' });
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_LINKEDIN' }, sendResponse);
    });
    return true;
  }
  if (message.type === 'GET_COOKIES') {
    chrome.cookies.getAll({ domain: '.linkedin.com' }, (cookies) => {
      sendResponse({ ok: true, cookies });
    });
    return true;
  }
  if (message.type === 'SYNC_PROFILE') {
    if (message.user && message.user.profile) {
      const p = message.user.profile;
      appState.profile = {
        ...appState.profile,
        ...p,
        resumePath: p.resumePath || '',
        resumeUrl: p.resumeUrl || '',
        resumeFileName: p.resumeFileName || '',
        resumeMimeType: p.resumeMimeType || '',
        resumeUploadedAt: p.resumeUploadedAt || '',
      };
      console.log('[SmartApply] External Resume Sync:', appState.profile.resumePath);
      saveState().catch(() => {});
    }
    sendResponse({ ok: true });
    return;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (appState.runtime.activeAutomationTabId === tabId) {
    appState.runtime.activeAutomationTabId = null;
    saveState().catch(() => {});
  }
});

// ── Init ──────────────────────────────────────────────────────────────────

(async () => {
  await loadState();
  if (appState.runtime.extensionToken) startHeartbeat(appState.runtime.extensionToken);
  // Reconnect WebSocket if already logged in
  if (appState.runtime.token) {
    connectExtensionWebSocket().catch(() => {});
  }
  console.log('[SmartApply SW] Initialized');
})();

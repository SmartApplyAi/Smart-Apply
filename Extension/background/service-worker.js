// ── SmartApply Background Service Worker ─────────────────────────────────

import { createDefaultState } from '../shared/schemas.js';
import { HEARTBEAT_INTERVAL, API_BASE } from '../shared/constants.js';

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
  }
}

async function loadState() {
  const result = await chrome.storage.local.get('appState');
  const sessionResult = await chrome.storage.session.get('userToken');
  if (result.appState) {
    appState = { ...createDefaultState(), ...result.appState };
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
      await apiPost('/extension/heartbeat', { token: extToken }, null);
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
    const role = (profile.linkedin_headline || '').split(/[|,—\-]/)[0].trim();
    if (role) params.set('keywords', role);
  }

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
  const expLevels = Array.isArray(profile.experience_level) ? profile.experience_level : (profile.exp_level ? [profile.exp_level] : []);
  const expCodes = expLevels.map(e => expMap[e]).filter(Boolean);
  if (expCodes.length) params.set('f_E', expCodes.join(','));

  const modeMap = { 'On-site': '1', 'Remote': '2', 'Hybrid': '3' };
  const modes = Array.isArray(profile.on_site) ? profile.on_site : (profile.work_mode ? [profile.work_mode] : []);
  const modeCodes = modes.map(m => modeMap[m]).filter(Boolean);
  if (modeCodes.length) params.set('f_WT', modeCodes.join(','));

  const finalUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  console.log('[SmartApply SW] Generated Search URL:', finalUrl);
  return finalUrl;
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

async function getNaukriTabs() {
  return new Promise(resolve =>
    chrome.tabs.query({ url: ['https://www.naukri.com/*', 'https://naukri.com/*'] }, resolve)
  );
}

async function broadcastToNaukri(message) {
  const tabs = await getNaukriTabs();
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

  console.log('[SmartApply SW] navigateAndStart triggered');
  notifyPopup('LOG', 'Initializing automation...');

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
    console.log(`[SmartApply SW] Starting search for: "${currentTerm}"`);
    
    notifyPopup('LOG', `🔎 Searching: "${currentTerm}" (${termIndex + 1}/${totalTerms})`);

    // Save and broadcast active search term for popup display
    state.runtime.currentSearchTerm = currentTerm;
    await saveState();

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
    chrome.tabs.sendMessage(tabId, { type: 'START_AUTOMATION', state, resumeCounters }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[SmartApply SW] START_AUTOMATION failed:', chrome.runtime.lastError.message);
        appState.runtime.activeAutomationTabId = null; // CLEAR LOCK ON SEND FAILURE
      }
      appState.runtime.isStartingAutomation = false;
      saveState().catch(() => {});
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

function notifyNaukriPopup(type, text) {
  if (type === 'LOG') {
    chrome.runtime.sendMessage({ type: 'NAUKRI_POPUP_LOG', text }).catch(() => {});
  }
}

// ── Naukri URL Builder ────────────────────────────────────────────────────

function buildNaukriSearchUrl(profile, termIndex = -1) {
  const terms = profile.search_terms;
  let keyword = '';
  if (Array.isArray(terms) && terms.length > 0) {
    if (termIndex >= 0 && termIndex < terms.length) {
      keyword = terms[termIndex];
    } else {
      keyword = terms[0];
    }
  }
  const loc = profile.search_location || profile.current_city || 'India';
  // Naukri URL format: https://www.naukri.com/keyword-jobs-in-location
  const kwSlug = keyword.trim().toLowerCase().replace(/\s+/g, '-');
  const locSlug = loc.trim().toLowerCase().replace(/\s+/g, '-');
  let url = `https://www.naukri.com/${kwSlug}-jobs-in-${locSlug}`;
  // Add experience parameter if available
  const exp = profile.years_of_experience || '0';
  url += `?experience=${exp}`;
  return url;
}

// ── Naukri Navigate & Start ───────────────────────────────────────────────

async function navigateAndStartNaukri(state, resumeCounters = null) {
  const terms = state.profile.search_terms;
  const termIndex = state.naukriRuntime.currentSearchTermIndex || 0;
  const hasMultipleTerms = Array.isArray(terms) && terms.length > 1;
  const searchUrl = buildNaukriSearchUrl(state.profile, hasMultipleTerms ? termIndex : 0);
  const currentTerm = (Array.isArray(terms) && terms[termIndex]) || 'all terms';
  console.log(`[SmartApply SW] Naukri URL: ${searchUrl}`);

  state.naukriRuntime.currentSearchTerm = currentTerm;
  await saveState();

  notifyNaukriPopup('LOG', `🔎 Searching Naukri: "${currentTerm}"`);

  const existing = await getNaukriTabs();
  let tab;
  if (existing.length > 0) {
    tab = existing[0];
    await chrome.tabs.update(tab.id, { url: searchUrl, active: true });
  } else {
    tab = await chrome.tabs.create({ url: searchUrl, active: true });
  }

  const tabId = tab.id;
  notifyNaukriPopup('LOG', 'Waiting for Naukri to load…');
  await waitForTabComplete(tabId, 15000);
  await sleep(4000);

  notifyNaukriPopup('LOG', 'Connecting to page…');
  const ready = await pingUntilReady(tabId, 25, 1000);

  if (!ready) {
    notifyNaukriPopup('LOG', '❌ Could not connect to Naukri page.');
    appState.naukriRuntime.isRunning = false;
    await saveState();
    chrome.runtime.sendMessage({ type: 'NAUKRI_AUTOMATION_ERROR', error: 'Content script not responding.' }).catch(() => {});
    return;
  }

  notifyNaukriPopup('LOG', '✓ Connected. Starting Naukri automation…');
  chrome.tabs.sendMessage(tabId, { type: 'START_NAUKRI_AUTOMATION', state, resumeCounters }, (res) => {
    if (chrome.runtime.lastError) {
      console.error('[SmartApply SW] START_NAUKRI_AUTOMATION failed:', chrome.runtime.lastError.message);
    }
  });
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
      appState.runtime.token = loginData.access_token;
      appState.runtime.userEmail = email;

      const profileData = await loadProfile(loginData.access_token);
      const p  = profileData.profile || {};
      const jp = profileData.job_preferences || {};
      const pa = profileData.platform_accounts || {};

      appState.profile = {
        ...appState.profile,
        ...p,
        ...jp,
        // Convenience aliases for content script form filling
        fullName:              `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        firstName:             p.first_name || '',
        lastName:              p.last_name  || '',
        email:                 p.linkedin_email || loginData.user?.email || email,
        phoneCountryCode:      p.phone_country_code || '+91',
        phoneNumber:           p.phone_number || '',
        // Field name aliases (backend uses different keys)
        zip_code:              p.zipcode || p.zip_code || '',
        pincode:               p.zipcode || p.zip_code || '',
        // Education fields (not directly stored — parsed from education_text)
        highest_degree:        p.highest_degree || p.degree || '',
        degree:                p.degree || p.highest_degree || '',
        university:            p.university || p.college || '',
        college:               p.college || p.university || '',
        graduation_year:       p.graduation_year || '',
        major:                 p.major || p.field_of_study || '',
        field_of_study:        p.field_of_study || p.major || '',
        gpa:                   p.gpa || p.cgpa || '',
        cgpa:                  p.cgpa || p.gpa || '',
        certifications:        p.certifications || '',
        // Work/immigration fields
        work_authorization:    p.work_authorization || p.us_citizenship || '',
        willing_to_relocate:   p.willing_to_relocate || 'Yes',
        available_date:        p.available_date || 'Immediately',
        language_proficiency:  p.language_proficiency || 'Professional',
        // Other missing fields
        portfolio:             p.portfolio || p.website || '',
        date_of_birth:         p.date_of_birth || '',
        age:                   p.age || '',
      };

      // Fetch active resume from R2
      try {
        const resumeData = await apiGet('/resume/list', loginData.access_token);
        const activeResume = resumeData.resumes?.find(r => r.is_active);
        if (activeResume) {
          appState.profile.resume_url = `${API_BASE}/resume/download/${activeResume.object_key}`;
          appState.profile.resume_key = activeResume.object_key;
          appState.profile.resume_name = activeResume.filename;
        }
      } catch (err) {
        console.warn('[SmartApply SW] Failed to fetch resumes:', err.message);
      }

      // ConnectExtension removed. We no longer auto-pair via web login credentials
      // The user must manually enter a pairing code from the web UI to link the extension
      return { ok: true, user: loginData.user, paired: false };
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
      stopHeartbeat();
      appState = createDefaultState();
      await saveState();
      return { ok: true };
    }

    case 'GET_STATE':    return { ok: true, state: appState };

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

      // Ensure resume info is fetched if missing (e.g. if user was already logged in)
      if (!appState.profile.resume_url && appState.runtime.token) {
        try {
          const resumeData = await apiGet('/resume/list', appState.runtime.token);
          const activeResume = resumeData.resumes?.find(r => r.is_active);
          if (activeResume) {
            appState.profile.resume_url = `${API_BASE}/resume/download/${activeResume.object_key}`;
            appState.profile.resume_name = activeResume.filename;
            appState.profile.resume_key = activeResume.object_key;
            await saveState();
          }
        } catch (err) {
          console.warn('[SmartApply SW] Resume fetch fallback failed:', err.message);
        }
      }

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
          // Critical context fields for AI accuracy
          skills_summary: p.skills_summary,
          education_text: p.education_text,
          experience_text: p.experience_text,
          linkedin_headline: p.linkedin_headline,
          linkedin_summary: p.linkedin_summary,
          recent_employer: p.recent_employer,
          zip_code: p.zipcode || p.zip_code,
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
          dynamic_answers: { ...(p.answers || {}), ...(p.dynamic_answers || {}) },
          // Critical context fields for AI accuracy
          skills_summary: p.skills_summary,
          education_text: p.education_text,
          experience_text: p.experience_text,
          linkedin_headline: p.linkedin_headline,
          linkedin_summary: p.linkedin_summary,
          recent_employer: p.recent_employer,
          zip_code: p.zipcode || p.zip_code,
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
      return { ok: true };
    }

    case 'SWITCH_SEARCH_TERM': {
      const terms = appState.profile.search_terms;
      if (!Array.isArray(terms) || terms.length <= 1) {
        return { ok: false, reason: 'single_term' };
      }

      // Increment term index
      const nextIndex = (appState.runtime.currentSearchTermIndex || 0) + 1;
      
      if (nextIndex >= terms.length) {
        console.log('[SmartApply SW] All search terms processed for LinkedIn.');
        notifyPopup('LOG', '✅ All search terms processed. Automation finished.');
        appState.runtime.isRunning = false;
        await saveState();
        chrome.runtime.sendMessage({ type: 'AUTOMATION_FINISHED' }).catch(() => {});
        return { ok: true };
      }
      
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

    // ── Naukri Automation Messages ─────────────────────────────────────────

    case 'START_NAUKRI_AUTOMATION': {
      if (appState.naukriRuntime.isRunning) return { ok: false, reason: 'already_running' };
      appState.naukriRuntime.isRunning  = true;
      appState.naukriRuntime.isPaused   = false;
      appState.naukriRuntime.sessionId  = `naukri_${Date.now()}`;
      appState.naukriRuntime.totalApplied  = 0;
      appState.naukriRuntime.totalFailed   = 0;
      appState.naukriRuntime.totalSkipped  = 0;
      appState.naukriRuntime.currentSearchTermIndex = 0;
      appState.naukriRuntime.currentSearchTerm = '';
      await saveState();

      navigateAndStartNaukri(appState).catch(async (err) => {
        console.error('[SmartApply SW] navigateAndStartNaukri error:', err);
        appState.naukriRuntime.isRunning = false;
        await saveState();
        chrome.runtime.sendMessage({ type: 'NAUKRI_AUTOMATION_ERROR', error: err.message }).catch(() => {});
      });

      return { ok: true };
    }

    case 'STOP_NAUKRI_AUTOMATION': {
      appState.naukriRuntime.isRunning = false;
      appState.naukriRuntime.isPaused  = false;
      await saveState();
      await broadcastToNaukri({ type: 'STOP_NAUKRI_AUTOMATION' });
      return { ok: true };
    }

    case 'PAUSE_NAUKRI_AUTOMATION': {
      appState.naukriRuntime.isPaused = true;
      await saveState();
      await broadcastToNaukri({ type: 'PAUSE_NAUKRI_AUTOMATION' });
      return { ok: true };
    }

    case 'RESUME_NAUKRI_AUTOMATION': {
      appState.naukriRuntime.isPaused = false;
      await saveState();
      await broadcastToNaukri({ type: 'RESUME_NAUKRI_AUTOMATION' });
      return { ok: true };
    }

    case 'NAUKRI_PROGRESS_UPDATE': {
      const { totalApplied, totalFailed, totalSkipped } = message.payload;
      appState.naukriRuntime.totalApplied  = totalApplied;
      appState.naukriRuntime.totalFailed   = totalFailed;
      appState.naukriRuntime.totalSkipped  = totalSkipped;
      await saveState();
      chrome.runtime.sendMessage({ type: 'NAUKRI_PROGRESS_UPDATE', payload: message.payload }).catch(() => {});
      return { ok: true };
    }

    case 'NAUKRI_REPORT_RESULT': {
      const result = message.payload;
      await reportResult(result);
      chrome.runtime.sendMessage({ type: 'NAUKRI_REPORT_RESULT', payload: result }).catch(() => {});
      return { ok: true };
    }

    case 'NAUKRI_AUTOMATION_FINISHED': {
      appState.naukriRuntime.isRunning = false;
      await saveState();
      chrome.runtime.sendMessage({ type: 'NAUKRI_AUTOMATION_FINISHED', payload: message.payload }).catch(() => {});
      return { ok: true };
    }

    case 'SWITCH_NAUKRI_SEARCH_TERM': {
      const terms = appState.profile.search_terms;
      if (!Array.isArray(terms) || terms.length <= 1) {
        return { ok: false, reason: 'single_term' };
      }

      // Increment term index
      const nextIndex = (appState.naukriRuntime.currentSearchTermIndex || 0) + 1;

      if (nextIndex >= terms.length) {
        console.log('[SmartApply SW] All search terms processed for Naukri.');
        notifyNaukriPopup('LOG', '✅ All search terms processed. Naukri automation finished.');
        appState.naukriRuntime.isRunning = false;
        await saveState();
        chrome.runtime.sendMessage({ type: 'NAUKRI_AUTOMATION_FINISHED' }).catch(() => {});
        return { ok: true };
      }

      appState.naukriRuntime.currentSearchTermIndex = nextIndex;

      // Carry over cumulative counters from content script
      const counters = message.counters || {};
      appState.naukriRuntime.totalApplied = counters.totalApplied || appState.naukriRuntime.totalApplied;
      appState.naukriRuntime.totalFailed  = counters.totalFailed  || appState.naukriRuntime.totalFailed;
      appState.naukriRuntime.totalSkipped = counters.totalSkipped || appState.naukriRuntime.totalSkipped;
      await saveState();

      const nextTerm = terms[nextIndex];
      appState.naukriRuntime.currentSearchTerm = nextTerm;
      console.log(`[SmartApply SW] Switching Naukri to search term ${nextIndex + 1}/${terms.length}: "${nextTerm}"`);
      notifyNaukriPopup('LOG', `🔄 Switching to: "${nextTerm}" (${nextIndex + 1}/${terms.length})`);

      // Navigate and restart with resumed counters
      navigateAndStartNaukri(appState, {
        totalApplied: appState.naukriRuntime.totalApplied,
        totalFailed: appState.naukriRuntime.totalFailed,
        totalSkipped: appState.naukriRuntime.totalSkipped,
      }).catch(async (err) => {
        console.error('[SmartApply SW] SWITCH_NAUKRI_SEARCH_TERM navigateAndStartNaukri error:', err);
        appState.naukriRuntime.isRunning = false;
        await saveState();
        chrome.runtime.sendMessage({ type: 'NAUKRI_AUTOMATION_ERROR', error: err.message }).catch(() => {});
      });

      return { ok: true };
    }

    case 'NAUKRI_POPUP_LOG': {
      chrome.runtime.sendMessage({ type: 'NAUKRI_POPUP_LOG', text: message.text }).catch(() => {});
      return { ok: true };
    }

    case 'NAUKRI_CONTENT_READY': {
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
  console.log('[SmartApply SW] Initialized');
})();

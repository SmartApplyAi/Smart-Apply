// ── SmartApply Naukri Content Script ─────────────────────────────────
(function () {
"use strict";

// ── Constants ────────────────────────────────────────────────────────
const PREFIX = '[SmartApply-Naukri]';
const DELAYS = { SHORT: 500, MEDIUM: 1000, LONG: 2000, EXTRA_LONG: 3000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const logger = {
  info:  (msg, ...a) => { console.log(`${PREFIX} ℹ️ ${msg}`, ...a);  appendLog(`ℹ️ ${msg}`, 'info'); },
  success:(msg,...a) => { console.log(`${PREFIX} ✅ ${msg}`, ...a); appendLog(`✅ ${msg}`, 'success'); },
  warn:  (msg, ...a) => { console.warn(`${PREFIX} ⚠️ ${msg}`, ...a); appendLog(`⚠️ ${msg}`, 'warn'); },
  error: (msg, ...a) => { console.error(`${PREFIX} ❌ ${msg}`, ...a); appendLog(`❌ ${msg}`, 'error'); },
};

function appendLog(text, type) {
  const feed = document.getElementById('smartapply-naukri-log-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.style.cssText = 'margin-bottom:6px;font-size:12px;line-height:1.4;word-break:break-word;font-family:system-ui,sans-serif;';
  el.style.color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#7ee8a2' : type === 'warn' ? '#f5c05c' : '#c1c1c4';
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  while (feed.children.length > 80) feed.removeChild(feed.firstChild);
}

// ── Naukri Selectors (text & attribute based for resilience) ─────────

function findJobCards() {
  // Naukri uses article elements or divs with job tuple classes
  const selectors = [
    'article.jobTuple',
    '.srp-jobtuple-wrapper',
    '[data-job-id]',
    '.jobTupleHeader',
    '.cust-job-tuple',
    '.list > article',
  ];
  for (const sel of selectors) {
    const cards = document.querySelectorAll(sel + ':not([data-sa-processed])');
    if (cards.length) return Array.from(cards);
  }
  // Fallback: find any container that has an "Apply" button descendant
  const allArticles = document.querySelectorAll('article:not([data-sa-processed])');
  if (allArticles.length) return Array.from(allArticles);
  return [];
}

function getJobTitle(card) {
  const el = card.querySelector('a.title, .jobTuple a.title, .row1 a, a[class*="title"], h2 a, .info h2 a, a.desig');
  return el?.textContent?.trim() || '';
}

function getCompany(card) {
  const el = card.querySelector('.comp-name, .companyInfo a, a[class*="comp"], .subTitle a, .info .comp-name');
  return el?.textContent?.trim() || '';
}

function getJobLink(card) {
  const el = card.querySelector('a.title, a[class*="title"], h2 a, a[href*="/job-listings"]');
  return el?.href || '';
}

function findApplyButton(container) {
  // Find the Apply / Quick Apply button within a container
  const btns = Array.from(container.querySelectorAll('button, a.apply-btn, a[class*="apply"], .apply-btn'));
  // Prefer buttons with "Apply" text
  let btn = btns.find(b => {
    const t = b.textContent.trim().toLowerCase();
    return t === 'apply' || t === 'apply now' || t === 'quick apply' || t.includes('apply on naukri');
  });
  if (btn) return btn;
  // Fallback: any element with apply-related class
  btn = container.querySelector('[class*="apply-button"], [class*="applyBtn"], [id*="apply"]');
  return btn || null;
}

function findApplyOnPage() {
  // When on a job detail page, find the main apply button
  const btns = Array.from(document.querySelectorAll('button, a'));
  return btns.find(b => {
    const t = b.textContent.trim().toLowerCase();
    const cl = (b.className || '').toLowerCase();
    return (t === 'apply' || t === 'apply now' || t === 'quick apply' || cl.includes('apply-btn') || cl.includes('applybtn'));
  }) || null;
}

function isExternalApply(btn) {
  if (!btn) return true;
  const t = btn.textContent.trim().toLowerCase();
  return t.includes('apply on company') || t.includes('external') || t.includes('company site');
}

function isAlreadyApplied(card) {
  const text = card.textContent.toLowerCase();
  return text.includes('already applied') || text.includes('applied ') ||
    !!card.querySelector('[class*="applied"], [class*="alreadyApplied"]');
}

// ── Modal / Form Handling ────────────────────────────────────────────

async function handleNaukriApplyModal() {
  // Wait for any modal/overlay to appear
  await sleep(1500);

  // Check for Naukri's chatbot or popup overlays and close them
  await dismissOverlays();

  // Look for a modal or inline form
  const modal = document.querySelector('[class*="chatbot"], [class*="apply-modal"], [role="dialog"], .modal-content, .apply-form');
  if (modal) {
    logger.info('Apply modal/form detected');
    // Try to fill any visible form fields
    await fillNaukriForm(modal);
    // Click submit if available
    const submitBtn = Array.from(modal.querySelectorAll('button')).find(b =>
      b.textContent.trim().toLowerCase().includes('submit') || b.textContent.trim().toLowerCase().includes('apply')
    );
    if (submitBtn) {
      submitBtn.click();
      await sleep(2000);
      logger.success('Clicked submit in modal');
      return true;
    }
  }

  // Check if application was instant (no modal, just applied)
  await sleep(1000);
  const successIndicators = ['application sent', 'applied successfully', 'already applied', 'application submitted'];
  const pageText = document.body?.textContent?.toLowerCase() || '';
  if (successIndicators.some(s => pageText.includes(s))) {
    logger.success('Application appears successful (instant apply)');
    return true;
  }

  return false;
}

async function fillNaukriForm(container) {
  // Fill text inputs that are empty
  const inputs = container.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea');
  for (const input of inputs) {
    if (input.value && input.value.trim()) continue; // Skip pre-filled
    const label = getFieldLabel(input);
    const answer = guessAnswer(label);
    if (answer) {
      setInputValue(input, answer);
      await sleep(200);
    }
  }
  // Handle select dropdowns
  const selects = container.querySelectorAll('select');
  for (const sel of selects) {
    if (sel.value && sel.selectedIndex > 0) continue;
    // Pick first non-placeholder option
    const opts = Array.from(sel.options);
    const real = opts.find(o => o.value && !o.disabled && o.index > 0);
    if (real) {
      sel.value = real.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(200);
    }
  }
}

function getFieldLabel(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  const parent = el.closest('.form-group, .field, .formField, [class*="field"]');
  if (parent) {
    const lbl = parent.querySelector('label, .label, [class*="label"]');
    if (lbl) return lbl.textContent.trim();
  }
  return el.placeholder || el.name || '';
}

function guessAnswer(label) {
  if (!label) return '';
  const l = label.toLowerCase();
  if (l.includes('experience') && l.includes('year')) return automation.state?.profile?.years_of_experience || '0';
  if (l.includes('salary') || l.includes('ctc')) return automation.state?.profile?.desired_salary || '500000';
  if (l.includes('notice')) return automation.state?.profile?.notice_period || '0';
  if (l.includes('phone') || l.includes('mobile')) return automation.state?.profile?.phone_number || automation.state?.profile?.phoneNumber || '';
  if (l.includes('email')) return automation.state?.profile?.email || '';
  if (l.includes('name')) return automation.state?.profile?.fullName || '';
  if (l.includes('city') || l.includes('location')) return automation.state?.profile?.current_city || '';
  return '';
}

function setInputValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  if (setter && setter.set) setter.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

async function dismissOverlays() {
  // Close chatbot, notification popups, login nudges
  const closeSelectors = [
    '[class*="chatbot"] button[class*="close"]',
    '[class*="chatbot"] [class*="cross"]',
    '.naukri-chatbot-close',
    'button[aria-label="Close"]',
    '[class*="popup"] button[class*="close"]',
    '[class*="notification"] button[class*="close"]',
    '.lightbox-close',
  ];
  for (const sel of closeSelectors) {
    const btn = document.querySelector(sel);
    if (btn) { btn.click(); await sleep(300); }
  }
}

// ── Agent Lock Overlay ───────────────────────────────────────────────

let _lockOverlay = null;

function createAgentLock() {
  if (document.getElementById('smartapply-naukri-lock')) return;
  const overlay = document.createElement('div');
  overlay.id = 'smartapply-naukri-lock';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:not-allowed;background:transparent;touch-action:none;';

  const BLOCKED = ['click','mousedown','mouseup','pointerdown','pointerup','touchstart','touchend','keydown','keyup','keypress'];
  for (const ev of BLOCKED) {
    overlay.addEventListener(ev, (e) => {
      if (e.target.closest?.('#smartapply-naukri-toast')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      showLockToast();
    }, true);
  }
  document.body.appendChild(overlay);
  _lockOverlay = overlay;
  buildLockToast();
}

let _lockToast = null;
function buildLockToast() {
  if (document.getElementById('smartapply-naukri-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'smartapply-naukri-toast';
  toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.88);z-index:2147483647;background:rgba(16,16,18,0.94);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:28px 36px 22px;text-align:center;font-family:system-ui,sans-serif;box-shadow:0 24px 64px rgba(0,0,0,0.6);opacity:0;pointer-events:auto;transition:opacity 0.18s ease,transform 0.18s ease;min-width:260px;user-select:none;';
  toast.innerHTML = `
    <div style="font-size:36px;margin-bottom:12px">🤖</div>
    <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:6px">Agent is controlling</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,0.5);line-height:1.55;margin-bottom:20px">SmartApply is applying to jobs on Naukri.<br>Please don't touch the browser.</div>
    <button id="smartapply-naukri-stop" style="background:#C93535;color:#fff;border:none;border-radius:9px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer;font-family:system-ui,sans-serif;">■ Stop Bot</button>
  `;
  document.body.appendChild(toast);
  _lockToast = toast;
  document.getElementById('smartapply-naukri-stop').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'STOP_NAUKRI_AUTOMATION' }).catch(() => {});
    removeAgentLock();
  });
}

let _toastTimer = null;
function showLockToast() {
  if (!_lockToast) buildLockToast();
  clearTimeout(_toastTimer);
  requestAnimationFrame(() => { _lockToast.style.opacity = '1'; _lockToast.style.transform = 'translate(-50%,-50%) scale(1)'; });
  _toastTimer = setTimeout(() => { _lockToast.style.opacity = '0'; _lockToast.style.transform = 'translate(-50%,-50%) scale(0.88)'; }, 2200);
}

function removeAgentLock() {
  clearTimeout(_toastTimer);
  if (_lockOverlay) { _lockOverlay.remove(); _lockOverlay = null; }
  if (_lockToast) { _lockToast.remove(); _lockToast = null; }
}

// ── Global State ─────────────────────────────────────────────────────

let automation = {
  isRunning: false,
  isPaused: false,
  state: null,
  sessionId: null,
  totalApplied: 0,
  totalFailed: 0,
  totalSkipped: 0,
  appliedJobIds: new Set(),
};

// ── Message Handler ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_NAUKRI_AUTOMATION':
      startAutomation(message.state, message.resumeCounters).then(sendResponse);
      return true;
    case 'STOP_NAUKRI_AUTOMATION':
      stopAutomation();
      sendResponse({ ok: true });
      break;
    case 'PAUSE_NAUKRI_AUTOMATION':
      automation.isPaused = true;
      sendResponse({ ok: true });
      break;
    case 'RESUME_NAUKRI_AUTOMATION':
      automation.isPaused = false;
      sendResponse({ ok: true });
      break;
    case 'PING':
      sendResponse({ ok: true });
      break;
  }
});

// ── Main Automation Loop ─────────────────────────────────────────────

async function startAutomation(state, resumeCounters) {
  createAgentLock();
  if (automation.isRunning) return { ok: false, reason: 'already_running' };

  automation.isRunning = true;
  automation.isPaused = false;
  automation.state = state;
  automation.sessionId = state.naukriRuntime?.sessionId || `naukri_${Date.now()}`;
  automation.appliedThisTerm = 0;

  try {
    const stored = await chrome.storage.local.get('naukriAppliedJobIds');
    automation.appliedJobIds = new Set(stored.naukriAppliedJobIds || []);
  } catch (_) { automation.appliedJobIds = new Set(); }

  if (resumeCounters) {
    automation.totalApplied = resumeCounters.totalApplied || 0;
    automation.totalFailed = resumeCounters.totalFailed || 0;
    automation.totalSkipped = resumeCounters.totalSkipped || 0;
  } else {
    automation.totalApplied = 0;
    automation.totalFailed = 0;
    automation.totalSkipped = 0;
  }

  const maxApps = state.settings?.maxApplications || 15;
  logger.info(`Naukri automation started. Max: ${maxApps}`);
  notifyPopup(`🚀 Naukri automation started`);

  try {
    await dismissOverlays();
    await sleep(DELAYS.LONG);

    // Main loop — iterate job cards on search results
    let pageAttempts = 0;
    const MAX_PAGE_ATTEMPTS = 10;

    while (automation.isRunning && pageAttempts < MAX_PAGE_ATTEMPTS) {
      if (automation.isPaused) { await sleep(500); continue; }

      const total = automation.totalApplied + automation.totalFailed + automation.totalSkipped;
      if (total >= maxApps) {
        logger.info(`Max applications (${maxApps}) reached.`);
        break;
      }

      await dismissOverlays();
      const cards = findJobCards();

      if (!cards.length) {
        // Try scrolling to load more
        window.scrollBy(0, 600);
        await sleep(1500);
        const retry = findJobCards();
        if (!retry.length) {
          // Try next page
          const nextBtn = document.querySelector('a.fright, a[class*="next"], a[class*="nxt"], .pagination a:last-child');
          if (nextBtn && !nextBtn.classList.contains('disabled')) {
            logger.info('Going to next page…');
            nextBtn.click();
            await sleep(DELAYS.EXTRA_LONG);
            pageAttempts++;
            continue;
          }
          logger.info('No more job cards found.');
          break;
        }
      }

      const currentCards = findJobCards();
      if (!currentCards.length) break;

      for (const card of currentCards) {
        if (!automation.isRunning) break;
        if (automation.isPaused) { await sleep(500); continue; }

        const totalNow = automation.totalApplied + automation.totalFailed + automation.totalSkipped;
        if (totalNow >= maxApps) break;

        card.setAttribute('data-sa-processed', 'true');

        const title = getJobTitle(card);
        const company = getCompany(card);
        const link = getJobLink(card);

        // Skip already applied
        if (isAlreadyApplied(card)) {
          logger.info(`Skipping (already applied): ${title}`);
          automation.totalSkipped++;
          sendProgress();
          continue;
        }

        // Skip bad words
        if (automation.state?.profile?.bad_words?.length) {
          const titleLow = title.toLowerCase();
          if (automation.state.profile.bad_words.some(w => titleLow.includes(w.toLowerCase()))) {
            logger.info(`Skipping (bad word): ${title}`);
            card.setAttribute('data-sa-processed', 'skipped-badword');
            automation.totalSkipped++;
            sendProgress();
            continue;
          }
        }

        // Skip duplicates
        const jobIdMatch = link.match(/(\d{10,})/);
        const jobId = jobIdMatch ? jobIdMatch[1] : link;
        if (automation.appliedJobIds.has(jobId)) {
          logger.info(`Skipping (duplicate): ${title}`);
          automation.totalSkipped++;
          sendProgress();
          continue;
        }

        logger.info(`Applying: ${title} at ${company}`);
        notifyPopup(`📋 Applying: ${title} at ${company}`);

        // Try to apply
        const applyBtn = findApplyButton(card);
        if (!applyBtn || isExternalApply(applyBtn)) {
          logger.warn(`Skipping (external/no apply): ${title}`);
          automation.totalSkipped++;
          sendProgress();
          reportResult({ result: 'Skipped', reason: 'external_apply', job_title: title, company, job_url: link });
          continue;
        }

        // Click apply
        try {
          applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(500);
          applyBtn.click();
          await sleep(DELAYS.LONG);

          const applied = await handleNaukriApplyModal();

          if (applied) {
            automation.totalApplied++;
            automation.appliedThisTerm++;
            automation.appliedJobIds.add(jobId);
            const ids = Array.from(automation.appliedJobIds).slice(-5000);
            chrome.storage.local.set({ naukriAppliedJobIds: ids }).catch(() => {});
            logger.success(`Applied: ${title}`);
            reportResult({ result: 'Applied', job_title: title, company, job_url: link });
          } else {
            automation.totalFailed++;
            logger.warn(`Failed: ${title}`);
            reportResult({ result: 'Failed', reason: 'apply_failed', job_title: title, company, job_url: link });
          }
        } catch (err) {
          automation.totalFailed++;
          logger.error(`Error on ${title}: ${err.message}`);
          reportResult({ result: 'Failed', reason: err.message, job_title: title, company, job_url: link });
        }

        sendProgress();
        await sleep(state.settings?.delayBetweenApps || 3000);

        // Check if we should switch based on switch_number
        const switchNumber = state.profile?.switch_number || 15;
        const terms = state.profile?.search_terms;
        const hasMultipleTerms = Array.isArray(terms) && terms.length > 1;

        if (hasMultipleTerms && automation.appliedThisTerm >= switchNumber && automation.isRunning) {
          logger.info(`Reached ${switchNumber} applications for current term. Switching…`);
          chrome.runtime.sendMessage({
            type: 'SWITCH_NAUKRI_SEARCH_TERM',
            counters: {
              totalApplied: automation.totalApplied,
              totalFailed: automation.totalFailed,
              totalSkipped: automation.totalSkipped,
            },
          }).catch(() => {});
          
          automation.isRunning = false;
          removeAgentLock();
          return { ok: true, switchedTerm: true };
        }
      }

      // Scroll down and try to find more cards
      window.scrollBy(0, 400);
      await sleep(1000);
    }

    // ── Check if we should switch to the next search term ──────────────
    const terms = state.profile?.search_terms;
    const hasMultipleTerms = Array.isArray(terms) && terms.length > 1;

    if (hasMultipleTerms && automation.isRunning) {
      logger.info('No more jobs for this term. Switching to next search term…');
      chrome.runtime.sendMessage({
        type: 'SWITCH_NAUKRI_SEARCH_TERM',
        counters: {
          totalApplied: automation.totalApplied,
          totalFailed: automation.totalFailed,
          totalSkipped: automation.totalSkipped,
        },
      }).catch(() => {});
      
      automation.isRunning = false;
      removeAgentLock();
      return { ok: true, switchedTerm: true };
    }

  } catch (err) {
    logger.error(`Automation error: ${err.message}`);
  }

  automation.isRunning = false;
  removeAgentLock();
  logger.info('Naukri automation finished');

  chrome.runtime.sendMessage({
    type: 'NAUKRI_AUTOMATION_FINISHED',
    payload: { totalApplied: automation.totalApplied, totalFailed: automation.totalFailed, totalSkipped: automation.totalSkipped },
  }).catch(() => {});

  return { ok: true };
}

function stopAutomation() {
  automation.isRunning = false;
  automation.isPaused = false;
  removeAgentLock();
  logger.info('Naukri automation stopped');
}

// ── Messaging Helpers ────────────────────────────────────────────────

function sendProgress() {
  chrome.runtime.sendMessage({
    type: 'NAUKRI_PROGRESS_UPDATE',
    payload: { totalApplied: automation.totalApplied, totalFailed: automation.totalFailed, totalSkipped: automation.totalSkipped },
  }).catch(() => {});
}

function reportResult(data) {
  chrome.runtime.sendMessage({
    type: 'NAUKRI_REPORT_RESULT',
    payload: { ...data, platform: 'naukri', session_id: automation.sessionId },
  }).catch(() => {});
}

function notifyPopup(text) {
  chrome.runtime.sendMessage({ type: 'NAUKRI_POPUP_LOG', text }).catch(() => {});
}

// ── Floating Logger ──────────────────────────────────────────────────

function initFloatingLogger() {
  if (document.getElementById('smartapply-naukri-logger')) return;
  const c = document.createElement('div');
  c.id = 'smartapply-naukri-logger';
  c.style.cssText = 'position:fixed;bottom:20px;left:20px;width:320px;height:360px;background:rgba(28,28,30,0.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;z-index:2147483647;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);transition:opacity 0.3s;pointer-events:auto;';

  const h = document.createElement('div');
  h.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);font-weight:600;font-size:13px;color:#fff;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(74,144,217,0.15),transparent);border-radius:12px 12px 0 0;font-family:system-ui,sans-serif;cursor:grab;user-select:none;';
  h.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:#4A90D9;box-shadow:0 0 8px #4A90D9;"></div> SmartApply — Naukri Logs';

  const feed = document.createElement('div');
  feed.id = 'smartapply-naukri-log-feed';
  feed.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;color:#c1c1c4;display:flex;flex-direction:column;scrollbar-width:none;';

  c.appendChild(h);
  c.appendChild(feed);
  document.body.appendChild(c);

  // Draggable
  let dragging = false, cx = 0, cy = 0, ix = 0, iy = 0, ox = 0, oy = 0;
  h.addEventListener('mousedown', (e) => { ix = e.clientX - ox; iy = e.clientY - oy; dragging = true; });
  document.addEventListener('mousemove', (e) => { if (!dragging) return; e.preventDefault(); cx = e.clientX - ix; cy = e.clientY - iy; ox = cx; oy = cy; c.style.transform = `translate(${cx}px,${cy}px)`; });
  document.addEventListener('mouseup', () => { dragging = false; });

  appendLog('Naukri logger ready.', 'success');
}

// ── Init ─────────────────────────────────────────────────────────────

initFloatingLogger();
logger.info(`Naukri content script loaded on ${window.location.hostname}`);
chrome.runtime.sendMessage({ type: 'NAUKRI_CONTENT_READY', url: window.location.href }).catch(() => {});

})();

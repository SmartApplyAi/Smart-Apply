// ── SmartApply Popup Script ───────────────────────────────────────────────
// Server URL is fixed — users cannot change it.

const API_BASE = 'https://www.smartapplies.app/api';

// ── Helpers ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const msg = (type, payload) =>
  chrome.runtime.sendMessage({ type, ...payload });

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = $(`screen-${name}`);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
}

// ── LinkedIn Log Helpers ──────────────────────────────────────────────────

function addLog(text, type = '') {
  const feed = $('log-feed');
  const placeholder = feed.querySelector('.muted');
  if (placeholder && placeholder.textContent.includes('Waiting')) placeholder.remove();

  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;

  while (feed.children.length > 80) feed.removeChild(feed.firstChild);
  
  saveLogsToSession();
}

function saveLogsToSession() {
  const feed = $('log-feed');
  const logs = [];
  for (const el of feed.children) {
    logs.push({ text: el.textContent, className: el.className });
  }
  chrome.storage.session.set({ popupLogs: logs });
}

function restoreLogsFromSession(logs) {
  if (!logs || !logs.length) return;
  const feed = $('log-feed');
  feed.innerHTML = '';
  for (const log of logs) {
    const el = document.createElement('div');
    el.className = log.className;
    el.textContent = log.text;
    feed.appendChild(el);
  }
  feed.scrollTop = feed.scrollHeight;
}

// ── Naukri Log Helpers ────────────────────────────────────────────────────

function addNaukriLog(text, type = '') {
  const feed = $('naukri-log-feed');
  if (!feed) return;
  const placeholder = feed.querySelector('.muted');
  if (placeholder && placeholder.textContent.includes('Waiting')) placeholder.remove();

  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;

  while (feed.children.length > 80) feed.removeChild(feed.firstChild);
  
  saveNaukriLogsToSession();
}

function saveNaukriLogsToSession() {
  const feed = $('naukri-log-feed');
  if (!feed) return;
  const logs = [];
  for (const el of feed.children) {
    logs.push({ text: el.textContent, className: el.className });
  }
  chrome.storage.session.set({ naukriPopupLogs: logs });
}

function restoreNaukriLogsFromSession(logs) {
  if (!logs || !logs.length) return;
  const feed = $('naukri-log-feed');
  if (!feed) return;
  feed.innerHTML = '';
  for (const log of logs) {
    const el = document.createElement('div');
    el.className = log.className;
    el.textContent = log.text;
    feed.appendChild(el);
  }
  feed.scrollTop = feed.scrollHeight;
}

// ── Status / UI Helpers ───────────────────────────────────────────────────

function setStatus(status) {
  const dot = $('status-dot');
  const text = $('status-text');
  dot.className = 'status-dot';
  const map = {
    idle:    { label: 'Idle',    cls: '' },
    running: { label: 'Running', cls: 'running' },
    paused:  { label: 'Paused',  cls: 'paused' },
    error:   { label: 'Error',   cls: 'error' },
    success: { label: 'Done',    cls: '' },
  };
  const s = map[status] || map.idle;
  text.textContent = s.label;
  if (s.cls) dot.classList.add(s.cls);
}

function setRunningUI(running, paused = false) {
  $('btn-start').classList.toggle('hidden', running);
  $('btn-pause').classList.toggle('hidden', !running || paused);
  $('btn-resume').classList.toggle('hidden', !paused);
  $('btn-stop').classList.toggle('hidden', !running && !paused);
  $('step-row').classList.toggle('hidden', !running && !paused);
  setStatus(running ? (paused ? 'paused' : 'running') : 'idle');
}

function setNaukriRunningUI(running, paused = false) {
  $('naukri-btn-start').classList.toggle('hidden', running);
  $('naukri-btn-pause').classList.toggle('hidden', !running || paused);
  $('naukri-btn-resume').classList.toggle('hidden', !paused);
  $('naukri-btn-stop').classList.toggle('hidden', !running && !paused);
  $('naukri-step-row').classList.toggle('hidden', !running && !paused);
  // Update global status if Naukri is running
  if (running) setStatus(paused ? 'paused' : 'running');
}

function setLoginLoading(on) {
  const btn = $('btn-login');
  btn.querySelector('.btn-text').classList.toggle('hidden', on);
  btn.querySelector('.spinner').classList.toggle('hidden', !on);
  btn.disabled = on;
}

function updateStep(stepName) {
  const labels = {
    idle: 'Idle',
    modal_detected: 'Modal opened',
    contact_info: 'Filling contact info',
    resume: 'Selecting resume',
    screening_questions: 'Answering questions',
    review: 'Reviewing application',
    submit_pending: 'Waiting to submit',
    success: 'Application submitted ✓',
    error: 'Error on step',
  };
  $('step-value').textContent = labels[stepName] || stepName;

  const pct = {
    idle: 0, modal_detected: 10, contact_info: 25,
    resume: 40, screening_questions: 60,
    review: 80, submit_pending: 90, success: 100, error: 0,
  };
  $('progress-fill').style.width = (pct[stepName] || 0) + '%';
}

function updateStats(applied, failed, skipped) {
  $('stat-applied').textContent = applied;
  $('stat-failed').textContent  = failed;
  $('stat-skipped').textContent = skipped;
}

function updateNaukriStats(applied, failed, skipped) {
  $('naukri-stat-applied').textContent = applied;
  $('naukri-stat-failed').textContent  = failed;
  $('naukri-stat-skipped').textContent = skipped;
}

function updateSearchTerm(term, index, total) {
  const bar = $('search-term-bar');
  const text = $('search-term-text');
  if (term && total > 1) {
    text.textContent = `"${term}" (${(index || 0) + 1}/${total})`;
    bar.classList.remove('hidden');
  } else if (term && total <= 1) {
    text.textContent = `"${term}"`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

// ── Tab Switching ─────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = $(`panel-${btn.dataset.tab}`);
    if (panel) panel.classList.add('active');
  });
});

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  const response = await msg('GET_STATE', {});
  const sessionData = await chrome.storage.session.get(['popupLogs', 'naukriPopupLogs']);
  if (sessionData.popupLogs) restoreLogsFromSession(sessionData.popupLogs);
  if (sessionData.naukriPopupLogs) restoreNaukriLogsFromSession(sessionData.naukriPopupLogs);

  const state = response?.state;

  if (!state?.runtime?.token) {
    showScreen('login');
    return;
  }

  showScreen('dashboard');
  loadSettings(state.settings);

  // LinkedIn state
  const rt = state.runtime;
  updateStats(rt.totalApplied || 0, rt.totalFailed || 0, rt.totalSkipped || 0);
  setRunningUI(rt.isRunning, rt.isPaused);
  if (rt.currentStep) updateStep(rt.currentStep);

  const terms = state.profile?.search_terms;
  if (rt.currentSearchTerm) {
    updateSearchTerm(rt.currentSearchTerm, rt.currentSearchTermIndex, terms?.length || 1);
  }

  // Naukri state
  const nrt = state.naukriRuntime;
  if (nrt) {
    updateNaukriStats(nrt.totalApplied || 0, nrt.totalFailed || 0, nrt.totalSkipped || 0);
    setNaukriRunningUI(nrt.isRunning, nrt.isPaused);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────

$('pw-toggle').addEventListener('click', () => {
  const inp = $('login-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

$('btn-login').addEventListener('click', async () => {
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  const errEl    = $('login-error');

  errEl.classList.add('hidden');

  if (!email || !password) {
    errEl.textContent = 'Email and password are required.';
    errEl.classList.remove('hidden');
    return;
  }

  setLoginLoading(true);
  try {
    const res = await msg('LOGIN', { email, password, apiBase: API_BASE });
    if (res?.ok) {
      showScreen('dashboard');
      addLog(`Signed in as ${email}`, 'success');
    } else {
      errEl.textContent = res?.error || 'Login failed. Check your credentials.';
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    errEl.textContent = e.message || 'Network error.';
    errEl.classList.remove('hidden');
  } finally {
    setLoginLoading(false);
  }
});

// ── Logout ────────────────────────────────────────────────────────────────

$('btn-logout').addEventListener('click', async () => {
  await msg('LOGOUT', {});
  showScreen('login');
});

// ── LinkedIn Start ────────────────────────────────────────────────────────

$('btn-start').addEventListener('click', async () => {
  const res = await msg('START_AUTOMATION', {});
  if (res?.ok) {
    setRunningUI(true);
    addLog('🚀 Opening LinkedIn Jobs with your filters…', 'success');
  } else {
    addLog(`Could not start: ${res?.reason || 'unknown'}`, 'error');
  }
});

// ── LinkedIn Pause / Resume / Stop ────────────────────────────────────────

$('btn-pause').addEventListener('click', async () => {
  await msg('PAUSE_AUTOMATION', {});
  setRunningUI(true, true);
  addLog('Paused.', 'warn');
});

$('btn-resume').addEventListener('click', async () => {
  await msg('RESUME_AUTOMATION', {});
  setRunningUI(true, false);
  addLog('Resumed.', 'success');
});

$('btn-stop').addEventListener('click', async () => {
  await msg('STOP_AUTOMATION', {});
  setRunningUI(false);
  addLog('Stopped.', 'warn');
  $('job-card').classList.add('hidden');
  $('confirm-panel').classList.add('hidden');
});

// ── Naukri Start ──────────────────────────────────────────────────────────

$('naukri-btn-start').addEventListener('click', async () => {
  const res = await msg('START_NAUKRI_AUTOMATION', {});
  if (res?.ok) {
    setNaukriRunningUI(true);
    addNaukriLog('🚀 Opening Naukri Jobs…', 'success');
  } else {
    addNaukriLog(`Could not start: ${res?.reason || 'unknown'}`, 'error');
  }
});

// ── Naukri Pause / Resume / Stop ──────────────────────────────────────────

$('naukri-btn-pause').addEventListener('click', async () => {
  await msg('PAUSE_NAUKRI_AUTOMATION', {});
  setNaukriRunningUI(true, true);
  addNaukriLog('Paused.', 'warn');
});

$('naukri-btn-resume').addEventListener('click', async () => {
  await msg('RESUME_NAUKRI_AUTOMATION', {});
  setNaukriRunningUI(true, false);
  addNaukriLog('Resumed.', 'success');
});

$('naukri-btn-stop').addEventListener('click', async () => {
  await msg('STOP_NAUKRI_AUTOMATION', {});
  setNaukriRunningUI(false);
  addNaukriLog('Stopped.', 'warn');
  $('naukri-job-card').classList.add('hidden');
});

// ── Confirm submit (LinkedIn) ─────────────────────────────────────────────

$('btn-confirm').addEventListener('click', async () => {
  await msg('USER_CONFIRMED', {});
  $('confirm-panel').classList.add('hidden');
  addLog('Submit confirmed by user.', 'success');
});

$('btn-skip').addEventListener('click', async () => {
  await msg('USER_CANCELLED', {});
  $('confirm-panel').classList.add('hidden');
  addLog('Skipped by user.', 'warn');
});

// ── Log clear (LinkedIn) ──────────────────────────────────────────────────

$('btn-copy-log').addEventListener('click', () => {
  const feed = $('log-feed');
  const logText = Array.from(feed.children).map(el => el.textContent).join('\n');
  navigator.clipboard.writeText(logText).then(() => {
    const btn = $('btn-copy-log');
    const oldText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = oldText, 2000);
  });
});

$('btn-clear-log').addEventListener('click', () => {
  $('log-feed').innerHTML = '<div class="log-entry muted">Log cleared.</div>';
  chrome.storage.session.remove('popupLogs');
});

// ── Log clear (Naukri) ────────────────────────────────────────────────────

$('naukri-btn-copy-log').addEventListener('click', () => {
  const feed = $('naukri-log-feed');
  const logText = Array.from(feed.children).map(el => el.textContent).join('\n');
  navigator.clipboard.writeText(logText).then(() => {
    const btn = $('naukri-btn-copy-log');
    const oldText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = oldText, 2000);
  });
});

$('naukri-btn-clear-log').addEventListener('click', () => {
  $('naukri-log-feed').innerHTML = '<div class="log-entry muted">Log cleared.</div>';
  chrome.storage.session.remove('naukriPopupLogs');
});

// ── Settings ──────────────────────────────────────────────────────────────

$('btn-settings').addEventListener('click', async () => {
  const res = await msg('GET_STATE', {});
  loadSettings(res?.state?.settings);
  showScreen('settings');
});

$('btn-back-settings').addEventListener('click', () => showScreen('dashboard'));

$('btn-save-settings').addEventListener('click', async () => {
  const settings = {
    maxApplications:  parseInt($('set-max-apps').value) || 15,
    humanConfirmSubmit: $('set-confirm').checked,
    delayBetweenApps: parseInt($('set-delay').value) || 3000,
  };
  await msg('SET_SETTINGS', { settings });
  showScreen('dashboard');
  addLog('Settings saved.', 'success');
});

function loadSettings(settings) {
  if (!settings) return;
  $('set-max-apps').value = settings.maxApplications ?? 15;
  $('set-confirm').checked = settings.humanConfirmSubmit !== false;
  $('set-delay').value = settings.delayBetweenApps ?? 3000;
}

// ── Runtime Messages from Background ──────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {

    // ── LinkedIn messages ──
    case 'STATE_CHANGED':
      updateStep(message.state);
      addLog(`Step: ${message.state}`);
      break;

    case 'PROGRESS_UPDATE': {
      const { totalApplied, totalFailed, totalSkipped } = message.payload;
      updateStats(totalApplied, totalFailed, totalSkipped);
      break;
    }

    case 'RESULT_UPDATE': {
      const r = message.payload;
      const icon = r.result === 'Applied' ? '✓' : r.result === 'Failed' ? '✗' : '—';
      const type = r.result === 'Applied' ? 'success' : r.result === 'Failed' ? 'error' : 'warn';
      addLog(`${icon} ${r.job_title || 'Unknown'} @ ${r.company || 'Unknown'} → ${r.result}`, type);

      if (r.job_title) {
        $('job-title').textContent  = r.job_title;
        $('job-company').textContent = r.company || '';
        $('job-card').classList.remove('hidden');
      }
      break;
    }

    case 'SHOW_CONFIRM': {
      const job = message.jobInfo;
      $('confirm-job-name').textContent = job?.title
        ? `${job.title} at ${job.company || ''}`
        : 'Current job';
      $('confirm-panel').classList.remove('hidden');
      addLog('⚠️ Waiting for your confirmation to submit.', 'warn');
      break;
    }

    case 'POPUP_LOG':
      addLog(message.text);
      break;

    case 'AUTOMATION_ERROR':
      setRunningUI(false);
      setStatus('error');
      addLog(`Error: ${message.error || 'Unknown error'}`, 'error');
      break;

    case 'AUTOMATION_FINISHED': {
      const { totalApplied, totalFailed, totalSkipped } = message.payload;
      setRunningUI(false);
      setStatus('success');
      addLog(`✓ Done! Applied: ${totalApplied} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`, 'success');
      $('confirm-panel').classList.add('hidden');
      $('search-term-bar').classList.add('hidden');
      break;
    }

    case 'SEARCH_TERM_UPDATE':
      updateSearchTerm(message.term, message.index, message.total);
      break;

    // ── Naukri messages ──
    case 'NAUKRI_POPUP_LOG':
      addNaukriLog(message.text);
      break;

    case 'NAUKRI_PROGRESS_UPDATE': {
      const { totalApplied, totalFailed, totalSkipped } = message.payload;
      updateNaukriStats(totalApplied, totalFailed, totalSkipped);
      break;
    }

    case 'NAUKRI_REPORT_RESULT': {
      const r = message.payload;
      const icon = r.result === 'Applied' ? '✓' : r.result === 'Failed' ? '✗' : '—';
      const type = r.result === 'Applied' ? 'success' : r.result === 'Failed' ? 'error' : 'warn';
      addNaukriLog(`${icon} ${r.job_title || 'Unknown'} @ ${r.company || 'Unknown'} → ${r.result}`, type);

      if (r.job_title) {
        $('naukri-job-title').textContent  = r.job_title;
        $('naukri-job-company').textContent = r.company || '';
        $('naukri-job-card').classList.remove('hidden');
      }
      break;
    }

    case 'NAUKRI_AUTOMATION_ERROR':
      setNaukriRunningUI(false);
      setStatus('error');
      addNaukriLog(`Error: ${message.error || 'Unknown error'}`, 'error');
      break;

    case 'NAUKRI_AUTOMATION_FINISHED': {
      const { totalApplied, totalFailed, totalSkipped } = message.payload;
      setNaukriRunningUI(false);
      setStatus('success');
      addNaukriLog(`✓ Done! Applied: ${totalApplied} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`, 'success');
      break;
    }
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────

init();

/* ── SmartApply Shared JS ─────────────────────────────────────────────── */

// ── Theme Management ────────────────────────────────────────────────────────
function applyTheme(themeVal) {
  let finalTheme = themeVal;
  if (themeVal === 'auto') {
    finalTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', finalTheme);
  updateThemeIcon();

  document.querySelectorAll('.theme-option').forEach(el => {
    if (el.dataset.theme === themeVal) el.classList.add('active');
    else el.classList.remove('active');
  });
}

// FIXED: was called everywhere but never defined
function updateThemeIcon() {
  const savedTheme = localStorage.getItem('sa_theme') || 'auto';
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (!icon) return;
  if (savedTheme === 'dark') icon.className = 'fa-solid fa-moon';
  else if (savedTheme === 'light') icon.className = 'fa-solid fa-sun';
  else icon.className = 'fa-solid fa-circle-half-stroke';
}
window.updateThemeIcon = updateThemeIcon;

window.setTheme = function (theme) {
  localStorage.setItem('sa_theme', theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
};

window.toggleTheme = function () {
  const current = localStorage.getItem('sa_theme') || 'auto';
  let next = 'dark';
  if (current === 'dark') next = 'light';
  else if (current === 'light') next = 'dark';
  else {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    next = isDark ? 'light' : 'dark';
  }
  window.setTheme(next);
};

function initTheme() {
  const savedTheme = localStorage.getItem('sa_theme') || 'auto';
  applyTheme(savedTheme);
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('sa_theme') || 'auto') === 'auto') applyTheme('auto');
  });
}

window.toggleSettingsPanel = function () {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  panel.classList.toggle('open');
};

document.addEventListener('click', (e) => {
  const panel = document.getElementById('settings-panel');
  const toggleBtn = document.getElementById('theme-toggle');
  if (panel && panel.classList.contains('open')) {
    if (!panel.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
      panel.classList.remove('open');
    }
  }
});

initTheme();

const API_BASE = '/api';
window.__sa_oauth_pending = new URLSearchParams(window.location.search).has('oauth_code');

// ── Google OAuth Token Handlers ─────────────────────────────────────────────
function parseJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

(async function handleOAuthHandoff() {
  const params = new URLSearchParams(window.location.search);
  const handoffId = params.get('oauth_code'); // Using the same name as backend now
  if (!handoffId) return;
  
  window.__sa_oauth_pending = true;
  try {
    const res = await fetch(API_BASE + '/auth/oauth-handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code: handoffId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error((data && data.detail) || 'OAuth exchange failed');
    
    // C2: Token is now set as httpOnly cookie by backend — only save UI state
    auth.save(null, data.user);
    
    // Clear the code from URL
    const url = new URL(window.location);
    url.searchParams.delete('oauth_code');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    
    // Redirect to dashboard if on login/signup
    const page = window.location.pathname.split('/').pop();
    if (!page || page === 'login.html' || page === 'signup.html') {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    console.error('OAuth handoff error:', err);
    auth.clear();
    if (!window.location.pathname.includes('login.html')) {
       window.location.href = 'login.html?error=oauth_failed';
    }
  } finally {
    window.__sa_oauth_pending = false;
  }
})();

(function handleOAuthToken() {
  const params = new URLSearchParams(window.location.search);
  let token = params.get('oauth_token');
  if (!token && window.location.hash.includes('oauth_token=')) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    token = hashParams.get('oauth_token');
  }
  if (!token) return;
  try {
    const payload = parseJwtPayload(token);
    // C2: Don't store token in localStorage — httpOnly cookie handles auth
    localStorage.setItem('sa_auth', '1');
    localStorage.setItem('sa_user', JSON.stringify({ email: payload.email || '', id: payload.sub || '' }));
  } catch (err) {
    console.error('OAuth token parse error:', err);
    return window.location.replace('login.html?error=invalid_token');
  }
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  const page = window.location.pathname.split('/').pop();
  if (!page || page === 'login.html' || page === 'signup.html') window.location.href = 'dashboard.html';
})();

function normaliseDetail(detail) {
  if (!detail) return 'Something went wrong.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => (typeof e === 'string' ? e : e.msg || e.message)).join(' · ');
  return detail.msg || detail.message || JSON.stringify(detail);
}

const api = {
  async request(method, path, body = null, opts = {}) {
    const headers = { ...opts.headers };
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    // C2: No longer setting Authorization header from localStorage — httpOnly cookie is sent automatically
    const config = { method, headers, credentials: 'include' };
    if (body && !(body instanceof FormData)) config.body = JSON.stringify(body);
    else if (body instanceof FormData) { delete headers['Content-Type']; config.body = body; }
    const res = await fetch(API_BASE + path, config);
    
    // 1. Handle 401 Unauthorized
    if (res.status === 401) {
      if (!path.includes('/extension/') && !path.includes('/auth/logout')) {
        auth.clear();
        const page = window.location.pathname.split('/').pop() || 'index.html';
        const isPublic = ['index.html', 'login.html', 'signup.html', ''].includes(page);
        if (!isPublic && !window.__sa_oauth_pending) {
          window.location.href = 'login.html?error=session_expired';
        }
      }
      const errorData = await res.json().catch(() => ({}));
      return Promise.reject({ status: 401, detail: "Session expired", data: errorData });
    }

    // 2. Handle other responses
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw { status: res.status, detail: normaliseDetail(data.detail), data };
    }
    return data;
  },
  get: (path, opts) => api.request('GET', path, null, opts),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  delete: (path) => api.request('DELETE', path),
  upload: (path, form) => api.request('POST', path, form),
};

const auth = {
  save(token, user) {
    // C2: Token is stored as httpOnly cookie by the backend, not in localStorage
    // We only keep non-sensitive UI state for navbar/routing
    localStorage.setItem('sa_auth', '1');
    if (user) localStorage.setItem('sa_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('sa_token');  // Clean up legacy key if present
    localStorage.removeItem('sa_user');
    localStorage.removeItem('sa_auth');
  },
  get token() { return null; /* C2: Token is httpOnly cookie, not accessible from JS */ },
  get user() { try { return JSON.parse(localStorage.getItem('sa_user')); } catch { return null; } },
  get isAuth() { return localStorage.getItem('sa_auth') === '1'; },
  requireAuth(redirect = 'login.html') {
    if (window.__sa_oauth_pending || new URLSearchParams(window.location.search).has('oauth_code')) return true;
    if (!this.isAuth) { window.location.href = redirect; return false; }
    return true;
  },
  requireGuest(redirect = 'dashboard.html') {
    if (window.__sa_oauth_pending || new URLSearchParams(window.location.search).has('oauth_code') || new URLSearchParams(window.location.search).has('oauth_token') || window.location.hash.includes('oauth_token=')) return true;
    if (this.isAuth) { window.location.href = redirect; return false; }
    return true;
  },
  async logout() {
    try { await api.post('/auth/logout'); } catch { }
    this.clear();
    window.location.href = 'index.html';
  }
};

// FIXED: toast object alias so code that calls toast.info() etc doesn't break
const toast = {
  info: (msg, duration) => showToast(msg, 'info', duration),
  success: (msg, duration) => showToast(msg, 'success', duration),
  error: (msg, duration) => showToast(msg, 'error', duration),
  warning: (msg, duration) => showToast(msg, 'warning', duration),
};
window.toast = toast;

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = {
    success: '<i class="fa-solid fa-circle-check toast-icon"></i>',
    error: '<i class="fa-solid fa-circle-xmark toast-icon"></i>',
    info: '<i class="fa-solid fa-circle-info toast-icon"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation toast-icon"></i>',
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || ''}<span>${String(message || '')}</span>`;
  container.prepend(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, duration);
}

function setLoading(btn, loading) {
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
    const span = btn.querySelector('.btn-text');
    if (span) btn.setAttribute('data-original', span.textContent);
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
    const orig = btn.getAttribute('data-original');
    if (orig) { const span = btn.querySelector('.btn-text'); if (span) span.textContent = orig; }
  }
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.form-group').forEach(e => e.classList.remove('has-error'));
}

function markFieldError(inputId, msg) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const group = input.closest('.form-group');
  if (group) {
    group.classList.add('has-error');
    const err = group.querySelector('.field-error');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
  }
}

function checkPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function renderStrength(bars, password) {
  const score = checkPasswordStrength(password);
  bars.forEach((bar, i) => {
    bar.className = 'pw-bar';
    if (i < score) {
      if (score <= 1) bar.classList.add('weak');
      else if (score <= 2) bar.classList.add('medium');
      else bar.classList.add('strong');
    }
  });
}

// FIXED: define initCounters eagerly so it's available before DOMContentLoaded
function _setupCounterObserver() {
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const raw = el.textContent.replace(/[^0-9]/g, '');
      const target = parseInt(raw);
      if (isNaN(target) || target === 0) return;
      const duration = 1800;
      const start = Date.now();
      const step = () => {
        const progress = Math.min((Date.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        el.textContent = Math.floor(eased * target).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      countObserver.unobserve(el);
    });
  }, { threshold: 0.5 });
  return countObserver;
}

let _counterObserver = null;

window.initCounters = function () {
  if (!_counterObserver) _counterObserver = _setupCounterObserver();
  document.querySelectorAll('.stat-count, .stat-value').forEach(el => {
    _counterObserver.observe(el);
  });
};

// Run immediately if DOM ready, else defer
if (document.readyState !== 'loading') {
  _counterObserver = _setupCounterObserver();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    _counterObserver = _setupCounterObserver();
  });
}

function hydrateNavbar() {
  const navActions = document.getElementById('nav-actions');
  if (!navActions || navActions.dataset.hydrated) return;

  const navToggle = document.getElementById('nav-toggle');
  if (navToggle && !navToggle.dataset.attached) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navActions.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });
    navToggle.dataset.attached = 'true';
    document.addEventListener('click', (e) => {
      if (navActions.classList.contains('open') &&
        !navActions.contains(e.target) && !navToggle.contains(e.target)) {
        navActions.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const savedTheme = localStorage.getItem('sa_theme') || 'auto';
  let iconClass = 'fa-solid fa-circle-half-stroke';
  if (savedTheme === 'dark') iconClass = 'fa-solid fa-moon';
  else if (savedTheme === 'light') iconClass = 'fa-solid fa-sun';

  const themeBtnHTML = `<button id="theme-toggle" class="btn btn-ghost btn-sm" aria-label="Toggle Theme" onclick="window.toggleTheme()"><i class="${iconClass}"></i></button>`;

  const page = (window.location.pathname.split('/').pop() || 'index.html');
  const isPublic = ['index.html', 'login.html', 'signup.html', ''].includes(page);
  const user = auth.user;

  if (isPublic) {
    if (user) {
      navActions.innerHTML = `${themeBtnHTML}<a href="dashboard.html" class="btn btn-ghost btn-sm hide-on-sm">Dashboard</a><a href="ats.html" class="btn btn-ghost btn-sm"><i class="fa-solid fa-bullseye"></i></a><button id="logout-btn" class="btn btn-primary btn-sm">Logout</button>`;
      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) logoutBtn.onclick = () => auth.logout();
    } else {
      navActions.innerHTML = `${themeBtnHTML}<a href="login.html" class="btn btn-ghost btn-sm">Login</a><a href="signup.html" class="btn btn-primary btn-sm">Get Started</a>`;
    }
  } else {
    const existingBtn = document.getElementById('theme-toggle');
    if (existingBtn) { const ic = existingBtn.querySelector('i'); if (ic) ic.className = iconClass; }
  }

  // Settings panel
  if (!document.getElementById('settings-panel')) {
    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-panel-header">
        <h3><i class="fa-solid fa-sliders"></i> Settings</h3>
        <button class="btn btn-ghost btn-sm" onclick="window.toggleSettingsPanel()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div style="margin-bottom:12px;font-size:13px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em">Theme</div>
      <div class="theme-options">
        <div class="theme-option ${savedTheme === 'light' ? 'active' : ''}" data-theme="light" onclick="window.setTheme('light')"><i class="fa-solid fa-sun"></i><span>Light</span></div>
        <div class="theme-option ${savedTheme === 'dark' ? 'active' : ''}" data-theme="dark" onclick="window.setTheme('dark')"><i class="fa-solid fa-moon"></i><span>Dark</span></div>
        <div class="theme-option ${savedTheme === 'auto' ? 'active' : ''}" data-theme="auto" onclick="window.setTheme('auto')"><i class="fa-solid fa-circle-half-stroke"></i><span>Auto</span></div>
      </div>`;
    document.body.appendChild(panel);
  }

  navActions.dataset.hydrated = 'true';
}

// ── Utility Helpers ──────────────────────────────────────────────────────────

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function initTagInput(containerId, hiddenInputId, initialTags = []) {
  const container = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!container || !hiddenInput) return null;

  let tags = Array.isArray(initialTags) ? [...initialTags] : [];

  const render = () => {
    container.innerHTML = '';
    tags.forEach((tag, index) => {
      const el = document.createElement('div');
      el.className = 'tag';
      el.innerHTML = `<span>${escHtml(tag)}</span><i class="fa-solid fa-xmark" data-index="${index}"></i>`;
      container.appendChild(el);
    });
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = tags.length === 0 ? 'Type and press Enter...' : '';
    container.appendChild(input);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = input.value.trim().replace(/,$/, '');
        if (val && !tags.includes(val)) { tags.push(val); update(); }
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value && tags.length > 0) {
        tags.pop(); update();
      }
    });
    container.querySelectorAll('i').forEach(i => {
      i.onclick = (e) => { e.stopPropagation(); tags.splice(parseInt(i.dataset.index), 1); update(); };
    });
    container.onclick = () => container.querySelector('input')?.focus();
  };

  const update = () => {
    hiddenInput.value = JSON.stringify(tags);
    render();
    hiddenInput.dispatchEvent(new Event('change'));
  };

  update();
  return { getTags: () => tags, setTags: (newTags) => { tags = [...newTags]; update(); } };
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  let dateStr = String(isoString);
  if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.match(/-\d\d:\d\d$/)) {
    dateStr += 'Z';
  }
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'just now'; // avoid negative in case of minor clock skew
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  let dateStr = String(isoString);
  if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.match(/-\d\d:\d\d$/)) {
    dateStr += 'Z';
  }
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}

const _escDiv = document.createElement('div');
function escHtml(str) {
  if (!str) return '';
  _escDiv.textContent = str;
  return _escDiv.innerHTML;
}

// IMPROVED: card mouse-glow effect using delegation
function initCardGlow() {
  document.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  });
}

function initMagneticButtons() {
  document.addEventListener('pointermove', (e) => {
    const btn = e.target.closest('.btn-primary');
    if (!btn || btn.disabled || btn.classList.contains('loading')) return;

    const rect = btn.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.2;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.2;
    btn.style.transform = `translate(${x}px, ${y}px) scale(1.02)`;

    if (!btn.dataset.magnetic) {
      btn.dataset.magnetic = 'true';
      const reset = () => {
        btn.style.transform = '';
        btn.dataset.magnetic = '';
        btn.removeEventListener('pointerleave', reset);
      };
      btn.addEventListener('pointerleave', reset);
    }
  });
}

function initPageTransitions() {
  document.querySelectorAll('a[href]').forEach(a => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !rawHref.startsWith('#') && !rawHref.startsWith('javascript:')) {
      a.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank') return;
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.2s';
      });
    }
  });
  window.addEventListener('pageshow', () => {
    document.body.style.opacity = '1';
    document.body.style.transition = 'opacity 0.2s';
  });
}

function initRevealObserver() {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { 
    threshold: 0.05,
    rootMargin: '0px 0px -50px 0px' 
  });

  const elements = document.querySelectorAll('.reveal, .fade-in, .stagger > *, .card, .stat-card');
  elements.forEach(el => revealObserver.observe(el));

  // FALLBACK: Force reveal after loader finishes
  setTimeout(() => {
    elements.forEach(el => {
      if (!el.classList.contains('active')) el.classList.add('active');
    });
  }, 2500);

}

document.addEventListener('DOMContentLoaded', () => {
  initRevealObserver();
  window.initCounters();
  hydrateNavbar();
  updateThemeIcon();
  initCardGlow();
  initMagneticButtons();
  initPageTransitions();
});

// If script runs late
if (document.readyState !== 'loading' && !document.querySelector('.reveal.active')) {
  initRevealObserver();
}
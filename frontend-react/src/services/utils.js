/* ── SmartApply Shared Utilities ────────────────────────────────────────── */

/** HTML-escape a string to prevent XSS in innerHTML contexts */
export function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/** Relative time string ("2 hours ago", "just now") */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format a date string for display */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Get a URL search parameter by name */
export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

/** Password strength scoring (0-4) */
export function getPasswordStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

/** Strength bar colors */
export function getStrengthColor(score) {
  const colors = ['var(--danger)', 'var(--danger)', 'var(--accent-2)', 'var(--accent)', 'var(--accent)'];
  return colors[score] || colors[0];
}

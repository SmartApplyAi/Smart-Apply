/* ── SmartApply Auth Service ────────────────────────────────────────────── */

const TOKEN_KEY = 'sa_token';
const USER_KEY = 'sa_user';

const auth = {
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },

  isLoggedIn() {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  logout() {
    auth.clear();
    window.location.href = '/';
  },
};

export default auth;

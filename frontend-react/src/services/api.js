/* ── SmartApply API Service ─────────────────────────────────────────────── */
const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('sa_token') || '';
}

function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse(resp) {
  if (resp.status === 401) {
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_user');
    window.location.href = '/login';
    throw { detail: 'Session expired. Please log in again.' };
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw data;
  }
  return data;
}

const api = {
  async get(path) {
    const resp = await fetch(BASE_URL + path, {
      headers: authHeaders(),
    });
    return handleResponse(resp);
  },

  async post(path, body) {
    const resp = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return handleResponse(resp);
  },

  async put(path, body) {
    const resp = await fetch(BASE_URL + path, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return handleResponse(resp);
  },

  async delete(path) {
    const resp = await fetch(BASE_URL + path, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(resp);
  },

  async request(method, path, body) {
    const resp = await fetch(BASE_URL + path, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse(resp);
  },

  async upload(path, formData) {
    const resp = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    return handleResponse(resp);
  },
};

export default api;

import axios from 'axios';
import { authStore } from '../auth/authStore';
import { refreshManager } from '../auth/refreshManager';

// We create an axios instance to easily apply interceptors
const api = axios.create({
  baseURL: '/api',
});

// Request interceptor: add auth token from volatile memory
api.interceptors.request.use(
  (config) => {
    const token = authStore.getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401s and attempt refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Do not try to refresh if the failed request was already a refresh attempt
      if (originalRequest.url === '/auth/refresh') {
         return Promise.reject(error);
      }

      try {
        await refreshManager.refresh();
        // Since refresh succeeded, the new token is in authStore.
        // Update the header and retry the original request
        originalRequest.headers['Authorization'] = `Bearer ${authStore.getToken()}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed (e.g. refresh token expired or revoked)
        // Clean up and potentially trigger a redirect via a global event or context
        authStore.clear();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Wrapper mapping the old API methods to the new Axios instance to avoid breaking existing code
const legacyApi = {
  async get(path) {
    try {
      const res = await api.get(path);
      return res.data;
    } catch (e) {
      throw e.response?.data || e;
    }
  },

  async post(path, body, config = {}) {
    try {
      const res = await api.post(path, body, config);
      return res.data;
    } catch (e) {
      throw e.response?.data || e;
    }
  },

  async put(path, body) {
    try {
      const res = await api.put(path, body);
      return res.data;
    } catch (e) {
      throw e.response?.data || e;
    }
  },

  async patch(path, body) {
    try {
      const res = await api.patch(path, body);
      return res.data;
    } catch (e) {
      throw e.response?.data || e;
    }
  },

  async delete(path) {
    try {
      const res = await api.delete(path);
      return res.data;
    } catch (e) {
      throw e.response?.data || e;
    }
  },

  async upload(path, formData) {
    try {
      const res = await api.post(path, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    } catch (e) {
      throw e.response?.data || e;
    }
  }
};

export default legacyApi;

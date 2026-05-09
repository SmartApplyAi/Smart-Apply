import api from '../services/api';
import { authStore } from './authStore';

let refreshPromise = null;

export const refreshManager = {
  async refresh() {
    // Return existing promise if already refreshing (Singleton lock to prevent rotation collisions)
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const res = await api.post('/auth/refresh', {}, { withCredentials: true });
        if (res.data && res.data.access_token) {
          authStore.setToken(res.data.access_token);
          return res.data;
        }
        throw new Error('No access token returned in refresh');
      } catch (err) {
        authStore.clear();
        throw err;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }
};

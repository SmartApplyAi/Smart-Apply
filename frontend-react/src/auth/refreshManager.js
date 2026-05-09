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
        // Use raw axios to ensure withCredentials is set and we handle the response correctly
        const { default: axios } = await import('axios');
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const data = res.data;
        if (data && data.access_token) {
          authStore.setToken(data.access_token);
          return data;
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

// Single source of truth for the volatile access token
let memoryToken = null;

export const authStore = {
  getToken() {
    return memoryToken;
  },

  setToken(token) {
    memoryToken = token;
  },

  clear() {
    memoryToken = null;
  }
};

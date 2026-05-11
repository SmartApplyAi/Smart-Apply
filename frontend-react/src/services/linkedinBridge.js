/* ── SmartApply LinkedIn Bridge — Standardized Migration ───────────────────── */

let _extensionId = null;
const SCRAPE_TIMEOUT_MS = 30000;

/** Get the configured extension ID */
function getExtensionId() {
  return _extensionId || window.SMARTAPPLY_EXTENSION_ID || localStorage.getItem('sa_ext_id') || '';
}

/** Send a message to the Chrome extension with timeout */
function sendMessage(msg, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const id = getExtensionId();
    if (!id || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve({ ok: false, error: 'extension_not_found' });
      return;
    }

    const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeoutMs);

    try {
      chrome.runtime.sendMessage(id, msg, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: 'extension_not_found', detail: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: 'no_response' });
        }
      });
    } catch (e) {
      clearTimeout(timer);
      resolve({ ok: false, error: 'extension_not_found', detail: e.message });
    }
  });
}

const LinkedInBridge = {
  /** Check if the extension is installed and responsive */
  async isInstalled() {
    const result = await sendMessage({ type: 'PING' }, 3000);
    return result?.ok === true;
  },

  /** Scrape the user's LinkedIn profile via the extension */
  async scrapeProfile() {
    const installed = await LinkedInBridge.isInstalled();
    if (!installed) {
      return { ok: false, error: 'extension_not_found' };
    }
    return sendMessage({ type: 'SCRAPE_LINKEDIN' }, SCRAPE_TIMEOUT_MS);
  },

  /** Get session cookies from extension */
  async getSessionCookies() {
    return sendMessage({ type: 'GET_COOKIES' }, 5000);
  },

  /** Sync the updated profile (including resume data) live to the extension */
  async syncProfileToExtension(user) {
    return sendMessage({ type: 'SYNC_PROFILE', user }, 5000);
  },


};

export default LinkedInBridge;


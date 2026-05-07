/* ── SmartApply LinkedIn Bridge ─────────────────────────────────────────── */
/* Communicates with the SmartApply Chrome Extension via chrome.runtime.sendMessage */

let _extensionId = null;

/** Set the extension ID (call once at app init) */
export function setExtensionId(id) {
  _extensionId = id;
}

/** Get the configured extension ID */
export function getExtensionId() {
  return _extensionId || window.SMARTAPPLY_EXTENSION_ID || localStorage.getItem('sa_ext_id') || '';
}

/** Send a message to the Chrome extension */
function sendMessage(action, data = {}) {
  return new Promise((resolve) => {
    const id = getExtensionId();
    if (!id || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve({ ok: false, error: 'extension_not_found' });
      return;
    }
    try {
      chrome.runtime.sendMessage(id, { action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: 'extension_not_found' });
        } else {
          resolve(response || { ok: false, error: 'no_response' });
        }
      });
    } catch {
      resolve({ ok: false, error: 'extension_not_found' });
    }
  });
}

const LinkedInBridge = {
  /** Check if the extension is installed and responsive */
  async isInstalled() {
    const result = await sendMessage('ping');
    return result?.ok === true;
  },

  /** Scrape the user's LinkedIn profile via the extension */
  async scrapeProfile() {
    const installed = await LinkedInBridge.isInstalled();
    if (!installed) {
      return { ok: false, error: 'extension_not_found' };
    }
    const result = await sendMessage('scrape_profile');
    return result;
  },

  /** Sync cookies to the extension */
  async syncCookies() {
    return sendMessage('sync_cookies');
  },

  /** Full import flow: scrape + save to backend */
  async importAndSave(token, overwrite = false) {
    const scrapeResult = await LinkedInBridge.scrapeProfile();
    if (!scrapeResult.ok) return scrapeResult;

    try {
      const resp = await fetch('/api/profile/import-linkedin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          raw_linkedin_data: scrapeResult.data,
          overwrite,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) return { ok: false, error: data.detail || 'save_failed' };
      return { ok: true, data: scrapeResult.data, message: data.message };
    } catch (e) {
      return { ok: false, error: e.message || 'network_error' };
    }
  },
};

/** Fetch the extension ID from the backend config endpoint */
export async function initExtensionId() {
  try {
    const resp = await fetch('/api/config/extension');
    const data = await resp.json();
    if (data.extension_id) {
      _extensionId = data.extension_id;
      window.SMARTAPPLY_EXTENSION_ID = data.extension_id;
    }
  } catch (err) {
    console.warn('Could not fetch extension config:', err);
  }
}

export default LinkedInBridge;

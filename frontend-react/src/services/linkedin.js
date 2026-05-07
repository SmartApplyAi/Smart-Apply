/* ── SmartApply — LinkedIn Scraper Bridge (React Version) ────────────────── */

const SCRAPE_TIMEOUT_MS = 30000;

async function getExtensionId() {
  try {
    // Try to get from window if set by some script, else fetch from config
    if (window.SMARTAPPLY_EXTENSION_ID) return window.SMARTAPPLY_EXTENSION_ID;
    
    const resp = await fetch('/api/config/extension');
    const data = await resp.json();
    if (data.extension_id) {
      window.SMARTAPPLY_EXTENSION_ID = data.extension_id;
      return data.extension_id;
    }
  } catch (e) {
    console.error('Failed to fetch extension config:', e);
  }
  return localStorage.getItem('sa_ext_id') || 'YOUR_EXTENSION_ID_HERE';
}

function sendMsg(msg, timeoutMs = 10000) {
  return new Promise(async (resolve, reject) => {
    const extId = await getExtensionId();
    if (extId === 'YOUR_EXTENSION_ID_HERE') {
      reject(new Error('Extension ID not configured'));
      return;
    }

    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome runtime not available'));
      return;
    }

    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);

    try {
      chrome.runtime.sendMessage(extId, msg, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || {});
        }
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

const linkedin = {
  async isInstalled() {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return false;
    try {
      const res = await sendMsg({ type: 'PING' }, 3000);
      return res?.ok === true;
    } catch {
      return false;
    }
  },

  async scrapeProfile() {
    const installed = await this.isInstalled();
    if (!installed) return { ok: false, error: 'extension_not_found' };

    try {
      const res = await sendMsg({ type: 'SCRAPE_LINKEDIN' }, SCRAPE_TIMEOUT_MS);
      return res;
    } catch (e) {
      console.error('LinkedIn Scrape failed:', e);
      if (String(e).includes('timeout')) return { ok: false, error: 'timeout' };
      return { ok: false, error: 'extension_not_found', detail: String(e) };
    }
  },

  async getSessionCookies() {
    if (!(await this.isInstalled())) return { ok: false, error: 'extension_not_found' };
    try {
      const res = await sendMsg({ type: 'GET_COOKIES' }, 5000);
      return res;
    } catch (e) {
      return { ok: false, error: 'cookie_sync_failed', detail: String(e) };
    }
  }
};

export default linkedin;

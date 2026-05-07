/* ── SmartApply — LinkedIn Scraper Bridge v1.0 ───────────────────────────
   Runs on website pages (profile.html, resume.html).
   Communicates with the SmartApply Chrome Extension via
   chrome.runtime.sendMessage(EXTENSION_ID, msg).

   HOW TO GET EXTENSION_ID:
   1. Load extension unpacked in chrome://extensions
   2. Copy the "ID" shown (32 lowercase letters)
   3. Set SMARTAPPLY_EXTENSION_ID in your .env or hardcode below.
   4. Extension manifest.json must list this page origin in externally_connectable.
─────────────────────────────────────────────────────────────────────── */

(function () {
  "use strict";

  /**
   * Get the extension ID dynamically.
   * Prioritizes: window.SMARTAPPLY_EXTENSION_ID (from server) > localStorage > fallback.
   */
  function getExtensionId() {
    return (
      window.SMARTAPPLY_EXTENSION_ID ||
      localStorage.getItem("sa_ext_id") ||
      "YOUR_EXTENSION_ID_HERE"
    );
  }

  const SCRAPE_TIMEOUT_MS = 30000; // 30s — LinkedIn is slow

  // ── Public API ────────────────────────────────────────────────────────────
  window.LinkedInBridge = {

    /**
     * Returns true if chrome.runtime is available and extension responds to PING.
     * Does NOT throw — always resolves.
     */
    async isInstalled() {
      if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return false;
      try {
        const res = await _sendMsg({ type: "PING" }, 3000);
        return res?.ok === true;
      } catch {
        return false;
      }
    },

    /**
     * Scrape the user's LinkedIn profile.
     *
     * @returns {Promise<{ok: boolean, data?: object, error?: string, detail?: string}>}
     *
     * Possible errors:
     *   "extension_not_found"  — extension not installed
     *   "not_logged_in"        — LinkedIn tab redirected to login
     *   "scrape_failed"        — DOM selectors found nothing
     *   "timeout"              — took longer than SCRAPE_TIMEOUT_MS
     *   "scrape_error"         — JS exception in content script
     */
    async scrapeProfile() {
      const installed = await this.isInstalled();
      if (!installed) {
        return { ok: false, error: "extension_not_found" };
      }

      try {
        const res = await _sendMsg({ type: "SCRAPE_LINKEDIN" }, SCRAPE_TIMEOUT_MS);
        return res;
      } catch (e) {
        console.error("LinkedInBridge: Scrape failed:", e);
        if (String(e).includes("timeout")) return { ok: false, error: "timeout" };
        return { ok: false, error: "extension_not_found", detail: String(e) };
      }
    },

    /**
     * Request LinkedIn session cookies from extension.
     */
    async getSessionCookies() {
      if (!(await this.isInstalled())) return { ok: false, error: "extension_not_found" };
      try {
        const res = await _sendMsg({ type: "GET_COOKIES" }, 5000);
        return res;
      } catch (e) {
        return { ok: false, error: "cookie_sync_failed", detail: String(e) };
      }
    },

    /**
     * Full flow: scrape → preview → POST to backend → return result.
     * Shows loading/error toasts via showToast (app.js).
     *
     * @param {object} opts
     * @param {boolean} opts.overwrite - overwrite existing profile fields
     * @param {function} opts.onPreview - callback(data) before saving — return false to cancel
     * @returns {Promise<{ok: boolean, result?: object, error?: string}>}
     */
    async importAndSave({ overwrite = false, onPreview = null } = {}) {
      // Check extension
      const installed = await this.isInstalled();
      if (!installed) {
        _showInstallPrompt();
        return { ok: false, error: "extension_not_found" };
      }

      // Show loading
      const toastId = _showLoadingToast("Scraping your LinkedIn profile…");

      let scraped;
      try {
        scraped = await this.scrapeProfile();
      } finally {
        _removeToast(toastId);
      }

      if (!scraped.ok) {
        const msgs = {
          not_logged_in:       "Not logged into LinkedIn. Open linkedin.com and log in first.",
          scrape_failed:       "Could not read LinkedIn profile — it may be private.",
          timeout:             "Scrape timed out (>30s). LinkedIn loaded too slowly.",
          scrape_error:        "Extension error: " + (scraped.detail || ""),
          extension_not_found: "Extension not found. Install SmartApply extension first.",
        };
        _toast(msgs[scraped.error] || "LinkedIn import failed.", "error");
        return { ok: false, error: scraped.error };
      }

      const data = scraped.data;

      // Preview callback — caller can show modal + allow cancel
      if (typeof onPreview === "function") {
        const proceed = await onPreview(data);
        if (proceed === false) {
          return { ok: false, error: "user_cancelled" };
        }
      }

      // POST to backend
      _toast("Saving LinkedIn data to your profile…", "info");
      try {
        // C2: Token is httpOnly cookie — use credentials: include
        const res = await fetch("/api/profile/import-linkedin", {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ raw_linkedin_data: data, overwrite }),
        });

        const result = await res.json();
        if (!res.ok) {
          _toast("Backend error: " + (result.detail || res.status), "error");
          return { ok: false, error: "backend_error", detail: result.detail };
        }

        _toast(`✓ ${result.message}`, "success");
        return { ok: true, result };

      } catch (e) {
        _toast("Network error saving profile.", "error");
        return { ok: false, error: "network_error", detail: String(e) };
      }
    },

    /**
     * Set extension ID at runtime (for users who need to enter their ID).
     */
    setExtensionId(id) {
      localStorage.setItem("sa_ext_id", id.trim());
      location.reload();
    },
  };

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _sendMsg(msg, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const extId = getExtensionId();
      if (extId === "YOUR_EXTENSION_ID_HERE") {
        reject(new Error("Extension ID not configured"));
        return;
      }

      const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);

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

  function _toast(msg, type = "info") {
    if (typeof showToast === "function") showToast(msg, type);
    else console.log(`[LinkedInBridge][${type}] ${msg}`);
  }

  let _loadingEl = null;
  function _showLoadingToast(msg) {
    _toast(msg, "info");
    return "loading";
  }
  function _removeToast() { /* toasts auto-dismiss in app.js */ }

  function _showInstallPrompt() {
    // Show a modal/banner prompting extension install
    const existing = document.getElementById("sa-ext-install-banner");
    if (existing) { existing.style.display = "block"; return; }

    const banner = document.createElement("div");
    banner.id = "sa-ext-install-banner";
    banner.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:var(--glass-bg,#fff);border:1px solid var(--border,#e5e5ea);" +
      "border-radius:16px;padding:20px 28px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.15);" +
      "display:flex;align-items:center;gap:16px;max-width:480px;backdrop-filter:blur(20px);";
    banner.innerHTML = `
      <i class="fa-brands fa-chrome" style="font-size:32px;color:var(--primary)"></i>
      <div style="flex:1">
        <div style="font-weight:600;margin-bottom:4px">Install SmartApply Extension</div>
        <div style="font-size:13px;color:var(--text-2)">Required for LinkedIn auto-fill &amp; scraping</div>
      </div>
      <a href="/api/jobs/extension/download" class="btn btn-primary btn-sm" target="_blank">Install</a>
      <button onclick="document.getElementById('sa-ext-install-banner').style.display='none'"
              style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-2)">×</button>
    `;
    document.body.appendChild(banner);
  }

})();

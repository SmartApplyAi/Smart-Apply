// ── SmartApply Bundled Content Script ────────────────────────────────
// All ES modules concatenated. import/export stripped (MV3 content scripts
// do not support ES module syntax without a bundler).

(function() {
"use strict";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_WEBAPP_AUTH_FLAG') {
    if (message.token && message.user) {
      localStorage.setItem('sa_token', message.token);
      localStorage.setItem('sa_user', JSON.stringify(message.user));
      localStorage.setItem('sa_auth', '1');
      
      // Dispatch event in the main world to trigger React state update
      const script = document.createElement('script');
      script.textContent = "window.dispatchEvent(new Event('storage'));";
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    }
    if (sendResponse) sendResponse({ ok: true });
  }
});



// ════ shared/constants.js ════

// ── SmartApply Extension Constants ────────────────────────────────────────

const API_BASE = 'https://www.smartapplies.app/api';

// Google OAuth Client ID (must match backend and shared/constants.js)
const GOOGLE_CLIENT_ID = '778305675120-bicqh3g6ep9m1nh5gdp5mqahonddphim.apps.googleusercontent.com';

const STATES = {
  IDLE: 'idle',
  MODAL_DETECTED: 'modal_detected',
  CONTACT_INFO: 'contact_info',
  RESUME: 'resume',
  SCREENING_QUESTIONS: 'screening_questions',
  REVIEW: 'review',
  SUBMIT_PENDING: 'submit_pending',
  SUCCESS: 'success',
  ERROR: 'error',
};

const SELECTORS = {
  modal: {
    container: "div.artdeco-modal[role='dialog']",
    content: '.artdeco-modal__content',
    dismiss: "button.artdeco-modal__dismiss, button[aria-label='Dismiss']",
    progressBar: "div[role='progressbar']",
    primaryBtn: 'footer button.artdeco-button--primary',
    footerBtns: 'footer .artdeco-button',
    title: '.artdeco-modal h3, .jobs-easy-apply-modal h3, [data-test-modal-id] h2',
    scrollable: '.jobs-easy-apply-content, .artdeco-modal__content',
  },
  contact: {
    email: "input[id*='emailAddress'], select[id*='email']",
    phoneCountry: "select[id*='phoneNumber-country'], select[id*='phone-country']",
    phoneNumber: "input[id*='phoneNumber-nationalNumber'], input[id*='phone-nationalNumber']",
    firstName: "input[id*='firstName'], input[name='firstName']",
    lastName: "input[id*='lastName'], input[name='lastName']",
  },
  resume: {
    fileInput: "input[type='file']",
    uploadBtn: "label.jobs-document-upload__upload-button",
    selectedResume: "div.jobs-resume-picker__resume-btn--selected",
    resumeItem: ".jobs-resume-picker__resume-btn",
  },
  questions: {
    grouping: '.jobs-easy-apply-form-section__grouping',
    label: '.fb-dash-form-element__label, label',
    radioYes: "input[type='radio'][value='Yes']",
    radioNo: "input[type='radio'][value='No']",
    radioLabel: "input[type='radio'] + label, .fb-dash-form-element input[type='radio'] ~ label",
    combobox: "div[role='combobox']",
    listbox: "div[role='listbox']",
    option: "div[role='option']",
    textInput: "input.fb-dash-form-element__input, input[class*='text-input']",
    numberInput: "input[type='number']",
    textarea: "textarea.fb-dash-form-element__input, textarea",
    checkbox: "input[type='checkbox']",
    dateInput: "input[type='date'], input[id*='dateRange']",
    select: 'select',
    formElement: '.fb-dash-form-element',
  },
  review: {
    submitBtn: "button[aria-label='Submit application'], button[aria-label*='Submit']",
    editBtn: "button[aria-label*='Edit']",
    sections: '.jobs-easy-apply-content section',
  },
  success: {
    heading: 'h3.t-24, .artdeco-inline-feedback--success h3',
    doneBtn: "button[aria-label*='Done'], button[aria-label*='Close']",
    container: '.jobs-easy-apply-content--success, [data-test-modal-id*="success"]',
    confetti: '.artdeco-toast-item--success',
  },
  validation: {
    errorText: '.artdeco-inline-feedback--error, .fb-dash-form-element__error-field',
    errorMsg: '.artdeco-inline-feedback__message',
    disabledPrimary: 'footer button.artdeco-button--primary[disabled]',
    spinner: '.artdeco-loader, .artdeco-button__loading-indicator',
  },
  page: {
    jobsSearch: '.jobs-search-results-list, .scaffold-layout--list-detail',
    jobDetail: '.jobs-unified-top-card, .jobs-details',
    easyApplyBtn: "#jobs-apply-button-id, button[data-live-test-job-apply-button], button[data-job-id].jobs-apply-button, button.jobs-apply-button[aria-label*='Easy Apply'], button[aria-label*='Easy Apply']",
    jobTitle: '.jobs-unified-top-card__job-title, h1.t-24',
    company: '.jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a',
    jobCard: '.job-card-container, .jobs-search-results__list-item',
    jobCardEasyApply: ".job-card-container__footer-item[aria-label*='Easy Apply'], .job-card-list__footer-wrapper",
  },
};

const DELAYS = {
  SHORT: 500,
  MEDIUM: 1000,
  LONG: 2000,
  EXTRA_LONG: 3000,
  AFTER_CLICK: 1500,
  DOM_STABLE: 800,
  RERENDER: 1200,
};

const MAX_RETRIES = 3;
const HEARTBEAT_INTERVAL = 30000; // 30s


// ════ shared/schemas.js ════

// ── Default State Schema ───────────────────────────────────────────────────

function createDefaultState() {
  return {
    job: {
      jobId: '',
      jobUrl: '',
      company: '',
      title: '',
    },
    profile: {
      fullName: '',
      firstName: '',
      lastName: '',
      email: '',
      phoneCountryCode: '+91',
      phoneNumber: '',
      resumePath: '',
      answers: {},
      // Job preferences (populated from API on login)
      search_terms: [],
      search_location: 'India',
      experience_level: ['Entry level'],
      on_site: ['On-site', 'Hybrid', 'Remote'],
      date_posted: 'Past month',
      easy_apply_only: true,
      bad_words: [],
      switch_number: 15,
    },
    selectors: {
      modal: {},
      contact: {},
      resume: {},
      questions: {},
      review: {},
      success: {},
    },
    runtime: {
      currentStep: 'idle',
      progress: 0,
      lastError: '',
      retryCount: 0,
      sessionId: '',
      token: '',
      extensionToken: '',
      userEmail: '',
      isRunning: false,
      isPaused: false,
      totalApplied: 0,
      totalFailed: 0,
      totalSkipped: 0,
      currentSearchTermIndex: 0,
      currentSearchTerm: '',
    },
    settings: {
      maxApplications: 15,
      humanConfirmSubmit: false,
      delayBetweenApps: 3000,
    },
  };
}

function createSessionLog(step, status, message, data = {}) {
  return {
    step,
    status,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}


// ════ content/logger.js ════

// ── Content Script Logger ─────────────────────────────────────────────────

const PREFIX = '[SmartApply]';

const logger = {
  info: (msg, ...args) => { console.log(`${PREFIX} ℹ️  ${msg}`, ...args); if(window.appendLogToUI) window.appendLogToUI(`ℹ️ ${msg}`, 'info'); },
  success: (msg, ...args) => { console.log(`${PREFIX} ✅ ${msg}`, ...args); if(window.appendLogToUI) window.appendLogToUI(`✅ ${msg}`, 'success'); },
  warn: (msg, ...args) => { console.warn(`${PREFIX} ⚠️  ${msg}`, ...args); if(window.appendLogToUI) window.appendLogToUI(`⚠️ ${msg}`, 'warn'); },
  error: (msg, ...args) => { console.error(`${PREFIX} ❌ ${msg}`, ...args); if(window.appendLogToUI) window.appendLogToUI(`❌ ${msg}`, 'error'); },
  debug: (msg, ...args) => { console.debug(`${PREFIX} 🔍 ${msg}`, ...args); },
  step: (step, msg, ...args) => { console.log(`${PREFIX} [${step.toUpperCase()}] ${msg}`, ...args); if(window.appendLogToUI) window.appendLogToUI(`[${step.toUpperCase()}] ${msg}`, 'info'); },
};

function sendLog(step, status, message, data = {}) {
  chrome.runtime.sendMessage({
    type: 'LOG_STEP',
    payload: { step, status, message, data, timestamp: Date.now() },
  }).catch(() => {});
}


// ════ content/dom-parser.js ════

// ── DOM Utilities ─────────────────────────────────────────────────────────

/**
 * Wait for element matching selector to appear in DOM.
 * Returns element or null on timeout.
 */
function waitFor(selector, timeout = 8000, root = document) {
  return new Promise((resolve) => {
    const existing = root.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(root.body || root, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Wait for all elements matching selector.
 */
function waitForAll(selector, minCount = 1, timeout = 8000, root = document) {
  return new Promise((resolve) => {
    const check = () => {
      const els = root.querySelectorAll(selector);
      if (els.length >= minCount) return Array.from(els);
      return null;
    };

    const existing = check();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const els = check();
      if (els) {
        observer.disconnect();
        resolve(els);
      }
    });
    observer.observe(root.body || root, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(Array.from(root.querySelectorAll(selector)));
    }, timeout);
  });
}

/**
 * Wait for element to disappear.
 */
function waitForGone(selector, timeout = 8000, root = document) {
  return new Promise((resolve) => {
    if (!root.querySelector(selector)) return resolve(true);

    const observer = new MutationObserver(() => {
      if (!root.querySelector(selector)) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(root.body || root, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeout);
  });
}

/**
 * Wait for DOM to stabilize (no mutations for `stableMs`).
 */
function waitForStable(stableMs = 300, timeout = 3000) {
  return new Promise((resolve) => {
    let timer = null;
    let elapsed = 0;
    const interval = 100;

    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        observer.disconnect();
        resolve(true);
      }, stableMs);
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    // Start initial timer in case page is already stable
    timer = setTimeout(() => {
      observer.disconnect();
      resolve(true);
    }, stableMs);

    // Hard timeout
    setTimeout(() => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(false);
    }, timeout);
  });
}

/**
 * Sleep for ms milliseconds.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Scroll element into view within a scrollable container.
 */
function scrollIntoView(el, container) {
  if (!el) return;
  if (container) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Scroll scrollable container to bottom.
 */
function scrollToBottom(container) {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}

/**
 * Get visible text of element.
 */
function getLabel(el) {
  if (!el) return '';
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent.trim();
  }
  const wrapper = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__grouping');
  if (wrapper) {
    const label = wrapper.querySelector('label, .fb-dash-form-element__label');
    if (label) return label.textContent.trim();
  }
  return el.placeholder || el.name || '';
}

/**
 * Simulate real user input (React/Vue compatible).
 */
function nativeInput(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  );
  if (nativeInputValueSetter) {
    nativeInputValueSetter.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Simulate real user textarea input.
 */
function nativeTextarea(el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  );
  if (nativeSetter) {
    nativeSetter.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Check if element is visible in viewport.
 */
function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
}

/**
 * Find element by partial text content.
 */
function findByText(selector, text, root = document) {
  return Array.from(root.querySelectorAll(selector)).find(
    (el) => el.textContent.trim().toLowerCase().includes(text.toLowerCase())
  );
}

/**
 * Universal Resume Upload Field Detection Engine.
 * Searches for file inputs in the current DOM, iframes, and shadow roots.
 * Supports hidden inputs and dynamic rendering with MutationObserver.
 */
async function findResumeUploadField(root = document, timeout = 8000) {
  logger.info('Searching for resume upload field...');

  const selectors = [
    "input[type='file'][id*='resume']:not([disabled])",
    "input[type='file'][name*='resume']:not([disabled])",
    "input[type='file'][aria-label*='resume']:not([disabled])",
    "input[type='file'][title*='resume']:not([disabled])",
    "input[type='file'][accept*='pdf']:not([disabled])",
    "input[type='file']:not([disabled])",
  ];

  const searchInContext = (ctx) => {
    // 1. Try prioritized selectors
    for (const sel of selectors) {
      try {
        const el = ctx.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    
    // 2. Search all inputs for 'file' type (in case type is changed dynamically)
    try {
      const allInputs = ctx.querySelectorAll('input');
      for (const input of allInputs) {
        if (input.type === 'file') return input;
      }
    } catch (e) {}

    // 3. Recursive Shadow DOM search
    try {
      const allElements = ctx.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          const found = searchInContext(el.shadowRoot);
          if (found) return found;
        }
      }
    } catch (e) {}

    return null;
  };

  const findWithIframes = () => {
    // Check main context
    let found = searchInContext(root);
    if (found) return found;

    // Check iframes (only same-origin or granted host permissions)
    try {
      const iframes = root.querySelectorAll('iframe');
      for (const frame of iframes) {
        try {
          const frameDoc = frame.contentDocument || frame.contentWindow.document;
          if (frameDoc) {
            found = searchInContext(frameDoc);
            if (found) return found;
          }
        } catch (e) {}
      }
    } catch (e) {}
    
    return null;
  };

  // 1. Immediate search
  let field = findWithIframes();
  if (field) {
    logger.success('[SmartApply] Resume upload field detected');
    return field;
  }

  // 2. Wait for dynamic injection (MutationObserver)
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const f = findWithIframes();
      if (f) {
        observer.disconnect();
        logger.success('[SmartApply] Resume upload field detected via observer');
        resolve(f);
      }
    });

    observer.observe(root.body || root, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      logger.warn('[SmartApply] Search timeout for resume field');
      resolve(null);
    }, timeout);
  });
}

/**
 * Ensure a hidden or collapsed file input is interactable.
 */
function activateHiddenInput(input) {
  if (!input) return;
  const style = window.getComputedStyle(input);
  const isHidden = style.display === 'none' || 
                   style.visibility === 'hidden' || 
                   parseFloat(style.opacity) === 0 ||
                   parseInt(style.height) === 0 ||
                   parseInt(style.width) === 0;

  if (isHidden) {
    logger.info('[SmartApply] Hidden uploader activated');
    input.style.setProperty('display', 'block', 'important');
    input.style.setProperty('visibility', 'visible', 'important');
    input.style.setProperty('opacity', '1', 'important');
    input.style.setProperty('width', '1px', 'important');
    input.style.setProperty('height', '1px', 'important');
    input.style.setProperty('position', 'absolute', 'important');
    input.style.setProperty('left', '0', 'important');
    input.style.setProperty('top', '0', 'important');
  }
}



// ════ content/selector-registry.js ════

// ── Selector Registry ─────────────────────────────────────────────────────
// Ordered fallback arrays — try first that matches.

const REGISTRY = {

  modal: {
    container: [
      "div.artdeco-modal[role='dialog']",
      '.jobs-easy-apply-modal',
      "[data-test-modal-id='jobs-apply-modal']",
    ],
    content: [
      '.artdeco-modal__content',
      '.jobs-easy-apply-content',
      '.jobs-easy-apply-modal__content',
    ],
    dismiss: [
      "button[aria-label='Dismiss']",
      'button.artdeco-modal__dismiss',
      "button[aria-label='Close']",
    ],
    progressBar: [
      "div[role='progressbar']",
      '.artdeco-completeness-meter-linear__progress-element',
    ],
    primaryBtn: [
      'footer button.artdeco-button--primary',
      'footer .artdeco-button--primary',
      "[data-easy-apply-next-button]",
      "button.artdeco-button--primary[data-control-name='continue_unify']",
      "button.artdeco-button--primary[data-control-name='submit_unify']",
      ".jobs-easy-apply-modal__footer button.artdeco-button--primary",
      "div.display-flex.justify-flex-end button.artdeco-button--primary",
      "button.artdeco-button--primary" // Ultimate fallback
    ],
    footerBtns: [
      'footer .artdeco-button',
      '.jobs-easy-apply-modal__footer .artdeco-button',
      'div.display-flex.justify-flex-end .artdeco-button'
    ],
    title: [
      '.jobs-easy-apply-modal__title',
      '.artdeco-modal h3.t-20',
      'h3.jobs-easy-apply-form-section__title',
    ],
  },

  contact: {
    email: [
      "input[id*='emailAddress']",
      "input[name*='email']",
      "input[type='email']",
    ],
    phoneCountry: [
      "select[id*='phoneNumber-country']",
      "select[id*='phone-country']",
      "select[id*='phoneCountryCode']",
      "select[name*='countryCode']",
    ],
    phoneNumber: [
      "input[id*='phoneNumber-nationalNumber']",
      "input[id*='phone-nationalNumber']",
      "input[id*='mobile']",
      "input[name*='phoneNumber']",
      "input[name*='phone']",
      "input[type='tel']",
    ],
  },

  resume: {
    fileInput: [
      "input[type='file'][accept*='pdf']",
      "input[type='file'][id*='resume']",
      "input[type='file'][name*='resume']",
      "input[type='file'][aria-label*='resume']",
      "input[type='file'][title*='resume']",
      "input[type='file']",
    ],
    selectedBtn: [
      '.jobs-resume-picker__resume-btn--selected',
      '.jobs-document-upload__resume-selected',
      '.artdeco-inline-feedback--success',
    ],
    resumeItems: [
      '.jobs-resume-picker__resume-btn',
      '.jobs-resume-picker__resume-item',
      '.jobs-resume-picker__resume-list-item',
    ],
  },

  questions: {
    container: [
      '.jobs-easy-apply-form-section__grouping',
      '.fb-dash-form-element',
      '.jobs-easy-apply-form-section',
    ],
    label: [
      '.fb-dash-form-element__label',
      'label',
      '.jobs-easy-apply-form-section__sub-components label',
    ],
    textInput: [
      "input.fb-dash-form-element__input",
      "input[class*='text-input']",
      "input[type='text']",
    ],
    numberInput: [
      "input[type='number']",
      "input[class*='number']",
    ],
    textarea: [
      "textarea.fb-dash-form-element__input",
      "textarea",
    ],
    select: [
      'select',
    ],
    combobox: [
      "div[role='combobox']",
      ".artdeco-dropdown__trigger",
    ],
    listbox: [
      "div[role='listbox']",
      ".artdeco-dropdown__content",
    ],
    option: [
      "div[role='option']",
      ".artdeco-dropdown__item",
      "li[role='option']",
    ],
    radioGroup: [
      ".fb-dash-form-element fieldset",
      "fieldset.fb-dash-form-element",
    ],
    radioInput: [
      "input[type='radio']",
    ],
    checkbox: [
      "input[type='checkbox']",
    ],
    dateInput: [
      "input[type='date']",
      "input[id*='date']",
    ],
  },

  review: {
    submitBtn: [
      "button[aria-label='Submit application']",
      "button[aria-label*='Submit']",
      "footer button[aria-label*='Submit']",
    ],
    editBtns: [
      "button[aria-label*='Edit']",
      "button[aria-label*='edit']",
    ],
  },

  success: {
    container: [
      '.jobs-easy-apply-content--success',
      "[class*='success']",
    ],
    heading: [
      '.t-24.t-bold',
      'h3.t-24',
      '.artdeco-inline-feedback--success h3',
    ],
    closeBtn: [
      "button[aria-label*='Dismiss']",
      "button[aria-label*='Done']",
      "button[aria-label*='Close']",
    ],
  },

  validation: {
    errors: [
      '.artdeco-inline-feedback--error',
      '.fb-dash-form-element__error-field',
      "[aria-invalid='true']",
    ],
    errorMsg: [
      '.artdeco-inline-feedback__message',
      '.fb-dash-form-element__error-message',
    ],
    spinner: [
      '.artdeco-loader',
      '.artdeco-button__loading-indicator',
    ],
  },

};

/**
 * Query using fallback selector list. Returns first match.
 */
function queryOne(selectorList, root = document) {
  for (const sel of selectorList) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

/**
 * Query using fallback selector list. Returns first VISIBLE match.
 */
function queryVisible(selectorList, root = document) {
  for (const sel of selectorList) {
    try {
      const els = Array.from(root.querySelectorAll(sel));
      const visible = els.find(el => isVisible(el));
      if (visible) return visible;
    } catch (_) {}
  }
  return null;
}

/**
 * Query all using fallback selector list. Returns first non-empty result.
 */
function queryAll(selectorList, root = document) {
  for (const sel of selectorList) {
    try {
      const els = root.querySelectorAll(sel);
      if (els.length) return Array.from(els);
    } catch (_) {}
  }
  return [];
}


// ════ content/validation-handler.js ════

// ── Validation Handler ────────────────────────────────────────────────────

// [bundled] import { queryOne, queryAll, REGISTRY } from './selector-registry.js';
// [bundled] import { logger } from './logger.js';

/**
 * Detect all validation errors currently visible in modal.
 */
function getValidationErrors(modal) {
  const errors = [];
  const errEls = queryAll(REGISTRY.validation.errors, modal);
  for (const el of errEls) {
    const msgEl = el.querySelector('.artdeco-inline-feedback__message') ||
                  el.querySelector('.fb-dash-form-element__error-message') ||
                  el;
    const msg = msgEl?.textContent?.trim();
    if (msg) errors.push(msg);
  }
  return errors;
}

/**
 * Check if primary button is disabled.
 */
function isPrimaryBtnDisabled(modal) {
  const btn = modal?.querySelector('footer button.artdeco-button--primary');
  return btn ? btn.disabled || btn.getAttribute('aria-disabled') === 'true' : false;
}

/**
 * Check if spinner/loading is present.
 */
function isLoading(modal) {
  return !!queryOne(REGISTRY.validation.spinner, modal);
}

/**
 * Detect if form has required fields not yet filled.
 */
function getUnfilledRequired(modal) {
  const unfilled = [];
  const inputs = modal?.querySelectorAll('input[required], select[required], textarea[required]') || [];
  for (const input of inputs) {
    if (input.type === 'radio' || input.type === 'checkbox') continue;
    if (!input.value || input.value === '') {
      const label = getInputLabel(input);
      unfilled.push({ el: input, label });
    }
  }
  // Also check aria-required
  const ariaRequired = modal?.querySelectorAll('[aria-required="true"]') || [];
  for (const el of ariaRequired) {
    if (!el.value || el.value === '') {
      if (!unfilled.find(u => u.el === el)) {
        unfilled.push({ el, label: getInputLabel(el) });
      }
    }
  }
  return unfilled;
}

function getInputLabel(el) {
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent.trim();
  }
  const wrapper = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__grouping');
  if (wrapper) {
    const label = wrapper.querySelector('label');
    if (label) return label.textContent.trim();
  }
  return el.name || el.placeholder || 'unknown field';
}

/**
 * Check current step by analyzing footer button text.
 */
function detectStepByFooter(modal) {
  if (!modal) return null;
  const btns = modal.querySelectorAll('footer button');
  for (const btn of btns) {
    const text = btn.textContent.trim().toLowerCase();
    if (text.includes('submit')) return 'review';
    if (text.includes('review')) return 'pre_review';
    if (text.includes('next')) return 'step';
  }
  return null;
}

/**
 * Get progress percentage from progress bar.
 */
function getProgress(modal) {
  const bar = modal?.querySelector('[role="progressbar"]');
  if (!bar) return 0;
  const val = bar.getAttribute('aria-valuenow') || bar.getAttribute('value') || '0';
  const max = bar.getAttribute('aria-valuemax') || '100';
  return Math.round((parseFloat(val) / parseFloat(max)) * 100) || 0;
}

/**
 * Detect if on success/completion screen.
 */
function isSuccessScreen(modal) {
  if (!modal) return false;
  const content = modal.textContent || '';
  const successPhrases = [
    'application submitted',
    'your application was sent',
    'applied to',
    'application was sent',
  ];
  return successPhrases.some(p => content.toLowerCase().includes(p));
}

/**
 * Detect if modal is still open and visible.
 */
function isModalVisible() {
  const modal = document.querySelector("div.artdeco-modal[role='dialog']");
  if (!modal) return false;
  const style = window.getComputedStyle(modal);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}


// ════ content/question-handler.js ════

// ── Question Handler ──────────────────────────────────────────────────────

// [bundled] import { queryOne, queryAll, REGISTRY } from './selector-registry.js';
// [bundled] import { sleep, waitFor, nativeInput, nativeTextarea, getLabel, scrollIntoView } from './dom-parser.js';
// [bundled] import { logger } from './logger.js';

/**
 * Detect field type from element.
 */
function detectFieldType(el) {
  const tag = el.tagName?.toLowerCase();
  const type = el.type?.toLowerCase();
  const role = el.getAttribute('role');

  if (tag === 'input') {
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'number') return 'number_input';
    if (type === 'date') return 'date_input';
    if (type === 'file') return 'file_upload';
    return 'text_input';
  }
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'dropdown_native';
  if (role === 'combobox') return 'dropdown_custom';
  if (role === 'listbox') return 'dropdown_custom';
  return 'text_input';
}

/**
 * Fill a text input field.
 */
async function fillTextInput(el, value) {
  if (!el || !value) return false;
  scrollIntoView(el);
  el.focus();
  await sleep(20);
  nativeInput(el, value);
  await sleep(100);
  return true;
}

/**
 * Fill a typeahead/autocomplete input by typing character by character
 * and selecting from the suggestion dropdown.
 * Used for LinkedIn's Location (city) and similar fields.
 */
async function fillTypeahead(el, value) {
  if (!el || !value) return false;
  scrollIntoView(el);
  el.focus();
  await sleep(200);

  // Clear any existing value first
  el.focus();
  el.select && el.select();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  if (setter) setter.set.call(el, '');
  else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(150);

  // Type characters one by one (simulating real human typing)
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const partialVal = value.slice(0, i + 1);

    // Simulate keydown → update value → input event → keyup
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }));

    // Set value using native setter (React-compatible)
    if (setter) setter.set.call(el, partialVal);
    else el.value = partialVal;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }));

    // Small delay between keystrokes (human-like but fast)
    await sleep(40 + Math.floor(Math.random() * 30));
  }

  // Wait for autocomplete suggestions to appear
  logger.info('Typeahead: typed "' + value + '", waiting for suggestions...');
  await sleep(800);

  // Look for the suggestion dropdown
  // LinkedIn uses various containers for autocomplete results
  const suggestionSelectors = [
    ".basic-typeahead__triggered-content",
    "div[role='listbox']",
    ".fb-dash-form-element__listbox",
    "ul[role='listbox']",
    ".artdeco-typeahead__results-list",
    ".basic-typeahead__selectable",
  ];

  let listbox = null;
  for (const sel of suggestionSelectors) {
    listbox = document.querySelector(sel);
    if (listbox) break;
  }

  if (listbox) {
    const optionSelectors = [
      "div[role='option']",
      "li[role='option']",
      ".basic-typeahead__selectable",
      ".artdeco-typeahead__result",
      "li.basic-typeahead__selectable",
    ];

    let allOptions = [];
    for (const sel of optionSelectors) {
      allOptions = Array.from(listbox.querySelectorAll(sel));
      if (allOptions.length > 0) break;
    }
    // Also try children directly if no role-based options found
    if (allOptions.length === 0) {
      allOptions = Array.from(listbox.querySelectorAll('li, div[data-value]'));
    }

    logger.info('Typeahead: found ' + allOptions.length + ' suggestion(s)');

    if (allOptions.length > 0) {
      // Find best match
      const valueLower = value.toLowerCase();
      
      // 1. Regional Priority: Option contains typed text AND belongs to target region
      let match = allOptions.find(o => {
        const text = o.textContent.trim().toLowerCase();
        return text.includes(valueLower) && (
          text.includes('india') ||
          text.includes('telangana') ||
          text.includes('andhra') ||
          text.includes('karnataka') ||
          text.includes('maharashtra') ||
          text.includes('tamil nadu') ||
          text.includes('kerala') ||
          text.includes('delhi') ||
          text.includes('gujarat')
        );
      });

      // 2. Generic Match: Option contains typed text (e.g., international cities)
      if (!match) match = allOptions.find(o => o.textContent.trim().toLowerCase().includes(valueLower));
      
      // 3. Reverse Match: Typed text contains the option
      if (!match) match = allOptions.find(o => valueLower.includes(o.textContent.trim().toLowerCase()));
      
      // 4. Final Fallback: Pick the very first option presented by the dropdown
      if (!match) match = allOptions[0];

      logger.info('Typeahead: selecting "' + match.textContent.trim().slice(0, 50) + '"');
      scrollIntoView(match);
      match.click();
      await sleep(300);
      return true;
    }
  } else {
    logger.warn('Typeahead: no suggestion dropdown found, trying Enter key');
  }

  // Fallback: if no suggestions appeared, try pressing Enter
  // (some fields accept raw text)
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  await sleep(150);
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  await sleep(100);

  return true;
}

/**
 * Fill a textarea.
 */
async function fillTextarea(el, value) {
  if (!el || !value) return false;
  scrollIntoView(el);
  el.focus();
  await sleep(50);
  nativeTextarea(el, value);
  await sleep(100);
  return true;
}

/**
 * Fill number input.
 */
async function fillNumberInput(el, value) {
  if (!el) return false;
  scrollIntoView(el);
  el.focus();
  await sleep(50);
  nativeInput(el, String(value));
  await sleep(100);
  return true;
}

/**
 * Select native dropdown option by value or text.
 */
async function fillNativeDropdown(el, value) {
  if (!el) return false;
  scrollIntoView(el);
  const options = Array.from(el.options);

  // Try exact value match first
  let option = options.find(o => o.value === value);
  // Then exact text match (case insensitive)
  if (!option) option = options.find(o => o.text.trim().toLowerCase() === value.toLowerCase());
  // Then partial text match
  if (!option) option = options.find(o => o.text.trim().toLowerCase().includes(value.toLowerCase()));
  // Specific dial code match: if value looks like a dial code (+XX), match against '(+XX)' pattern
  if (!option) {
    const dialMatch = value.match(/\+?(\d{1,4})/);
    if (dialMatch) {
      const dialCode = dialMatch[1];
      option = options.find(o => {
        const txt = o.text.trim();
        // Match exact dial code in parentheses: '(+91)' but NOT '(+910)' or '(+919)'
        return new RegExp('\\(\\+' + dialCode + '\\)').test(txt);
      });
    }
  }
  // Smart Yes/No
  if (!option && ['yes', 'true', '1'].includes(value.toLowerCase())) {
    option = options.find(o => ['yes', 'true'].includes(o.text.trim().toLowerCase()));
  }
  if (!option && ['no', 'false', '0'].includes(value.toLowerCase())) {
    option = options.find(o => ['no', 'false'].includes(o.text.trim().toLowerCase()));
  }

  /**
   * Set select value using the most aggressive React-compatible approach:
   * 1. Set selectedIndex (DOM-native way)
   * 2. Use native setter to bypass React's controlled component
   * 3. Dispatch full sequence of events that React's delegation layer listens for
   */
  const setSelectValue = async (opt) => {
    // Focus the element first (React often binds to focus)
    el.focus();
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(30);

    // Set via selectedIndex (most reliable DOM approach)
    const idx = options.indexOf(opt);
    if (idx >= 0) el.selectedIndex = idx;
    opt.selected = true;

    // Use native setter to bypass React's synthetic value tracking
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, opt.value);
    } else {
      el.value = opt.value;
    }

    // Dispatch the full event sequence that React/LinkedIn listens for
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(50);
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(50);

    // Double-check: if value didn't stick, try direct assignment + re-dispatch
    if (el.value !== opt.value) {
      el.value = opt.value;
      el.selectedIndex = idx >= 0 ? idx : 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(50);
    }
  };

  if (option) {
    await setSelectValue(option);
    await sleep(150);
    return true;
  }

  // Default: skip blank/placeholder options, pick first real option
  const nonEmpty = options.find(o => {
    const txt = o.text.trim().toLowerCase();
    return o.value && o.value !== '' && !o.disabled && !txt.includes('select') && !txt.includes('choose') && !txt.includes('--');
  });
  if (nonEmpty) {
    await setSelectValue(nonEmpty);
    await sleep(150);
    return true;
  }

  return false;
}

/**
 * Select custom dropdown (combobox/listbox pattern).
 */
async function fillCustomDropdown(trigger, value) {
  if (!trigger) return false;
  scrollIntoView(trigger);
  trigger.click();
  await sleep(400);

  // Wait for listbox
  const listbox = await waitFor("div[role='listbox'], .artdeco-dropdown__content", 3000);
  if (!listbox) {
    logger.warn('Custom dropdown listbox not found');
    return false;
  }

  const options = Array.from(listbox.querySelectorAll("div[role='option'], li[role='option'], .artdeco-dropdown__item"));
  if (!options.length) return false;

  // Find matching option
  let match = options.find(o => o.textContent.trim().toLowerCase() === value.toLowerCase());
  if (!match) match = options.find(o => o.textContent.trim().toLowerCase().includes(value.toLowerCase()));
  if (!match && ['yes', 'true'].includes(value.toLowerCase())) {
    match = options.find(o => ['yes', 'true'].includes(o.textContent.trim().toLowerCase()));
  }
  if (!match && ['no', 'false'].includes(value.toLowerCase())) {
    match = options.find(o => ['no', 'false'].includes(o.textContent.trim().toLowerCase()));
  }
  if (!match) {
    match = options.find(o => {
      const txt = o.textContent.trim().toLowerCase();
      return txt !== '' && !txt.includes('select') && !txt.includes('choose') && !txt.includes('--');
    });
  } // fallback: first real option

  if (match) {
    match.click();
    await sleep(200);
    return true;
  }

  // Close dropdown
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return false;
}

/**
 * Handle radio button (Yes/No or other options).
 */
async function fillRadio(fieldset, value) {
  if (!fieldset) return false;
  const radios = Array.from(fieldset.querySelectorAll("input[type='radio']"));
  if (!radios.length) return false;

  let target = null;

  // Try exact value match
  target = radios.find(r => r.value.toLowerCase() === value.toLowerCase());
  // Try label match
  if (!target) {
    for (const radio of radios) {
      const label = document.querySelector(`label[for="${radio.id}"]`) ||
                    radio.closest('label') ||
                    radio.parentElement?.querySelector('label');
      if (label && label.textContent.trim().toLowerCase() === value.toLowerCase()) {
        target = radio;
        break;
      }
    }
  }
  // Smart Yes/No
  if (!target) {
    const isYes = ['yes', 'true', '1'].includes(value.toLowerCase());
    const isNo = ['no', 'false', '0'].includes(value.toLowerCase());
    if (isYes) {
      target = radios.find(r => ['yes', 'true'].includes(r.value.toLowerCase())) ||
               radios.find(r => {
                 const l = document.querySelector(`label[for="${r.id}"]`);
                 return l && ['yes', 'true'].includes(l.textContent.trim().toLowerCase());
               });
    }
    if (isNo) {
      target = radios.find(r => ['no', 'false'].includes(r.value.toLowerCase())) ||
               radios.find(r => {
                 const l = document.querySelector(`label[for="${r.id}"]`);
                 return l && ['no', 'false'].includes(l.textContent.trim().toLowerCase());
               });
    }
  }

  if (!target) target = radios[0]; // fallback: first option

  if (target) {
    scrollIntoView(target);
    // Click label if radio is hidden
    const label = document.querySelector(`label[for="${target.id}"]`) || target.closest('label');
    if (label) {
      label.click();
    } else {
      target.click();
    }
    target.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    return true;
  }

  return false;
}

/**
 * Handle checkbox.
 */
async function fillCheckbox(el, value) {
  if (!el) return false;
  const shouldCheck = ['yes', 'true', '1', 'on'].includes(String(value).toLowerCase());
  if (el.checked !== shouldCheck) {
    const label = document.querySelector(`label[for="${el.id}"]`) || el.closest('label');
    if (label) label.click();
    else el.click();
    await sleep(100);
  }
  return true;
}

/**
 * Fill date input.
 */
async function fillDateInput(el, value) {
  if (!el) return false;
  scrollIntoView(el);
  el.focus();
  nativeInput(el, value);
  await sleep(100);
  return true;
}

/**
 * Upload file to input[type=file].
 * file: File object or DataTransfer path.
 */
async function uploadFile(input, file) {
  if (!input || !file) return false;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1500);
  return true;
}

/**
 * Extract available options from a form group element.
 */
function extractFieldOptions(group, fieldType) {
  const options = [];
  if (fieldType === 'dropdown_native' || fieldType === 'select') {
    const select = group.querySelector('select');
    if (select) {
      Array.from(select.options).forEach(o => {
        const txt = o.text.trim();
        if (txt && o.value && !o.disabled && !txt.toLowerCase().includes('select') && !txt.toLowerCase().includes('choose') && !txt.includes('--')) {
          options.push(txt);
        }
      });
    }
  } else if (fieldType === 'radio') {
    const radios = group.querySelectorAll("input[type='radio']");
    for (const radio of radios) {
      const label = document.querySelector(`label[for="${radio.id}"]`) ||
                    radio.closest('label') ||
                    radio.parentElement?.querySelector('label');
      if (label) {
        const txt = label.textContent.trim();
        if (txt) options.push(txt);
      } else if (radio.value) {
        options.push(radio.value);
      }
    }
  } else if (fieldType === 'dropdown_custom') {
    // For custom combobox, options are only visible when open — skip extraction
  }
  return options;
}

/**
 * Validate and constrain an answer to match available options.
 */
function validateAndConstrainAnswer(answer, fieldType, options, inputEl) {
  if (!answer) return answer;
  
  // For constrained fields with options, ensure answer matches
  if (options && options.length > 0) {
    const ansLower = answer.toLowerCase().trim();
    
    // Exact match
    const exact = options.find(o => o.toLowerCase() === ansLower);
    if (exact) return exact;
    
    // Partial/substring match
    const partial = options.find(o => o.toLowerCase().includes(ansLower) || ansLower.includes(o.toLowerCase()));
    if (partial) {
      logger.info(`Answer "${answer}" constrained to option "${partial}"`);
      return partial;
    }
    
    // Word overlap scoring
    const ansWords = new Set(ansLower.split(/\s+/));
    let bestOpt = null, bestScore = 0;
    for (const opt of options) {
      const optWords = new Set(opt.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const w of ansWords) { if (optWords.has(w)) overlap++; }
      if (overlap > bestScore) {
        bestScore = overlap;
        bestOpt = opt;
      }
    }
    if (bestOpt && bestScore > 0) {
      logger.info(`Answer "${answer}" fuzzy-matched to option "${bestOpt}" (score: ${bestScore})`);
      return bestOpt;
    }
    
    // Smart Yes/No matching for options
    if (['yes', 'true', '1'].includes(ansLower)) {
      const yesOpt = options.find(o => ['yes', 'true'].includes(o.toLowerCase()));
      if (yesOpt) return yesOpt;
    }
    if (['no', 'false', '0'].includes(ansLower)) {
      const noOpt = options.find(o => ['no', 'false'].includes(o.toLowerCase()));
      if (noOpt) return noOpt;
    }
    
    logger.warn(`Answer "${answer}" matches no option in [${options.join(', ')}] — using first option`);
    return options[0];
  }
  
  // For number fields, strip non-numeric content
  if (fieldType === 'number_input' || fieldType === 'number') {
    const numMatch = answer.match(/[\d.]+/);
    if (numMatch) {
      let num = numMatch[0];
      // Respect min/max if specified on input
      if (inputEl) {
        const min = parseFloat(inputEl.min);
        const max = parseFloat(inputEl.max);
        let val = parseFloat(num);
        if (!isNaN(min) && val < min) val = min;
        if (!isNaN(max) && val > max) val = max;
        num = String(val);
      }
      return num;
    }
    return answer.replace(/[^\d.]/g, '') || '0';
  }
  
  // For text fields, respect maxLength
  if (inputEl && inputEl.maxLength && inputEl.maxLength > 0 && answer.length > inputEl.maxLength) {
    return answer.substring(0, inputEl.maxLength);
  }
  
  return answer;
}

/**
 * Get AI-suggested answer for a question.
 * Falls from dynamic_answers → profile answers → AI API → smart fallbacks.
 */
async function getAnswer(questionLabel, profile, aiAnswers = {}, fieldType = '', availableOptions = []) {
  const label = questionLabel.toLowerCase().trim();

  // 0. Check cached AI answers first
  if (aiAnswers[label]) return aiAnswers[label];

  // 1. Check user's dynamic_answers (custom Q&A mappings from profile)
  const dynamicMap = {
    ...(profile?.answers || {}),
    ...(profile?.dynamic_answers || {}),
  };
  
  for (const [key, value] of Object.entries(dynamicMap)) {
    const cleanKey = key.trim().toLowerCase();
    if (!cleanKey) continue;
    
    if (label.includes(cleanKey) || cleanKey.includes(label)) {
      logger.info(`Dynamic answer match for "${label}": "${value}"`);
      aiAnswers[label] = String(value);
      return String(value);
    }
  }

  // 2. Common keyword matching from profile (high-confidence matches only)
  if (label.includes('year') && label.includes('experience')) {
    return profile.years_of_experience || '0';
  }
  if (label.includes('salary') || label.includes('ctc') || label.includes('compensation') || label.includes('pay') || label.includes('remuneration')) {
    return profile.desired_salary || profile.current_ctc || '500000';
  }
  if (label.includes('notice') || label.includes('joining')) {
    return profile.notice_period || '0';
  }
  if ((label.includes('sponsor') || label.includes('visa')) && label.includes('require')) {
    return profile.require_visa === 'Yes' ? 'Yes' : 'No';
  }
  if (label.includes('work authorization') || label.includes('work permit') || label.includes('legally authorized') || label.includes('legally eligible')) {
    return profile.work_authorization || profile.us_citizenship || 'Yes';
  }
  if (label.includes('citizen') || label.includes('authorized') || label.includes('eligible')) {
    return profile.us_citizenship === 'No' ? 'No' : 'Yes';
  }
  if (label.includes('relocat')) {
    return profile.willing_to_relocate || 'Yes';
  }
  if (label.includes('remote')) {
    return 'Yes';
  }
  if (label.includes('cover letter')) {
    return profile.cover_letter || 'I am excited to apply for this position.';
  }
  if (label.includes('linkedin')) {
    return profile.linkedin_profile || '';
  }
  if (label.includes('github')) {
    return profile.github || '';
  }
  if (label.includes('portfolio') || label.includes('website') || label.includes('personal site')) {
    return profile.website || profile.portfolio || '';
  }
  if (label.includes('first name')) {
    return profile.first_name || profile.firstName || '';
  }
  if (label.includes('last name')) {
    return profile.last_name || profile.lastName || '';
  }
  if (label.includes('full name') || label === 'name') {
    return profile.fullName || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '';
  }
  if (label.includes('phone') && label.includes('country')) {
    return profile.phoneCountryCode || profile.phone_country_code || 'India (+91)';
  }
  if (label.includes('phone')) {
    let raw = profile.phone_number || profile.phoneNumber || '';
    raw = raw.replace(/[^\d+]/g, '');
    const cc = (profile.phoneCountryCode || profile.phone_country_code || '+91').match(/\+(\d+)/);
    if (cc) {
      if (raw.startsWith(`+${cc[1]}`)) raw = raw.slice(cc[1].length + 1);
      else if (raw.startsWith(cc[1]) && raw.length > 10) raw = raw.slice(cc[1].length);
    }
    raw = raw.replace(/^\+/, '');
    return raw;
  }
  if (label.includes('email') || label.includes('e-mail')) {
    if (profile.platform_accounts && profile.platform_accounts.linkedin_email) {
      return profile.platform_accounts.linkedin_email;
    }
    return profile.email || '';
  }
  if (label.includes('city') || label.includes('location') || label.includes('current location')) {
    return profile.current_city || '';
  }
  if (label.includes('address') && !label.includes('email')) {
    return profile.address || profile.current_city || '';
  }
  if (label.includes('zip') || label.includes('postal') || label.includes('pin code') || label.includes('pincode')) {
    return profile.zip_code || profile.pincode || '';
  }
  if (label.includes('state') && !label.includes('united states') && label.length < 30) {
    return profile.state || '';
  }
  if (label.includes('country') && !label.includes('phone') && !label.includes('code')) {
    return profile.country || 'India';
  }
  // Education
  if (label.includes('degree') || label.includes('qualification') || label.includes('education level') || label.includes('highest education')) {
    return profile.highest_degree || profile.degree || profile.education || "Bachelor's";
  }
  if (label.includes('gpa') || label.includes('cgpa') || label.includes('grade') || label.includes('percentage')) {
    return profile.gpa || profile.cgpa || '';
  }
  if (label.includes('university') || label.includes('college') || label.includes('school') || label.includes('institution')) {
    return profile.university || profile.college || '';
  }
  if (label.includes('graduation') || label.includes('graduated') || label.includes('passing year') || label.includes('year of completion')) {
    return profile.graduation_year || '';
  }
  if (label.includes('major') || label.includes('field of study') || label.includes('specialization') || label.includes('branch')) {
    return profile.major || profile.field_of_study || '';
  }
  // Certifications / skills
  if (label.includes('certif')) {
    return profile.certifications || '';
  }
  // How did you hear
  if (label.includes('how did you hear') || label.includes('referral') || label.includes('source')) {
    return 'LinkedIn';
  }
  if (label.includes('available') || label.includes('start date') || label.includes('earliest') || label.includes('join date')) {
    return profile.available_date || 'Immediately';
  }
  // Demographic / EEO questions
  if (label.includes('disability')) {
    return profile.disability_status || 'Decline to Identify';
  }
  if (label.includes('veteran')) {
    return profile.veteran_status || 'Decline to Identify';
  }
  if (label.includes('gender') || label.includes('sex')) {
    return profile.gender || 'Decline to Identify';
  }
  if (label.includes('race') || label.includes('ethnicity')) {
    return profile.ethnicity || 'Decline to Identify';
  }
  if (label.includes('english') || label.includes('language') || label.includes('proficiency')) {
    return profile.language_proficiency || 'Professional';
  }
  // Age / DOB
  if (label.includes('date of birth') || label.includes('dob') || label.includes('birth date')) {
    return profile.date_of_birth || '';
  }
  if (label.includes('age') && !label.includes('language') && !label.includes('package')) {
    return profile.age || '';
  }

  // 3. Ask AI for dynamic questions (with field type + available options for accuracy)
  if (automation && automation.state) {
    logger.info(`Asking AI for question: "${questionLabel}" (type: ${fieldType}, options: ${availableOptions.length})`);
    window.appendLogToUI?.(`🤖 Asking AI for: "${questionLabel}"`, 'info');
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ASK_AI_QUESTION',
        question: questionLabel,
        jobDescription: automation.currentJobDescription || '',
        profile: profile,
        fieldType: fieldType,
        availableOptions: availableOptions,
      });
      
      if (response && response.ok && response.answer) {
        const validated = validateAndConstrainAnswer(response.answer, fieldType, availableOptions);
        window.appendLogToUI?.(`✨ AI Answered: "${validated}"`, 'success');
        aiAnswers[label] = validated;
        return validated;
      } else if (response && !response.ok) {
        logger.warn(`AI returned error for "${questionLabel}": ${response.error || 'unknown'}`);
        window.appendLogToUI?.(`⚠️ AI error: ${response.error || 'no answer'}`, 'warn');
      }
    } catch (e) {
      logger.warn('AI answer request failed:', e.message || e);
      window.appendLogToUI?.(`⚠️ AI request failed: ${e.message || 'unknown error'}`, 'warn');
    }
  }

  // 4. Smart fallbacks (context-aware, NOT blind "Yes" for everything)
  const l = label.toLowerCase().trim();
  
  // Only auto-Yes for clearly affirmative questions (NOT visa/sponsorship/disability)
  if (
    (l.startsWith('are you comfortable') || l.startsWith('are you willing') ||
     l.startsWith('can you') || l.startsWith('will you') ||
     l.includes('agree to') || l.includes('certify') || l.includes('acknowledge') ||
     l.includes('confirm that') || l.includes('do you consent')) &&
    !l.includes('sponsor') && !l.includes('visa') && !l.includes('disability')
  ) {
    return 'Yes';
  }

  // For dropdowns/radios with options, pick first option rather than a random value
  if (availableOptions.length > 0) {
    const sensitiveKeywords = [
      'experience',
      'notice',
      'joining',
      'salary',
      'ctc',
      'compensation',
      'sponsorship',
      'visa',
      'authorization',
      'availability',
      'status',
      'currently',
      'actively'
    ];
    const isSensitiveField = sensitiveKeywords.some(kw => label.includes(kw));

    if (isSensitiveField) {
      logger.warn(`Skipping sensitive field "${questionLabel}" — no confident answer`);
      window.appendLogToUI?.(`⏭️ Skipping sensitive field: "${questionLabel}"`, 'warn');
      return '';
    }

    logger.warn(`Fallback: using first option "${availableOptions[0]}" for "${questionLabel}"`);
    window.appendLogToUI?.(`⚠️ No AI answer, using fallback option: "${availableOptions[0]}"`, 'warn');
    return availableOptions[0];
  }

  // Number fields: use profile experience or 0
  if (fieldType === 'number_input' || fieldType === 'number') {
    return profile.years_of_experience || '0';
  }

  // Generic text fallback — prefer empty to avoid wrong answers
  return '';
}

/**
 * Fill all visible questions in the current step.
 */
async function fillAllQuestions(modal, profile, aiAnswers = {}, skipElements = new Set()) {
  const groups = modal.querySelectorAll(
    '.jobs-easy-apply-form-section__grouping, .fb-dash-form-element'
  );

  let filled = 0;

  for (const group of groups) {
    // Get field label
    const labelEl = group.querySelector('label, .fb-dash-form-element__label');
    const labelText = labelEl?.textContent?.trim() || '';

    // Skip if already filled
    const inputs = group.querySelectorAll('input, textarea, select');

    // --- Detect: Native dropdown
    const select = group.querySelector('select');
    if (select) {
      if (skipElements.has(select)) continue; // Already handled by contact info
      const fieldType = 'dropdown_native';
      const options = extractFieldOptions(group, fieldType);
      const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, options);
      const validated = validateAndConstrainAnswer(answer, fieldType, options, select);
      if (validated) {
        await fillNativeDropdown(select, validated);
        filled++;
      } else {
        // Required field with no answer — skip job
        const isReq = select.hasAttribute('required') || select.getAttribute('aria-required') === 'true';
        if (isReq) {
          logger.warn(`Skip job: required dropdown "${labelText}" has no valid answer`);
          return { filled, skipJob: true };
        }
      }
      continue;
    }

    // --- Detect: Custom combobox / dropdown trigger
    const combobox = group.querySelector("[role='combobox'], .artdeco-dropdown__trigger, button[aria-haspopup='listbox'], [data-artdeco-dropdown-trigger]");
    if (combobox) {
      if (skipElements.has(combobox)) continue;
      const fieldType = 'dropdown_custom';
      const options = extractFieldOptions(group, fieldType);
      const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, options);
      await fillCustomDropdown(combobox, answer || '');
      filled++;
      continue;
    }

    // --- Detect: Radio group
    const fieldset = group.querySelector('fieldset') || group;
    const radios = fieldset.querySelectorAll("input[type='radio']");
    if (radios.length > 0) {
      const fieldType = 'radio';
      const options = extractFieldOptions(group, fieldType);
      const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, options);
      const validated = validateAndConstrainAnswer(answer, fieldType, options);
      await fillRadio(fieldset, validated || answer || '');
      filled++;
      continue;
    }

    // --- Detect: Checkbox
    const checkbox = group.querySelector("input[type='checkbox']");
    if (checkbox) {
      const fieldType = 'checkbox';
      const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, []);
      await fillCheckbox(checkbox, answer);
      filled++;
      continue;
    }

    // --- Detect: Textarea
    const textarea = group.querySelector('textarea');
    if (textarea) {
      if (!textarea.value || textarea.value.trim() === '') {
        const fieldType = 'textarea';
        const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, []);
        if (answer) {
          const validated = validateAndConstrainAnswer(answer, fieldType, [], textarea);
          await fillTextarea(textarea, validated);
          filled++;
        } else {
          // Required textarea with no answer → skip
          const isReq = textarea.hasAttribute('required') || textarea.getAttribute('aria-required') === 'true';
          if (isReq) {
            logger.warn(`Skip job: required textarea "${labelText}" has no valid answer`);
            return { filled, skipJob: true };
          }
        }
      }
      continue;
    }

    // --- Detect: Number input
    const numInput = group.querySelector("input[type='number']");
    if (numInput) {
      // Check: required experience field + user has zero experience → skip job
      const lbl = labelText.toLowerCase();
      const isExperienceField = (lbl.includes('experience') && (lbl.includes('year') || lbl.includes('how many'))) ||
                                (lbl.includes('years') && lbl.includes('experience'));
      const isRequired = numInput.hasAttribute('required') || numInput.getAttribute('aria-required') === 'true';
      const userExp = parseInt(profile.years_of_experience || '0', 10);

      if (isExperienceField && isRequired && userExp === 0) {
        logger.warn(`Skip job: required experience field "${labelText}" but user has 0 experience`);
        return { filled, skipJob: true };
      }

      if (!numInput.value || numInput.value.trim() === '') {
        const fieldType = 'number_input';
        const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, []);
        const validated = validateAndConstrainAnswer(answer, fieldType, [], numInput);
        await fillNumberInput(numInput, validated || '0');
        filled++;
      }
      continue;
    }

    // --- Detect: Date input
    const dateInput = group.querySelector("input[type='date']");
    if (dateInput) {
      if (!dateInput.value) {
        await fillDateInput(dateInput, new Date().toISOString().split('T')[0]);
        filled++;
      }
      continue;
    }

    // --- Detect: Text input (skip if already has value or already handled)
    const textInput = group.querySelector("input[type='text'], input:not([type]), input[type='tel']");
    if (textInput) {
      if (skipElements.has(textInput)) continue; // Already handled by contact info

      // Check: required experience text field + user has zero experience → skip job
      const txtLbl = labelText.toLowerCase();
      const isTxtExperience = (txtLbl.includes('experience') && (txtLbl.includes('year') || txtLbl.includes('how many'))) ||
                              (txtLbl.includes('years') && txtLbl.includes('experience'));
      const isTxtRequired = textInput.hasAttribute('required') || textInput.getAttribute('aria-required') === 'true';
      const txtUserExp = parseInt(profile.years_of_experience || '0', 10);

      if (isTxtExperience && isTxtRequired && txtUserExp === 0) {
        logger.warn(`Skip job: required experience field "${labelText}" but user has 0 experience`);
        return { filled, skipJob: true };
      }

      // Detect typeahead/autocomplete fields
      const isTypeahead = textInput.getAttribute('aria-autocomplete') === 'list' ||
                          textInput.getAttribute('aria-autocomplete') === 'both' ||
                          textInput.getAttribute('role') === 'combobox' ||
                          textInput.id.toLowerCase().includes('city') ||
                          textInput.id.toLowerCase().includes('location') ||
                          labelText.toLowerCase().includes('location') ||
                          labelText.toLowerCase().includes('city');

      if (!textInput.value || textInput.value.trim() === '') {
        const fieldType = 'text_input';
        const answer = await getAnswer(labelText, profile, aiAnswers, fieldType, []);
        if (answer) {
          const validated = validateAndConstrainAnswer(answer, fieldType, [], textInput);
          if (isTypeahead) {
            await fillTypeahead(textInput, validated);
          } else {
            await fillTextInput(textInput, validated);
          }
          filled++;
        } else if (isTxtRequired) {
          logger.warn(`Skip job: required text field "${labelText}" has no valid answer`);
          return { filled, skipJob: true };
        }
      } else if (isTypeahead) {
        // If typeahead field has a value but also has an error, re-fill it via typeahead
        const hasError = group.querySelector('.artdeco-inline-feedback--error');
        if (hasError) {
          const answer = await getAnswer(labelText, profile, aiAnswers, 'text_input', []) || textInput.value;
          await fillTypeahead(textInput, answer);
          filled++;
        }
      }
      continue;
    }
  }

  logger.info(`Filled ${filled} question fields`);
  return { filled, skipJob: false };
}


// ════ content/form-runner.js ════

// ── Form Runner — State Machine ───────────────────────────────────────────

// [bundled] import { queryOne, queryAll, REGISTRY } from './selector-registry.js';
// [bundled] import {
// [bundled]   waitFor, waitForStable, sleep, scrollToBottom, scrollIntoView, findByText,
// [bundled] } from './dom-parser.js';
// [bundled] import { fillAllQuestions, fillTextInput, fillNativeDropdown } from './question-handler.js';
// [bundled] import {
// [bundled]   getValidationErrors, isPrimaryBtnDisabled, isLoading, getProgress, isSuccessScreen, isModalVisible,
// [bundled] } from './validation-handler.js';
// [bundled] import { logger, sendLog } from './logger.js';
// [bundled] import { STATES, DELAYS } from '../shared/constants.js';

const MAX_STEP_RETRIES = 3;

class FormRunner {
  constructor(state) {
    this.state = state; // full runtime state from service worker
    this.profile = state.profile;
    this.modal = null;
    this.currentStep = STATES.IDLE;
    this.stepRetries = 0;
    this.stopped = false;
    this.paused = false;
    this.aiAnswers = {}; // cached AI answers
    this.shouldSkipJob = false; // set when job should be skipped (e.g. experience required)
  }

  stop() { this.stopped = true; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  async waitIfPaused() {
    while (this.paused && !this.stopped) {
      await sleep(500);
    }
  }

  /**
   * Main entry: run the full Easy Apply flow for current modal.
   */
  async run() {
    logger.info('FormRunner: starting');
    this.stopped = false;

    try {
      // Detect modal
      this.modal = await this.detectModal();
      if (!this.modal) {
        logger.error('No Easy Apply modal found');
        return { result: 'Failed', reason: 'modal_not_found' };
      }

      this.transition(STATES.MODAL_DETECTED);
      await sleep(DELAYS.SHORT);

      // State machine loop
      let maxSteps = 30; // safety cap
      while (!this.stopped && maxSteps-- > 0) {
        await this.waitIfPaused();

        if (!isModalVisible()) {
          logger.warn('Modal closed unexpectedly');
          // Check if it was success
          if (isSuccessScreen(document.body)) {
            return { result: 'Applied', reason: 'success' };
          }
          return { result: 'Failed', reason: 'modal_closed' };
        }

        // Re-acquire modal reference (can change after rerenders)
        this.modal = queryOne(REGISTRY.modal.container);
        if (!this.modal) break;

        const stepResult = await this.processCurrentStep();

        // Check if question handler flagged this job for skipping
        if (this.shouldSkipJob) {
          logger.info('Skipping job: experience requirement detected');
          sendLog('skip', 'experience_required', 'Required experience field but user has 0 experience');
          chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: '⏭️ Skipping: requires experience (user has 0)' }).catch(() => {});
          await this.dismissCurrentModal();
          return { result: 'Skipped', reason: 'experience_required' };
        }

        if (stepResult === 'done') break;
        if (stepResult === 'error') {
          if (this.stepRetries >= MAX_STEP_RETRIES) {
            return { result: 'Failed', reason: this.state.runtime.lastError };
          }
          this.stepRetries++;
          await sleep(DELAYS.LONG);
          continue;
        }
        this.stepRetries = 0;
        await sleep(DELAYS.SHORT);
      }

      if (this.stopped) return { result: 'Skipped', reason: 'user_stopped' };

      // Final check
      if (isSuccessScreen(this.modal || document.body)) {
        this.transition(STATES.SUCCESS);
        await this.handleSuccess();
        return { result: 'Applied', reason: 'success' };
      }

      return { result: 'Failed', reason: 'unknown' };

    } catch (err) {
      logger.error('FormRunner error:', err);
      return { result: 'Failed', reason: err.message };
    }
  }

  /**
   * Process whatever step we're currently on.
   */
  async processCurrentStep() {
    const modal = this.modal;

    // Wait for page to stabilize
    await this.waitForModalReady();

    // Check success first
    if (isSuccessScreen(modal)) {
      return 'done';
    }

    // Detect current step from footer buttons
    const primaryBtn = queryOne(REGISTRY.modal.primaryBtn, modal);
    if (!primaryBtn) {
      logger.warn('No primary button found');
      return 'error';
    }

    const btnText = primaryBtn.textContent.trim().toLowerCase();
    logger.step(this.currentStep, `Button text: "${btnText}"`);

    // Step dispatch
    if (btnText.includes('submit')) {
      return await this.handleReview();
    } else if (btnText.includes('review')) {
      return await this.handleScreeningStep();
    } else if (btnText.includes('next') || btnText.includes('continue')) {
      return await this.handleStep();
    } else if (btnText.includes('done') || btnText.includes('close')) {
      return 'done';
    } else {
      // Fallback: try to fill and click
      return await this.handleStep();
    }
  }

  /**
   * Handle contact info / generic form steps.
   */
  async handleStep() {
    const modal = this.modal;
    logger.step('step', 'Filling form fields');

    // Detect step type from title
    const title = this.getModalTitle();
    logger.debug('Step title:', title);

    // Detect contact step by BOTH title AND actual DOM content
    const hasContactTitle = title.toLowerCase().includes('contact') || title.toLowerCase().includes('personal');
    const hasContactFields = !!(modal.querySelector("select[id*='phoneNumber-country'], select[id*='phone-country'], input[id*='phoneNumber-nationalNumber'], input[type='tel'], select[id*='phoneCountryCode']"));

    if (hasContactTitle || hasContactFields) {
      this.transition(STATES.CONTACT_INFO);
      logger.info('Detected contact step (title:', hasContactTitle, ', fields:', hasContactFields, ')');
      await this.fillContactInfo();
    } else if (
      title.toLowerCase().includes('resume') ||
      title.toLowerCase().includes('document') ||
      // Fallback: detect by presence of a file input (LinkedIn upload widget)
      !!modal.querySelector("input[type='file']")
    ) {
      this.transition(STATES.RESUME);
      await this.handleResumeStep();
    } else {
      this.transition(STATES.SCREENING_QUESTIONS);
      await this.fillScreeningQuestions();
    }

    return await this.clickNext();
  }

  /**
   * Fill contact info step.
   */
  async fillContactInfo() {
    const modal = this.modal;
    const p = this.profile;

    // Track elements we've manually handled so fillAllQuestions skips them
    const handledElements = new Set();

    // Phone country code dropdown
    const phoneCountry = queryVisible(REGISTRY.contact.phoneCountry, modal);
    if (phoneCountry) {
      handledElements.add(phoneCountry);
      // Extract dial code for matching (e.g., '+91' from 'India (+91)' or just '+91')
      const ccValue = p.phoneCountryCode || p.phone_country_code || '+91';
      await fillNativeDropdown(phoneCountry, ccValue);
      logger.info('Phone country code set to:', phoneCountry.value, '(searched:', ccValue, ')');
    }

    // Phone number input — strip country code prefix
    const phoneInput = queryVisible(REGISTRY.contact.phoneNumber, modal);
    if (phoneInput) {
      handledElements.add(phoneInput);
      if (p.phoneNumber || p.phone_number) {
        let cleanPhone = p.phoneNumber || p.phone_number || '';
        let currentVal = phoneInput.value || '';
        cleanPhone = cleanPhone.replace(/[^\d+]/g, '');
        const ccRaw = p.phoneCountryCode || p.phone_country_code || '+91';
        const ccMatch = ccRaw.match(/\+(\d+)/);
        if (ccMatch) {
           if (cleanPhone.startsWith(`+${ccMatch[1]}`)) {
              cleanPhone = cleanPhone.slice(ccMatch[1].length + 1);
           } else if (cleanPhone.startsWith(ccMatch[1]) && cleanPhone.length > 10) {
              cleanPhone = cleanPhone.slice(ccMatch[1].length);
           }
        }
        cleanPhone = cleanPhone.replace(/^\+/, '');
        
        // Always refill if it's different or was empty
        if (!currentVal || currentVal !== cleanPhone) {
          await fillTextInput(phoneInput, cleanPhone);
          logger.info('Phone number cleaned to:', cleanPhone);
        }
      }
    }

    // Email (mark as handled so fillAllQuestions doesn't re-process it)
    const emailInput = queryVisible(REGISTRY.contact.email, modal);
    if (emailInput) handledElements.add(emailInput);

    // Location / City — LinkedIn uses typeahead, must type character-by-character
    const locationInputs = modal.querySelectorAll("input[id*='city'], input[id*='location'], input[id*='City']");
    for (const locInput of locationInputs) {
      if (locInput && isVisible(locInput)) {
        handledElements.add(locInput);
        const cityValue = p.current_city || p.city || '';
        if (cityValue && (!locInput.value || locInput.value.trim() === '')) {
          logger.info('Filling location typeahead with:', cityValue);
          await fillTypeahead(locInput, cityValue);
        } else if (locInput.value) {
          // Location pre-filled by LinkedIn — check if it needs typeahead validation
          const hasError = locInput.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__grouping')?.querySelector('.artdeco-inline-feedback--error');
          if (hasError) {
            logger.info('Location has validation error, re-filling with typeahead:', locInput.value);
            await fillTypeahead(locInput, locInput.value);
          }
        }
      }
    }

    // Fill any remaining questions, SKIPPING elements we already handled
    const contactResult = await fillAllQuestions(modal, p, this.aiAnswers, handledElements);
    if (contactResult.skipJob) this.shouldSkipJob = true;
  }

  /**
   * Universal Enterprise-Grade Resume Upload Step.
   * Strategy:
   *   1. If already selected — done.
   *   2. If picker items present — select first.
   *   3. Adaptive search for upload field (iframes, shadows, hidden).
   *   4. Authenticated fetch + Secure injection.
   *   5. Validation.
   */
  async handleResumeStep() {
    this.transition(STATES.RESUME);
    const modal = this.modal;

    // 1. Already selected
    const selected = queryOne(REGISTRY.resume.selectedBtn, modal);
    if (selected) {
      logger.success('Resume already selected');
      return;
    }

    // 2. Picker items present
    const resumeItems = queryAll(REGISTRY.resume.resumeItems, modal);
    // Ensure we only treat items as "pickable" if they aren't upload buttons
    const pickableResumes = resumeItems.filter(item => {
      const text = item.textContent.toLowerCase();
      return !text.includes('upload') && !text.includes('select a file');
    });

    if (pickableResumes.length > 0) {
      const firstResume = pickableResumes[0];
      scrollIntoView(firstResume);
      firstResume.click();
      await sleep(DELAYS.SHORT);
      
      // Verify selection
      const isSelected = queryOne(REGISTRY.resume.selectedBtn, modal);
      if (isSelected) {
        logger.success('Resume selected from picker');
        return;
      }
      logger.warn('Failed to select resume from picker, falling back to upload');
    }

    // 3. No picker — attempt adaptive authenticated upload
    logger.info('No resume picker found — initiating universal adaptive upload');

    const resumePath = this.profile && this.profile.resumePath;
    if (!resumePath) {
      logger.error('[SmartApply] Upload failed: No resumePath in profile');
      chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: '\u26a0\ufe0f No resume on file. Upload one in SmartApply.' }).catch(() => {});
      return; // Skip step
    }

    // Fetch bytes from background
    let fetchResult;
    try {
      fetchResult = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 40000);
        chrome.runtime.sendMessage({ type: 'FETCH_RESUME' }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: 'no_response' });
        });
      });
    } catch (err) {
      logger.error('Resume fetch failed:', err.message);
      return;
    }

    if (!fetchResult.ok) {
      const errMap = {
        missing_token: 'Not logged in — please log in again.',
        auth_expired: 'Session expired — please log in again.',
        no_resume_url: 'No resume URL found in profile.',
        not_found: 'Resume file not found on server.',
        network_error: 'Network error while fetching resume.',
        max_retries_exceeded: 'Resume download failed after retries.',
      };
      const msg = errMap[fetchResult.error] || `Resume fetch failed: ${fetchResult.error}`;
      logger.error(msg);
      chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `\u274c ${msg}` }).catch(() => {});
      if (fetchResult.error === 'auth_expired' || fetchResult.error === 'missing_token') {
        this.shouldSkipJob = true;
        if (this.runner) this.runner.stop();
      }
      return;
    }

    // Prepare File object
    const { base64, mimeType, fileName } = fetchResult;
    let byteArray;
    try {
      const binaryStr = atob(base64);
      byteArray = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) byteArray[i] = binaryStr.charCodeAt(i);
    } catch (err) {
      logger.error('Base64 decode failed:', err.message);
      return;
    }
    const resumeFile = new File([byteArray], fileName, { type: mimeType });

    // 4. Adaptive field detection
    const fileInput = await findResumeUploadField(modal || document);
    if (!fileInput) {
      logger.warn('[SmartApply] No valid upload field detected — skipping step');
      return;
    }

    try {
      // Ensure interactable
      activateHiddenInput(fileInput);

      // --- Multi-strategy injection ---

      // Strategy A: DataTransfer + comprehensive event dispatch
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(resumeFile);
      fileInput.files = dataTransfer.files;

      // Dispatch events that LinkedIn/React actually listens to
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));

      // React uses InputEvent internally
      try {
        fileInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      } catch (_) {}

      // Strategy B: Dispatch drop event on the upload container
      // LinkedIn's upload zone listens for drag-and-drop
      const uploadContainer = fileInput.closest(
        '.jobs-document-upload, .jobs-resume-picker, ' +
        '.artdeco-modal__content, [class*="upload"], [class*="document"]'
      ) || fileInput.parentElement;

      if (uploadContainer) {
        try {
          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          });
          uploadContainer.dispatchEvent(dropEvent);

          // Also try dragover (some listeners need this first)
          const dragOverEvent = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          });
          uploadContainer.dispatchEvent(dragOverEvent);
        } catch (dropErr) {
          logger.debug('[SmartApply] Drop event dispatch failed (non-fatal): ' + dropErr.message);
        }
      }

      logger.info('[SmartApply] Resume injected — validating...');

      // --- Retry validation loop ---
      let uploadConfirmed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await sleep(attempt === 1 ? DELAYS.LONG : DELAYS.MEDIUM);

        // Check 1: fileInput still has files
        const hasFiles = fileInput.files && fileInput.files.length > 0;

        // Check 2: LinkedIn shows visual confirmation (file name, success badge, etc.)
        const modalRoot = modal || document;
        const hasVisualConfirm = !!(
          modalRoot.querySelector('.jobs-document-upload__visible-container .t-14') ||
          modalRoot.querySelector('.jobs-document-upload__file-name') ||
          modalRoot.querySelector('.artdeco-inline-feedback--success') ||
          modalRoot.querySelector('[class*="upload"][class*="success"]') ||
          modalRoot.querySelector('.jobs-resume-picker__resume-btn--selected')
        );

        if (hasFiles || hasVisualConfirm) {
          uploadConfirmed = true;
          logger.success('[SmartApply] Upload validation success: ' + fileName);
          chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `\u2705 Resume uploaded: ${fileName}` }).catch(() => {});
          sendLog('resume', 'success', `Uploaded resume: ${fileName}`);
          break;
        }

        if (attempt < 3) {
          logger.info(`[SmartApply] Upload validation retry ${attempt}/3...`);
          // Re-inject files on retry (LinkedIn may have cleared them)
          try {
            const retryDt = new DataTransfer();
            retryDt.items.add(resumeFile);
            fileInput.files = retryDt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_) {}
        }
      }

      if (!uploadConfirmed) {
        // Fallback: try clicking the upload label/button to prompt native file picker
        logger.warn('[SmartApply] Programmatic upload not confirmed — attempting fallback click');
        const uploadLabel = (modal || document).querySelector(
          'label.jobs-document-upload__upload-button, ' +
          'label[for="' + fileInput.id + '"], ' +
          'button.jobs-document-upload__upload-button'
        );
        if (uploadLabel) {
          uploadLabel.click();
          logger.info('[SmartApply] Native file picker triggered — user may need to select file manually');
          chrome.runtime.sendMessage({
            type: 'POPUP_LOG',
            text: '\u26a0\ufe0f Resume auto-upload failed — please select your resume file manually if prompted'
          }).catch(() => {});
        } else {
          logger.error('[SmartApply] Upload validation failed — file not attached');
          chrome.runtime.sendMessage({
            type: 'POPUP_LOG',
            text: '\u274c Resume upload failed — LinkedIn did not accept the file'
          }).catch(() => {});
        }
      }
    } catch (err) {
      logger.error('[SmartApply] Upload injection failed:', err.message);
    }
  }

  /**
   * Fill screening questions.
   */
  async fillScreeningQuestions() {
    this.transition(STATES.SCREENING_QUESTIONS);
    const modal = this.modal;

    // Scroll to see all questions
    const scrollable = queryOne(REGISTRY.modal.content, modal);
    if (scrollable) scrollToBottom(scrollable);
    await sleep(DELAYS.SHORT);

    const qResult = await fillAllQuestions(modal, this.profile, this.aiAnswers);
    if (qResult.skipJob) this.shouldSkipJob = true;

    // Scroll back to top to ensure Next is visible
    if (scrollable) scrollable.scrollTop = 0;
  }

  /**
   * Handle pre-review step (screening with review button).
   */
  async handleScreeningStep() {
    await this.fillScreeningQuestions();
    return await this.clickNext();
  }

  /**
   * Handle review screen.
   */
  async handleReview() {
    this.transition(STATES.REVIEW);
    const modal = this.modal;

    logger.step('review', 'On review screen');

    // Scroll to load all sections
    const scrollable = queryOne(REGISTRY.modal.content, modal);
    if (scrollable) {
      let lastHeight = 0;
      for (let i = 0; i < 5; i++) {
        scrollable.scrollTop += 300;
        await sleep(300);
        if (scrollable.scrollTop === lastHeight) break;
        lastHeight = scrollable.scrollTop;
      }
    }

    // Check if human confirm required
    const needsConfirm = await this.checkIfNeedsHumanConfirm();
    if (needsConfirm) {
      this.transition(STATES.SUBMIT_PENDING);
      logger.info('Waiting for human confirmation to submit');
      sendLog('review', 'pending_confirm', 'Waiting for human confirmation before submit');
      // Notify popup to show confirm button
      chrome.runtime.sendMessage({ type: 'NEEDS_CONFIRMATION', jobInfo: this.state.job });
      // Wait for user to confirm
      const confirmed = await this.waitForConfirmation();
      if (!confirmed) {
        return { result: 'Skipped', reason: 'user_cancelled_submit' };
      }
    }

    return await this.clickSubmit();
  }

  /**
   * Click Next / Review button.
   */
  async clickNext() {
    const modal = this.modal;

    // Wait for spinner to disappear
    await this.waitForLoading();

    const primaryBtn = queryOne(REGISTRY.modal.primaryBtn, modal);
    if (!primaryBtn) {
      logger.warn('No primary button to click');
      return 'error';
    }

    if (primaryBtn.disabled || primaryBtn.getAttribute('aria-disabled') === 'true') {
      // Check for validation errors
      const errors = getValidationErrors(modal);
      if (errors.length) {
        logger.warn('Validation errors:', errors);
        this.state.runtime.lastError = errors[0];
        sendLog('validation', 'error', errors.join(', '));
        return 'error';
      }
    }

    scrollIntoView(primaryBtn);
    await sleep(100);
    primaryBtn.click();
    sendLog(this.currentStep, 'next_clicked', 'Clicked Next/Review');

    // Wait for DOM to update
    await sleep(DELAYS.AFTER_CLICK);
    await waitForStable(300);

    return 'continue';
  }

  /**
   * Click Submit button.
   */
  async clickSubmit() {
    const modal = this.modal;

    const submitBtn = queryOne(REGISTRY.review.submitBtn, modal);
    if (!submitBtn) {
      logger.warn('No submit button found');
      return 'error';
    }

    scrollIntoView(submitBtn);
    await sleep(300);

    logger.step('submit', 'Clicking Submit');
    submitBtn.click();
    sendLog('submit', 'submitted', 'Submit button clicked');

    await sleep(DELAYS.EXTRA_LONG);
    await waitForStable(400);

    // Check for success
    if (isSuccessScreen(modal) || isSuccessScreen(document.body)) {
      this.transition(STATES.SUCCESS);
      return 'done';
    }

    // Check modal still open (could be error)
    if (!isModalVisible()) {
      return 'done'; // assumed success
    }

    return 'continue';
  }

  /**
   * Handle success screen cleanup.
   */
  async handleSuccess() {
    logger.success('Application submitted successfully!');
    sendLog('success', 'applied', 'Application submitted');

    // Look for the "Done" primary button first
    let closeBtn = null;
    const btns = Array.from((this.modal || document).querySelectorAll('button.artdeco-button--primary, button'));
    closeBtn = btns.find(b => b.textContent.trim().toLowerCase() === 'done');

    // Fallback to registry selectors (e.g. Dismiss icon)
    if (!closeBtn) {
      closeBtn = queryOne(REGISTRY.success.closeBtn, this.modal || document);
    }

    if (closeBtn) {
      await sleep(200);
      closeBtn.click();
    }
    await sleep(DELAYS.SHORT);
  }

  /**
   * Check human confirm setting.
   */
  async checkIfNeedsHumanConfirm() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
        resolve(response?.state?.settings?.humanConfirmSubmit !== false);
      });
    });
  }

  /**
   * Wait for user to click confirm in popup.
   */
  async waitForConfirmation(timeout = 120000) {
    return new Promise((resolve) => {
      let isDone = false;
      const listener = (message) => {
        if (message.type === 'USER_CONFIRMED') {
          isDone = true;
          chrome.runtime.onMessage.removeListener(listener);
          resolve(true);
        }
        if (message.type === 'USER_CANCELLED') {
          isDone = true;
          chrome.runtime.onMessage.removeListener(listener);
          resolve(false);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      setTimeout(() => {
        if (isDone) return;
        chrome.runtime.onMessage.removeListener(listener);
        logger.warn('[SmartApply] Confirm timeout — auto-skipping job');
        chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: '⏱ Confirm timeout — job skipped' }).catch(() => {});
        resolve(false);
      }, timeout);
    });
  }

  /**
   * Get current modal title text.
   */
  getModalTitle() {
    if (!this.modal) return '';
    const titleEl = queryOne(REGISTRY.modal.title, this.modal);
    return titleEl?.textContent?.trim() || '';
  }

  /**
   * Detect and return modal element.
   */
  async detectModal(timeout = 5000) {
    const selectors = REGISTRY.modal.container;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Wait for ANY selector, not just first
    return new Promise((resolve) => {
      const deadline = Date.now() + timeout;
      const poll = setInterval(() => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { clearInterval(poll); resolve(el); return; }
        }
        if (Date.now() >= deadline) { clearInterval(poll); resolve(null); }
      }, 200);
    });
  }

  /**
   * Wait for modal to be stable and ready.
   */
  async waitForModalReady() {
    await this.waitForLoading();
    await waitForStable(250, 2000);
  }

  /**
   * Wait for loading spinner to disappear.
   */
  async waitForLoading(timeout = 5000) {
    let elapsed = 0;
    while (elapsed < timeout) {
      if (!isLoading(this.modal)) return;
      await sleep(150);
      elapsed += 150;
    }
  }

  /**
   * Transition to new state.
   */
  transition(newState) {
    logger.step(newState, `State: ${this.currentStep} → ${newState}`);
    this.currentStep = newState;
    this.state.runtime.currentStep = newState;
    chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state: newState });
  }

  /**
   * Dismiss the current Easy Apply modal (close without submitting).
   */
  async dismissCurrentModal() {
    const dismissBtn = queryOne(REGISTRY.modal.dismiss, this.modal || document);
    if (dismissBtn) {
      dismissBtn.click();
      await sleep(DELAYS.SHORT);
      // LinkedIn may show a "Discard application?" confirmation dialog
      const confirmDiscard = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim().toLowerCase().includes('discard'));
      if (confirmDiscard) {
        confirmDiscard.click();
        await sleep(DELAYS.SHORT);
      }
    }
    logger.info('Modal dismissed');
  }
}


// ════ content/linkedin-content.js ════

// ── SmartApply — LinkedIn Content Script ─────────────────────────────────

// [bundled] import { logger, sendLog } from './logger.js';
// [bundled] import { REGISTRY, queryOne } from './selector-registry.js';
// [bundled] import { waitFor, sleep, scrollIntoView, findByText } from './dom-parser.js';
// [bundled] import { isSuccessScreen, isModalVisible } from './validation-handler.js';
// [bundled] import { FormRunner } from './form-runner.js';
// [bundled] import { STATES, DELAYS } from '../shared/constants.js';

// ── Global State ──────────────────────────────────────────────────────────

let automation = {
  isRunning: false,
  isPaused: false,
  runner: null,
  state: null,
  sessionId: null,
  totalApplied: 0,
  totalFailed: 0,
  totalSkipped: 0,
  appliedThisTerm: 0,
  appliedJobIds: new Set(), // cross-session duplicate tracking
};

// ── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'START_AUTOMATION':
      startAutomation(message.state, message.resumeCounters).then(sendResponse);
      return true;

    case 'STOP_AUTOMATION':
      stopAutomation();
      sendResponse({ ok: true });
      break;

    case 'PAUSE_AUTOMATION':
      automation.isPaused = true;
      if (automation.runner) automation.runner.pause();
      sendResponse({ ok: true });
      break;

    case 'RESUME_AUTOMATION':
      automation.isPaused = false;
      if (automation.runner) automation.runner.resume();
      sendResponse({ ok: true });
      break;

    case 'USER_CONFIRMED':
    case 'USER_CANCELLED':
      break;

    case 'GET_PAGE_INFO':
      sendResponse(getPageInfo());
      break;

    case 'SCRAPE_LINKEDIN':
      scrapeLinkedInProfile().then(sendResponse);
      return true;

    case 'PING':
      sendResponse({ ok: true });
      break;
  }
});

// ── Page Detection ─────────────────────────────────────────────────────────

function getPageInfo() {
  const url = window.location.href;
  let pageType = 'unknown';

  if (url.includes('/jobs/search') || url.includes('/jobs/collections')) {
    pageType = 'jobs_search';
  } else if (url.includes('/jobs/view/') || document.querySelector('.jobs-unified-top-card')) {
    pageType = 'job_detail';
  } else if (document.querySelector("div.artdeco-modal[role='dialog']")) {
    pageType = 'easy_apply_modal';
  } else if (url.includes('/in/') || url.includes('/mynetwork')) {
    pageType = 'profile';
  }

  let jobInfo = {};
  try {
    const titleEl = document.querySelector('.jobs-unified-top-card__job-title, h1.t-24, .job-details-jobs-unified-top-card__job-title');
    const companyEl = document.querySelector('.jobs-unified-top-card__company-name a, .jobs-unified-top-card__subtitle-primary-grouping a');
    if (titleEl) jobInfo.title = titleEl.textContent.trim();
    if (companyEl) jobInfo.company = companyEl.textContent.trim();
    jobInfo.url = url;
    jobInfo.jobId = url.match(/\/(\d+)\/?/)?.[1] || '';
  } catch (_) {}

  return { pageType, jobInfo, url };
}

// ── Filter Applier ─────────────────────────────────────────────────────────
// Applies LinkedIn UI filters from user profile preferences after page loads.

async function applyLinkedInFilters(profile) {
  logger.info('Applying LinkedIn search filters from profile…');
  sendLog('filters', 'started', 'Applying search filters');

  try {
    // 1. Set "All Filters" if needed — use the "All filters" button
    // Most filters (Easy Apply, date, exp level, work mode) live in the filter bar
    // already visible on the search URL params we set. But we verify Easy Apply toggle.

    await sleep(1000); // Let filter bar render

    // ── Easy Apply filter chip ─────────────────────────────────────────────
    if (profile.easy_apply_only !== false) {
      const easyApplyBtns = Array.from(document.querySelectorAll(
        'button.search-reusables__filter-pill-button, button[aria-label*="Easy Apply"]'
      ));
      const easyBtn = easyApplyBtns.find(b =>
        b.textContent.includes('Easy Apply') || b.getAttribute('aria-label')?.includes('Easy Apply')
      );
      if (easyBtn && !easyBtn.classList.contains('search-reusables__filter-pill-button--active')) {
        easyBtn.click();
        await sleep(DELAYS.MEDIUM);
        logger.info('Easy Apply filter enabled');
      }
    }

    // ── "All Filters" modal for exp level & work mode (if not set via URL) ──
    // Click "All filters" button to open advanced filter panel
    const allFiltersBtn = document.querySelector(
      'button[aria-label="Show all filters"], button.artdeco-pill--slate[aria-label*="filter"]'
    ) || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'All filters');

    if (allFiltersBtn) {
      allFiltersBtn.click();
      await sleep(DELAYS.LONG);

      // Set Experience Level checkboxes
      const expLevels = Array.isArray(profile.experience_level) ? profile.experience_level : [];
      if (expLevels.length > 0) {
        await setFilterCheckboxes('Experience level', expLevels);
      }

      // Set On-site / Remote / Hybrid
      const workModes = Array.isArray(profile.on_site) ? profile.on_site : [];
      if (workModes.length > 0) {
        await setFilterCheckboxes('On-site/remote', workModes);
        await setFilterCheckboxes('Remote', workModes); // alt label
      }

      // Click "Show results" to apply
      const showResultsBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Show results') || b.textContent.includes('Apply')
      );
      if (showResultsBtn) {
        showResultsBtn.click();
        await sleep(DELAYS.EXTRA_LONG);
        logger.info('Advanced filters applied');
      } else {
        // Close modal if show results not found
        const closeBtn = document.querySelector('button[aria-label="Dismiss"]');
        if (closeBtn) closeBtn.click();
      }
    }

    sendLog('filters', 'done', 'Search filters applied');
    logger.info('Filters applied, starting job loop');
  } catch (err) {
    logger.warn('Filter application error (non-fatal):', err.message);
    sendLog('filters', 'warn', `Filter apply failed: ${err.message}`);
  }
}

async function setFilterCheckboxes(sectionLabel, valuesToCheck) {
  // Find section by label text
  const labels = Array.from(document.querySelectorAll(
    'h3, legend, .artdeco-typeahead__label, .search-reusables__advanced-filters-binary-toggle label'
  ));
  const section = labels.find(el => el.textContent.includes(sectionLabel));
  if (!section) return;

  const sectionContainer = section.closest('li, section, fieldset, div[class*="filter"]');
  if (!sectionContainer) return;

  for (const value of valuesToCheck) {
    const checkboxLabels = sectionContainer.querySelectorAll('label');
    for (const label of checkboxLabels) {
      if (label.textContent.trim().toLowerCase().includes(value.toLowerCase())) {
        const checkbox = label.querySelector('input[type="checkbox"]') ||
          document.getElementById(label.htmlFor);
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          await sleep(300);
        }
        break;
      }
    }
  }
}

// ── Agent Lock Overlay ───────────────────────────────────────────────────────

let _lockOverlay = null;
let _lockToast   = null;
let _toastTimer  = null;

function createAgentLock() {
  if (document.getElementById('smartapply-agent-lock')) return;

  const overlay = document.createElement('div');
  overlay.id = 'smartapply-agent-lock';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'cursor:not-allowed',
    'background:transparent',
    'touch-action:none',
  ].join(';');

  const BLOCKED = ['click','mousedown','mouseup','pointerdown','pointerup',
                   'touchstart','touchend','keydown','keyup','keypress'];
  for (const ev of BLOCKED) {
    overlay.addEventListener(ev, (e) => {
      if (e.target.closest?.('#smartapply-lock-toast')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      _showLockToast();
    }, true);
  }

  document.body.appendChild(overlay);
  _lockOverlay = overlay;

  _buildToast();
}

function _buildToast() {
  if (document.getElementById('smartapply-lock-toast')) return;

  const toast = document.createElement('div');
  toast.id = 'smartapply-lock-toast';
  toast.style.cssText = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%) scale(0.88)',
    'z-index:2147483647',
    'background:rgba(16,16,18,0.94)',
    'backdrop-filter:blur(18px)',
    '-webkit-backdrop-filter:blur(18px)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:18px',
    'padding:28px 36px 22px',
    'text-align:center',
    'font-family:system-ui,-apple-system,sans-serif',
    'box-shadow:0 24px 64px rgba(0,0,0,0.6)',
    'opacity:0',
    'pointer-events:auto',
    'transition:opacity 0.18s ease,transform 0.18s ease',
    'min-width:260px',
    'user-select:none',
  ].join(';');

  toast.innerHTML = `
    <div style="font-size:36px;line-height:1;margin-bottom:12px">🤖</div>
    <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:6px;letter-spacing:-0.01em">
      Agent is controlling
    </div>
    <div style="font-size:12.5px;color:rgba(255,255,255,0.5);line-height:1.55;margin-bottom:20px">
      SmartApply is applying to jobs.<br>
      Please don't touch the browser.
    </div>
    <button id="smartapply-emergency-stop" style="
      background:#C93535;
      color:#fff;
      border:none;
      border-radius:9px;
      padding:9px 22px;
      font-size:13px;
      font-weight:600;
      cursor:pointer;
      font-family:system-ui,-apple-system,sans-serif;
      letter-spacing:0.01em;
      transition:background 0.15s;
    " onmouseover="this.style.background='#A32D2D'"
       onmouseout="this.style.background='#C93535'">
      ■ Stop Bot
    </button>
  `;

  document.body.appendChild(toast);
  _lockToast = toast;

  document.getElementById('smartapply-emergency-stop')
    .addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' }).catch(() => {});
      removeAgentLock();
      window.appendLogToUI?.('🛑 Stopped by user via overlay', 'warn');
    });
}

function _showLockToast() {
  if (!_lockToast) _buildToast();
  clearTimeout(_toastTimer);

  requestAnimationFrame(() => {
    _lockToast.style.opacity = '1';
    _lockToast.style.transform = 'translate(-50%,-50%) scale(1)';
  });

  _toastTimer = setTimeout(() => {
    _lockToast.style.opacity = '0';
    _lockToast.style.transform = 'translate(-50%,-50%) scale(0.88)';
  }, 2200);
}

function removeAgentLock() {
  clearTimeout(_toastTimer);
  if (_lockOverlay) { _lockOverlay.remove(); _lockOverlay = null; }
  if (_lockToast)   { _lockToast.remove();   _lockToast   = null; }
}

// ── Main Automation Loop ───────────────────────────────────────────────────

async function startAutomation(state, resumeCounters = null) {
  createAgentLock();
  if (automation.isRunning) {
    return { ok: false, reason: 'already_running' };
  }

  automation.isRunning = true;
  automation.isPaused = false;
  automation.state = state;
  automation.sessionId = state.runtime?.sessionId || '';
  automation.appliedThisTerm = 0;

  // Load applied job IDs for duplicate tracking
  try {
    const stored = await chrome.storage.local.get('appliedJobIds');
    automation.appliedJobIds = new Set(stored.appliedJobIds || []);
    logger.info(`Loaded ${automation.appliedJobIds.size} previously applied job IDs`);
  } catch (e) {
    automation.appliedJobIds = new Set();
  }

  // Restore counters if resuming from a search term switch
  if (resumeCounters) {
    automation.totalApplied = resumeCounters.totalApplied || 0;
    automation.totalFailed = resumeCounters.totalFailed || 0;
    automation.totalSkipped = resumeCounters.totalSkipped || 0;
    logger.info(`Resumed counters: Applied=${automation.totalApplied}, Failed=${automation.totalFailed}, Skipped=${automation.totalSkipped}`);
  } else {
    automation.totalApplied = 0;
    automation.totalFailed = 0;
    automation.totalSkipped = 0;
  }

  const terms = state.profile?.search_terms;
  const termIdx = state.runtime?.currentSearchTermIndex || 0;
  const currentTerm = (Array.isArray(terms) && terms.length > 1) ? terms[termIdx] : null;
  if (currentTerm) {
    logger.info(`Automation started for search term: "${currentTerm}" (${termIdx + 1}/${terms.length})`);
  } else {
    logger.info('Automation started on ' + window.location.href);
  }
  sendLog('init', 'started', 'Automation started' + (currentTerm ? ` for "${currentTerm}"` : ''));

  const prefs = state.profile;
  const maxApps = state.settings?.maxApplications || 15;
  const switchNumber = prefs?.switch_number || 15;
  const hasMultipleTerms = Array.isArray(terms) && terms.length > 1;

  try {
    // ── Step 1: Apply filters if on jobs search page ───────────────────────
    const url = window.location.href;
    const isJobsSearch = url.includes('/jobs/search') || url.includes('/jobs/collections');

    if (isJobsSearch) {
      await applyLinkedInFilters(prefs);
      // Wait for results to re-render after filter apply
      await sleep(DELAYS.EXTRA_LONG);
    }

    // ── Step 2: If modal already open, process it ──────────────────────────
    if (isModalVisible()) {
      await processOneApplication(state);
    }

    // ── Step 3: Main apply loop ────────────────────────────────────────────
    while (automation.isRunning) {
      if (automation.isPaused) {
        await sleep(500);
        continue;
      }

      // Only count successfully applied jobs towards the limit
      // But add a safety limit of 300 total attempts to avoid infinite loops
      const totalAttempts = automation.totalApplied + automation.totalFailed + automation.totalSkipped;
      if (automation.totalApplied >= maxApps || totalAttempts >= 300) {
        logger.info(`Max applications (${maxApps}) reached. Stopping.`);
        break;
      }

      // ── Check if we should switch to the next search term ──────────────
      if (hasMultipleTerms && automation.appliedThisTerm >= switchNumber) {
        logger.info(`Reached ${switchNumber} applications for current term. Switching…`);
        chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `🔄 Reached ${switchNumber} apps for this term, switching…` }).catch(() => {});

        chrome.runtime.sendMessage({
          type: 'SWITCH_SEARCH_TERM',
          counters: {
            totalApplied: automation.totalApplied,
            totalFailed: automation.totalFailed,
            totalSkipped: automation.totalSkipped,
          },
        }).catch(() => {});

        // Stop the current loop — service worker will navigate to new URL
        // and re-trigger START_AUTOMATION with resumed counters
        automation.isRunning = false;
        removeAgentLock();
        return { ok: true, switchedTerm: true };
      }

      // If LinkedIn SPA pushed us to a post-apply screen, go back to jobs list
      if (window.location.href.includes('/post-apply/')) {
        logger.info('Detected post-apply page. Navigating back...');
        window.history.back();
        await sleep(3000);
        continue;
      }

      // Find next Easy Apply job card
      let jobCard = findNextEasyApplyJob();
      if (!jobCard) {
        window.scrollBy(0, 400);
        await sleep(800);

        jobCard = findNextEasyApplyJob();
        if (!jobCard) {
          logger.info('No more Easy Apply jobs. Trying next page…');
          const nextPage = document.querySelector('button[aria-label*="Next"]');
          if (nextPage && !nextPage.disabled) {
            nextPage.click();
            await sleep(DELAYS.EXTRA_LONG);
            continue;
          }
          // No more pages for this term — switch if possible
          if (hasMultipleTerms) {
            logger.info('No more pages for current term. Switching to next term…');
            chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: '🔄 No more jobs for this term, switching…' }).catch(() => {});
            chrome.runtime.sendMessage({
              type: 'SWITCH_SEARCH_TERM',
              counters: {
                totalApplied: automation.totalApplied,
                totalFailed: automation.totalFailed,
                totalSkipped: automation.totalSkipped,
              },
            }).catch(() => {});
            automation.isRunning = false;
            removeAgentLock();
            return { ok: true, switchedTerm: true };
          }
          break;
        }
      }

      if (!jobCard) break;

      await clickJobCard(jobCard);
      await sleep(2000); // wait for LinkedIn SPA right-panel to load

      const applied = await clickEasyApplyAndProcess(state);
      if (applied) {
        automation.appliedThisTerm++;
        sendProgress();
      } else {
        automation.totalSkipped++;
        sendProgress();
        chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `— Skipped job (no Easy Apply or modal failed)` }).catch(()=>{});
      }

      await sleep(state.settings?.delayBetweenApps || 1500);
    }

  } catch (err) {
    logger.error('Automation error:', err);
    sendLog('automation', 'error', err.message);
  }

  automation.isRunning = false;
  removeAgentLock();
  logger.info('Automation finished');
  sendLog('automation', 'finished',
    `Applied: ${automation.totalApplied}, Failed: ${automation.totalFailed}, Skipped: ${automation.totalSkipped}`);

  reportFinalResult();
  return { ok: true };
}

function stopAutomation() {
  automation.isRunning = false;
  automation.isPaused = false;
  if (automation.runner) {
    automation.runner.stop();
    automation.runner = null;
  }
  removeAgentLock();
  logger.info('Automation stopped');
}

// ── Job Card Interaction ───────────────────────────────────────────────────

function findNextEasyApplyJob() {
  // Primary: scaffold-layout__list-item (LinkedIn 2024+ DOM) with data-job-id child
  // Fallback: .job-card-container, li[data-occludable-job-id]
  // We no longer filter by Easy Apply text at card level — URL filter (f_LF=f_AL)
  // already restricts to Easy Apply. Let clickEasyApplyAndProcess verify the button.
  const selectors = [
    '.scaffold-layout__list-item:not([data-sa-processed])',
    '.job-card-container:not([data-sa-processed])',
    'li[data-occludable-job-id]:not([data-sa-processed])',
    '[data-job-id]:not([data-sa-processed])',
  ];

  for (const sel of selectors) {
    const cards = document.querySelectorAll(sel);
    if (!cards.length) continue;
    logger.info(`[findNextEasyApplyJob] using "${sel}" → ${cards.length} cards`);

    for (const card of cards) {
      // Skip bad-word titles
      const titleEl = card.querySelector(
        '.job-card-list__title, .job-card-container__primary-description, ' +
        '.artdeco-entity-lockup__title, strong'
      );
      if (titleEl && automation.state?.profile?.bad_words?.length) {
        const title = titleEl.textContent.toLowerCase();
        if (automation.state.profile.bad_words.some(w => title.includes(w.toLowerCase()))) {
          card.setAttribute('data-sa-processed', 'skipped-badword');
          continue;
        }
      }

      // Skip jobs that show "Applied" badge (already applied on LinkedIn)
      const cardText = card.textContent.toLowerCase();
      const hasAppliedBadge = cardText.includes('applied') &&
        (card.querySelector('.job-card-container__footer-item') ||
         card.querySelector('.job-card-list__footer-wrapper') ||
         card.querySelector('[class*="applied"]') ||
         // Check for explicit "Applied X days ago" or "Applied" text in footer area
         Array.from(card.querySelectorAll('li, span, div')).some(el => {
           const t = el.textContent.trim().toLowerCase();
           return (t === 'applied' || t.startsWith('applied ')) && t.length < 30;
         }));

      if (hasAppliedBadge) {
        card.setAttribute('data-sa-processed', 'skipped-already-applied');
        logger.info('[findNextEasyApplyJob] Skipped: already applied (LinkedIn badge)');
        continue;
      }

      // Skip duplicate job IDs (cross-session tracking)
      const jobLink = card.querySelector('a[href*="/jobs/view/"]');
      const jobIdMatch = jobLink?.href?.match(/\/jobs\/view\/(\d+)/);
      if (jobIdMatch && automation.appliedJobIds.has(jobIdMatch[1])) {
        card.setAttribute('data-sa-processed', 'skipped-duplicate');
        logger.info(`[findNextEasyApplyJob] Skipped: duplicate job ID ${jobIdMatch[1]}`);
        continue;
      }

      return card;
    }
  }

  logger.warn('[findNextEasyApplyJob] No cards found with any selector');
  return null;
}

async function clickJobCard(card) {
  // Try job title link first, then any link, then the card itself
  const clickTarget = card.querySelector(
    'a.job-card-list__title, ' +
    'a.job-card-container__link, ' +
    '.artdeco-entity-lockup__title a, ' +
    'a[href*="/jobs/view/"], ' +
    'a'
  );
  if (clickTarget) {
    clickTarget.click();
  } else {
    card.click();
  }
  card.setAttribute('data-sa-processed', 'clicked');
  await waitFor(
    '.jobs-unified-top-card, .job-details-jobs-unified-top-card__job-title, .jobs-apply-button',
    6000
  );

  // Extract job description for AI context using robust selectors
  const selectors = [
    '#job-details',
    'article.jobs-description__container',
    '.jobs-description-content__text',
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.jobs-description'
  ];
  
  // Wait up to 3s for JD to load after top card appears
  await waitFor('#job-details, article.jobs-description__container, .jobs-description-content__text', 3000).catch(() => {});
  // Give it a tiny moment to hydrate
  await sleep(500);

  automation.currentJobDescription = '';
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 50) {
      automation.currentJobDescription = el.innerText.trim().substring(0, 5000);
      break;
    }
  }
  
  if (!automation.currentJobDescription) {
    logger.warn('[SmartApply] Failed to extract Job Description from the right panel.');
  }
}

function findEasyApplyButton() {
  // Stable-attr selectors: trust the attr, don't require "Easy Apply" text
  // LinkedIn only puts these attrs on the primary apply button
  const STABLE_SELECTORS = [
    '#jobs-apply-button-id',
    'button[data-live-test-job-apply-button]',
  ];
  for (const sel of STABLE_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn) {
      logger.info(`[findEasyApplyButton] stable match "${sel}" label="${btn.getAttribute('aria-label')}" text="${btn.textContent.trim()}"`);
      return btn;
    }
  }

  // Class/aria selectors: require "easy apply" in label or text
  const FUZZY_SELECTORS = [
    'button.jobs-apply-button',
    'button[data-job-id]',
    'button[aria-label*="Easy Apply"]',
  ];
  for (const sel of FUZZY_SELECTORS) {
    const btn = Array.from(document.querySelectorAll(sel)).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text = (b.textContent || '').trim().toLowerCase();
      return label.includes('easy apply') || text.startsWith('easy apply');
    });
    if (btn) {
      logger.info(`[findEasyApplyButton] fuzzy match "${sel}" label="${btn.getAttribute('aria-label')}" text="${btn.textContent.trim()}"`);
      return btn;
    }
  }

  // Text-only fallback
  const byText = Array.from(document.querySelectorAll('button')).find(b =>
    (b.textContent || '').trim().toLowerCase().startsWith('easy apply')
  );
  if (byText) logger.info(`[findEasyApplyButton] text fallback: "${byText.textContent.trim()}"`);
  return byText || null;
}

async function clickEasyApplyAndProcess(state) {
  await sleep(1000);

  // Wait up to 8s for Easy Apply button to appear (SPA load time)
  let easyApplyBtn = findEasyApplyButton();
  let retries = 0;
  while (!easyApplyBtn && retries < 4) {
    await sleep(2000);
    easyApplyBtn = findEasyApplyButton();
    retries++;
  }

  // Log whatever button we found (or didn't) for diagnostics
  if (easyApplyBtn) {
    logger.info(`[clickEasyApply] candidate button: label="${easyApplyBtn.getAttribute('aria-label')}" text="${easyApplyBtn.textContent.trim()}"`);
    chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `🔍 Button found: "${easyApplyBtn.getAttribute('aria-label') || easyApplyBtn.textContent.trim()}"` }).catch(()=>{});
  } else {
    logger.warn('[clickEasyApply] No button found at all');
  }

  if (!easyApplyBtn) {
    const titleEl = document.querySelector('.jobs-unified-top-card__job-title, h1.t-24, .job-details-jobs-unified-top-card__job-title');
    const companyEl = document.querySelector('.jobs-unified-top-card__company-name a, .jobs-details-top-card__company-url');
    const jobTitle = titleEl?.textContent?.trim() || 'Unknown';
    const company = companyEl?.textContent?.trim() || 'Unknown';
    
    // Check if there's any apply button (external) to explain the skip
    const anyApplyBtn = document.querySelector(
      "#jobs-apply-button-id, button[data-live-test-job-apply-button], button.jobs-apply-button"
    );
    if (anyApplyBtn) {
      const lbl = anyApplyBtn.getAttribute('aria-label') || anyApplyBtn.textContent.trim();
      logger.info('External apply job (no Easy Apply):', lbl);
      chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `↪ External apply — skipping (button: "${lbl}")` }).catch(()=>{});
    } else {
      logger.warn('No Easy Apply button found');
      chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: '⚠️ Skip: No Easy Apply button on this job' }).catch(()=>{});
    }
    
    // Report skipped job for manual recommendation pipeline
    reportResult({
      result: 'Skipped',
      reason: 'no_easy_apply',
      job_title: jobTitle,
      company: company,
      job_url: window.location.href,
      job_link: window.location.href,
      job_description: automation.currentJobDescription || '',
      platform: 'linkedin',
      session_id: automation.sessionId,
      token: state.runtime?.token || '',
    });
    
    return false;
  }

  const btnText = easyApplyBtn.textContent.trim();
  const btnLabel = (easyApplyBtn.getAttribute('aria-label') || '').toLowerCase();
  // Stable-attr matches (#jobs-apply-button-id, data-live-test-job-apply-button) are trusted
  // even if text says "Apply" — LinkedIn uses same button, just changes text for Easy vs external
  const isStableAttrMatch = easyApplyBtn.id === 'jobs-apply-button-id' ||
    easyApplyBtn.hasAttribute('data-live-test-job-apply-button');
  const isEasyApply = btnLabel.includes('easy apply') || btnText.toLowerCase().includes('easy apply') || btnLabel.includes('linkedin apply');

  const titleEl = document.querySelector('.jobs-unified-top-card__job-title, h1.t-24, .job-details-jobs-unified-top-card__job-title');
  const companyEl = document.querySelector('.jobs-unified-top-card__company-name a, .jobs-details-top-card__company-url');
  const jobTitle = titleEl?.textContent?.trim() || 'Unknown';
  const company = companyEl?.textContent?.trim() || 'Unknown';

  if (!isEasyApply && !isStableAttrMatch) {
    logger.warn('Button is not Easy Apply:', btnText);
    chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `↪ External apply job — skipping (button: ${btnText})` }).catch(()=>{});
    
    reportResult({
      result: 'Skipped',
      reason: 'external_apply',
      job_title: jobTitle,
      company: company,
      job_url: window.location.href,
      job_link: window.location.href,
      job_description: automation.currentJobDescription || '',
      platform: 'linkedin',
      session_id: automation.sessionId,
      token: state.runtime?.token || '',
    });
    
    return false;
  }

  if (!isEasyApply && isStableAttrMatch) {
    // Stable attr found but not explicitly easy apply.
    // If it's a stable attr button, we only skip if it explicitly indicates it's external (which is rare),
    // or if we decide pure "Apply" is external. The user wants pure "Apply" to be clicked if stable attr.
    // We already check !btnText.includes('apply'), which prevents skipping "Apply".
    if (!btnLabel.includes('easy apply') && !btnLabel.includes('linkedin apply') && !btnText.toLowerCase().includes('apply')) {
      logger.info('Stable-attr button is external apply:', btnText, btnLabel);
      chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `↪ External apply — skipping (button: "${btnText}")` }).catch(()=>{});
      
      reportResult({
        result: 'Skipped',
        reason: 'external_apply',
        job_title: jobTitle,
        company: company,
        job_url: window.location.href,
        job_link: window.location.href,
        job_description: automation.currentJobDescription || '',
        platform: 'linkedin',
        session_id: automation.sessionId,
        token: state.runtime?.token || '',
      });
      
      return false;
    }
  }

  state.job = {
    title: jobTitle,
    company,
    jobUrl: window.location.href,
    jobId: window.location.href.match(/\/(\d+)\/?/)?.[1] || '',
  };

  // Check duplicate job ID before applying
  if (state.job.jobId && automation.appliedJobIds.has(state.job.jobId)) {
    logger.info(`Skipping duplicate job ID: ${state.job.jobId} (${jobTitle})`);
    chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: `⏭️ Duplicate: already applied to "${jobTitle}"` }).catch(() => {});
    return false;
  }

  logger.info(`Applying to: ${jobTitle} at ${company}`);
  sendLog('apply', 'started', `Applying to ${jobTitle} at ${company}`, state.job);

  easyApplyBtn.click();
  await waitFor("div.artdeco-modal[role='dialog']", 6000);
  await sleep(DELAYS.SHORT);

  // Handle "Job search safety reminder" modal that appears before Easy Apply
  let modalHeader = document.querySelector("div.artdeco-modal[role='dialog'] h2");
  if (modalHeader && modalHeader.textContent.toLowerCase().includes('safety reminder')) {
    logger.info('Safety reminder modal detected, clicking Continue...');
    chrome.runtime.sendMessage({ type: 'POPUP_LOG', text: '🛡️ Dismissing safety reminder...' }).catch(()=>{});
    const continueBtn = document.querySelector("div.artdeco-modal[role='dialog'] #jobs-apply-button-id, button[aria-label*='continue the apply process']");
    if (continueBtn) {
      continueBtn.click();
      // Wait until the safety reminder header is gone and the real modal appears
      let elapsed = 0;
      while (elapsed < 5000) {
        await sleep(300);
        elapsed += 500;
        modalHeader = document.querySelector("div.artdeco-modal[role='dialog'] h2");
        if (modalHeader && !modalHeader.textContent.toLowerCase().includes('safety reminder')) {
          break;
        }
      }
      await sleep(DELAYS.SHORT);
    }
  }

  return await processOneApplication(state);
}

// ── Single Application Processing ─────────────────────────────────────────

async function processOneApplication(state) {
  automation.runner = new FormRunner(state);
  const result = await automation.runner.run();
  automation.runner = null;

  const resultData = {
    ...result,
    job_title: state.job?.title || '',
    company: state.job?.company || '',
    job_url: state.job?.jobUrl || '',
    job_link: state.job?.jobUrl || '',
    platform: 'linkedin',
    session_id: automation.sessionId,
    token: state.runtime?.token || '',
    job_description: automation.currentJobDescription || '',
  };

  if (result.result === 'Applied') {
    automation.totalApplied++;

    // Save job ID to prevent duplicate applications in future sessions
    const jobId = state.job?.jobId;
    if (jobId) {
      automation.appliedJobIds.add(jobId);
      // Persist to storage (cap at 5000 to avoid unbounded growth)
      const idsArray = Array.from(automation.appliedJobIds).slice(-5000);
      chrome.storage.local.set({ appliedJobIds: idsArray }).catch(() => {});
    }
  }
  else if (result.result === 'Failed') automation.totalFailed++;
  else automation.totalSkipped++;

  sendProgress();
  reportResult(resultData);

  return result.result === 'Applied';
}

// ── Messaging Helpers ──────────────────────────────────────────────────────

function sendProgress() {
  chrome.runtime.sendMessage({
    type: 'PROGRESS_UPDATE',
    payload: {
      totalApplied: automation.totalApplied,
      totalFailed: automation.totalFailed,
      totalSkipped: automation.totalSkipped,
    },
  }).catch(() => {});
}

function reportResult(data) {
  chrome.runtime.sendMessage({ type: 'REPORT_RESULT', payload: data }).catch(() => {});
}

function reportFinalResult() {
  chrome.runtime.sendMessage({
    type: 'AUTOMATION_FINISHED',
    payload: {
      totalApplied: automation.totalApplied,
      totalFailed: automation.totalFailed,
      totalSkipped: automation.totalSkipped,
    },
  }).catch(() => {});
}

// ── LinkedIn Profile Scraper ───────────────────────────────────────────────

async function scrapeLinkedInProfile() {
  try {
    if (!window.location.href.includes('linkedin.com/in/')) {
      return { ok: false, error: 'not_on_profile' };
    }
    await waitFor('main.scaffold-layout__main, .pv-profile-section', 5000);
    await sleep(1000);

    const data = {};
    const nameEl = document.querySelector('h1.text-heading-xlarge, .pv-top-card--list li:first-child, h1.inline');
    if (nameEl) {
      const parts = nameEl.textContent.trim().split(/\s+/);
      data.first_name = parts[0] || '';
      data.last_name = parts.slice(1).join(' ') || '';
    }
    const headlineEl = document.querySelector('.text-body-medium.break-words, .pv-top-card--list.pv-top-card--list-bullet li:nth-child(2)');
    data.linkedin_headline = headlineEl?.textContent?.trim() || '';
    
    const locationEl = document.querySelector('.pv-text-details__left-panel span.text-body-small, span.text-body-small.inline, .pv-top-card__location span');
    data.current_city = locationEl?.textContent?.trim() || '';
    
    const aboutSection = document.querySelector('#about')?.closest('section');
    const aboutEl = aboutSection ? aboutSection.querySelector('.display-flex .visually-hidden, span[aria-hidden="true"]') : document.querySelector('.pv-about__summary-text span, .pv-shared-text-with-see-more span');
    data.linkedin_summary = aboutEl?.textContent?.trim() || '';
    data.linkedin_profile = window.location.href.split('?')[0];

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: 'scrape_error', detail: err.message };
  }
}

// ── Floating Logger UI ────────────────────────────────────────────────────

window.appendLogToUI = function(text, type = 'info') {
  const feed = document.getElementById('smartapply-log-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.style.marginBottom = '6px';
  el.style.fontSize = '12px';
  el.style.lineHeight = '1.4';
  el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  el.style.wordBreak = 'break-word';
  
  if (type === 'error') el.style.color = '#ff6b6b';
  else if (type === 'success') el.style.color = '#7ee8a2';
  else if (type === 'warn') el.style.color = '#f5c05c';
  else el.style.color = '#c1c1c4';
  
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  while (feed.children.length > 80) feed.removeChild(feed.firstChild);
};

function initFloatingLogger() {
  if (document.getElementById('smartapply-floating-logger')) return;

  const container = document.createElement('div');
  container.id = 'smartapply-floating-logger';
  // Positioned bottom-left to avoid LinkedIn chat
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    width: 320px;
    height: 380px;
    background: rgba(28, 28, 30, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    transition: opacity 0.3s, transform 0.3s;
    pointer-events: none;
    opacity: 0;
    transform: translateY(10px);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, rgba(56, 139, 253, 0.1), transparent);
    border-radius: 12px 12px 0 0;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: grab;
    user-select: none;
  `;
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; flex:1;">
      <div style="width:8px;height:8px;border-radius:50%;background:#388bfd;box-shadow:0 0 8px #388bfd;"></div>
      SmartApply Live Logs
    </div>
    <button id="smartapply-copy-logs" style="background:rgba(255,255,255,0.1); border:none; color:#c1c1c4; cursor:pointer; padding:2px 6px; font-size:12px; border-radius:4px; pointer-events:auto; transition:background 0.2s;" title="Copy Logs" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
      Copy
    </button>
  `;

  const feed = document.createElement('div');
  feed.id = 'smartapply-log-feed';
  feed.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    color: #c1c1c4;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
  `;
  // Hide scrollbar but keep functionality
  feed.style.scrollbarWidth = 'none';

  container.appendChild(header);
  container.appendChild(feed);
  document.body.appendChild(container);

  const copyBtn = header.querySelector('#smartapply-copy-logs');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const logText = Array.from(feed.children).map(el => el.textContent).join('\n');
      navigator.clipboard.writeText(logText).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
      });
    });
  }

  // Initial log
  window.appendLogToUI('Floating logger initialized.', 'success');

  // Draggable logic
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;
  let xOffset = 0;
  let yOffset = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('#smartapply-copy-logs')) return;
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    isDragging = true;
    header.style.cursor = 'grabbing';
    container.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    if (e.buttons === 0) {
      isDragging = false;
      header.style.cursor = 'grab';
      container.style.transition = 'opacity 0.3s, transform 0.3s';
      return;
    }
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    xOffset = currentX;
    yOffset = currentY;
    container.style.transform = `translate(${currentX}px, ${currentY}px)`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    header.style.cursor = 'grab';
    container.style.transition = 'opacity 0.3s, transform 0.3s';
  });

  // URL checking helper
  const checkVisibility = () => {
    const isJobs = window.location.href.includes('/jobs/');
    if (isJobs) {
      container.style.opacity = '1';
      container.style.pointerEvents = 'auto';
      container.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    } else {
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      container.style.transform = `translate(${xOffset}px, ${yOffset + 10}px)`;
    }
  };
  
  checkVisibility();
  window.addEventListener('popstate', checkVisibility);
  window.addEventListener('hashchange', checkVisibility);

  // Listen for broadcasted logs from background that might originate elsewhere
  chrome.runtime.onMessage.addListener((msg) => {
    checkVisibility();
    if (msg.type === 'POPUP_LOG') {
      window.appendLogToUI(msg.text, 'info');
    } else if (msg.type === 'STATE_CHANGED') {
      window.appendLogToUI(`Step changed: ${msg.state}`, 'info');
    } else if (msg.type === 'RESULT_UPDATE') {
      const r = msg.payload;
      const type = r.result === 'Applied' ? 'success' : r.result === 'Failed' ? 'error' : 'warn';
      window.appendLogToUI(`${r.job_title} → ${r.result}`, type);
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────

initFloatingLogger();
logger.info(`SmartApply content script loaded on ${window.location.hostname}`);
chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href }).catch(() => {});

// ── Live JD Match Scoring ─────────────────────────────────────────────────
// Fires SCORE_JOB to service-worker whenever user navigates to a job on LinkedIn.

(function initLiveScoring() {
  const JD_SELECTORS = [
    '#job-details',
    'article.jobs-description__container',
    '.jobs-description-content__text',
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.jobs-description',
  ];

  const TITLE_SELECTORS = [
    '.jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title h1',
    'h1.t-24',
    '.jobs-unified-top-card__job-title',
  ];

  const COMPANY_SELECTORS = [
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__subtitle-primary-grouping a',
    '.job-details-jobs-unified-top-card__company-name a',
  ];

  function extractText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim()) return el.innerText.trim();
    }
    return '';
  }

  function tryScoreCurrentJob() {
    const jd = extractText(JD_SELECTORS);
    if (!jd || jd.length < 80) return;

    const jobTitle = extractText(TITLE_SELECTORS);
    const company  = extractText(COMPANY_SELECTORS);

    chrome.runtime.sendMessage({
      type: 'SCORE_JOB',
      job_description: jd.substring(0, 5000),
      job_title: jobTitle,
      company: company,
    }).catch(() => {});
  }

  // SPA navigation detection via URL polling
  let _lastHref = location.href;
  let _scoreTimer = null;

  function onUrlChange() {
    // Only score on /jobs/view/ pages
    if (!location.href.includes('/jobs/')) return;
    clearTimeout(_scoreTimer);
    // Wait for DOM to settle after navigation
    _scoreTimer = setTimeout(tryScoreCurrentJob, 2200);
  }

  // MutationObserver catches LinkedIn's SPA pushState navigations
  const _navObserver = new MutationObserver(() => {
    if (location.href !== _lastHref) {
      _lastHref = location.href;
      onUrlChange();
    }
  });
  _navObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Initial page load
  if (location.href.includes('/jobs/')) {
    _scoreTimer = setTimeout(tryScoreCurrentJob, 2500);
  }
})();


})();
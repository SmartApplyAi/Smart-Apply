// ── SmartApply Extension Constants ────────────────────────────────────────

export const API_BASE = 'https://www.smartapplies.app/api';

export const STATES = {
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

export const SELECTORS = {
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
    easyApplyBtn: ".jobs-apply-button[aria-label*='Easy Apply'], button[aria-label*='Easy Apply']",
    jobTitle: '.jobs-unified-top-card__job-title, h1.t-24',
    company: '.jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a',
    jobCard: '.job-card-container, .jobs-search-results__list-item',
    jobCardEasyApply: ".job-card-container__footer-item[aria-label*='Easy Apply'], .job-card-list__footer-wrapper",
  },
};

export const DELAYS = {
  SHORT: 500,
  MEDIUM: 1000,
  LONG: 2000,
  EXTRA_LONG: 3000,
  AFTER_CLICK: 1500,
  DOM_STABLE: 800,
  RERENDER: 1200,
};

export const MAX_RETRIES = 3;
export const HEARTBEAT_INTERVAL = 30000; // 30s

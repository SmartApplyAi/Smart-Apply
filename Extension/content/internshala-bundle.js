// ── SmartApply Internshala Content Script ────────────────────────────
(function () {
"use strict";

// ── Constants ────────────────────────────────────────────────────────
const PREFIX = '[SmartApply-Internshala]';
const DELAYS = { SHORT: 500, MEDIUM: 1000, LONG: 2000, EXTRA_LONG: 3000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATES = {
  IDLE: 'idle', DASHBOARD: 'dashboard_detected', LISTING: 'listing_detected',
  DETAIL: 'job_detail_detected', APPLY_OPENED: 'easy_apply_opened',
  CONTACT: 'contact_info', RESUME: 'resume', SCREENING: 'screening_questions',
  REVIEW: 'review', SUBMIT_READY: 'submit_ready',
  WAITING_CONFIRM: 'waiting_for_user_confirmation',
  SUBMITTING: 'submitting', SUCCESS: 'success', ERROR: 'error',
};

// ── Logger ───────────────────────────────────────────────────────────
const logger = {
  info:    (msg, ...a) => { console.log(`${PREFIX} ℹ️ ${msg}`, ...a);  appendLog(`ℹ️ ${msg}`, 'info'); },
  success: (msg, ...a) => { console.log(`${PREFIX} ✅ ${msg}`, ...a);  appendLog(`✅ ${msg}`, 'success'); },
  warn:    (msg, ...a) => { console.warn(`${PREFIX} ⚠️ ${msg}`, ...a); appendLog(`⚠️ ${msg}`, 'warn'); },
  error:   (msg, ...a) => { console.error(`${PREFIX} ❌ ${msg}`, ...a); appendLog(`❌ ${msg}`, 'error'); },
};

function appendLog(text, type) {
  const feed = document.getElementById('smartapply-internshala-log-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.style.cssText = 'margin-bottom:6px;font-size:12px;line-height:1.4;word-break:break-word;font-family:system-ui,sans-serif;';
  el.style.color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#7ee8a2' : type === 'warn' ? '#f5c05c' : '#c1c1c4';
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  while (feed.children.length > 80) feed.removeChild(feed.firstChild);
}

// ── DOM Utilities ────────────────────────────────────────────────────
function isVisible(el) {
  if (!el) return false;
  const s = window.getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
}

function queryFirst(selectorStr, ctx) {
  const root = ctx || document;
  for (const sel of selectorStr.split(',')) {
    try { const el = root.querySelector(sel.trim()); if (el) return el; } catch (_) {}
  }
  return null;
}

function queryAll(selectorStr, ctx) {
  const root = ctx || document;
  const results = [];
  for (const sel of selectorStr.split(',')) {
    try { root.querySelectorAll(sel.trim()).forEach(el => results.push(el)); } catch (_) {}
  }
  return results;
}

function clickElement(el) {
  if (!el) return;
  const types = ['mousedown', 'mouseup', 'click'];
  types.forEach(t => {
    const ev = new MouseEvent(t, { bubbles: true, cancelable: true, view: window });
    el.dispatchEvent(ev);
  });
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
  if (setter && setter.set) setter.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function getFieldLabel(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  const parent = el.closest('.form-group, .form_group, .question_container, .field_container, [class*="field"]');
  if (parent) {
    const lbl = parent.querySelector('label, .label_text, .question_label, .form-label, [class*="label"]');
    if (lbl) return lbl.textContent.trim();
  }
  const prev = el.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.classList.contains('label_text'))) return prev.textContent.trim();
  return el.placeholder || el.name || el.getAttribute('aria-label') || '';
}

// ── Page Detection ───────────────────────────────────────────────────
function detectPageType() {
  const url = window.location.href;
  const path = window.location.pathname.toLowerCase();
  
  // Application Form detection (could be a new page or a modal)
  if (path.includes('/application/form') || document.querySelector('.application_form, #application_form, .assessment_container, .easy_apply_step, .application_step')) {
    return 'application_form';
  }

  // Easy Apply Modal detection
  if (document.querySelector('#easy_apply_modal.show, #easy_apply_modal[style*="display: block"], .modal.show .easy_apply_step')) {
    return 'easy_apply_modal';
  }

  // Detail page detection
  if (path.includes('/detail/') || document.querySelector('#make_application_button, #apply_button, #apply_now_button')) {
    return 'detail';
  }
  
  if (url.includes('/login') || document.querySelector('#login_layer_modal, form#login_form')) return 'login';
  
  // Listings page detection
  if (path.startsWith('/internships')) {
    if (document.querySelector('.individual_internship, .internship_list_container')) return 'internship_listings';
  }
  if (path.startsWith('/jobs')) {
    if (document.querySelector('.individual_job, .job_list_container')) return 'job_listings';
  }
  
  if (url.includes('/student/dashboard')) return 'dashboard';
  
  return 'unknown';
}

// ── Internship/Job Card Finders ──────────────────────────────────────
function findInternshipCards() {
  const selectors = [
    '.individual_internship:not([data-sa-processed])',
    '.individual_job:not([data-sa-processed])',
    '.internship_item:not([data-sa-processed])',
    '.job_item:not([data-sa-processed])',
    '[id^="individual_internship_"]:not([data-sa-processed])',
    '[id^="individual_job_"]:not([data-sa-processed])',
    '.job-container:not([data-sa-processed])'
  ].join(',');
  return Array.from(document.querySelectorAll(selectors));
}

function getCardTitle(card) {
  const el = card.querySelector('.job-title-href, .internship_heading a, .job_heading a, h3 a, .profile_on_detail_page .heading_4_5 a, a[class*="title"], [id="job_title"]');
  return el?.textContent?.trim() || '';
}

function getCardCompany(card) {
  const el = card.querySelector('.company-name, .company_name, .link_display_like_text, .company_and_premium a, a[class*="company"]');
  if (el) return el.textContent.trim();
  // Fallback for newer DOM where company name is in a p tag
  const p = card.querySelector('.company_and_premium p, .company p');
  return p?.textContent?.trim() || '';
}

function getCardLink(card) {
  const el = card.querySelector('a.job-title-href, a[href*="/internship/detail/"], a[href*="/job/detail/"], .internship_heading a, .job_heading a, h3 a, a.view_detail_button');
  return el?.href || '';
}

function isCardAlreadyApplied(card) {
  const text = card.textContent.toLowerCase();
  return text.includes('already applied') || text.includes('applied') && card.querySelector('.already_applied, .applied_message, .ic-16-checkmark, [class*="applied"]');
}

// ── Profile Field Mapper ─────────────────────────────────────────────
function mapLabelToProfileValue(label, profile) {
  if (!label || !profile) return '';
  const l = label.toLowerCase().trim();

  if (l.includes('full name') || l === 'name') return profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  if (l.includes('first name')) return profile.firstName || '';
  if (l.includes('last name')) return profile.lastName || '';
  if (l.includes('email')) return profile.email || '';
  if (l.includes('phone') || l.includes('mobile') || l.includes('contact number')) return profile.phoneNumber || '';
  if (l.includes('current city') || l.includes('city') || l.includes('location')) return profile.currentCity || '';
  if (l.includes('state')) return profile.state || '';
  if (l.includes('country')) return profile.country || 'India';
  if (l.includes('address')) return profile.address || '';
  if (l.includes('pincode') || l.includes('zip')) return profile.pincode || '';
  if (l.includes('college') || l.includes('institution') || l.includes('university')) return profile.college || profile.university || '';
  if (l.includes('degree') || l.includes('qualification')) return profile.degree || '';
  if (l.includes('major') || l.includes('branch') || l.includes('specialization')) return profile.major || '';
  if (l.includes('graduation year') || l.includes('year of graduation') || l.includes('passing year')) return profile.graduationYear || '';
  if (l.includes('current year') || l.includes('year of study')) return profile.currentYear || '';
  if (l.includes('cgpa') || l.includes('gpa')) return profile.cgpa || '';
  if (l.includes('percentage') || l.includes('marks')) return profile.percentage || '';
  if (l.includes('experience') && l.includes('year')) return profile.yearsOfExperience || '0';
  if (l.includes('internship') && (l.includes('how many') || l.includes('number'))) return profile.internshipCount || '0';
  if (l.includes('availability') || l.includes('start date') || l.includes('join')) return profile.availabilityDate || '';
  if (l.includes('notice')) return profile.noticePeriod || '';
  if (l.includes('relocate') || l.includes('willing to relocate')) return profile.willingToRelocate || 'Yes';
  if (l.includes('cover letter')) return profile.coverLetter || '';
  if (l.includes('why') && l.includes('internship')) return profile.whyThisInternship || '';
  if (l.includes('why') && (l.includes('hire') || l.includes('choose') || l.includes('suitable'))) return profile.whyHireMe || '';
  if (l.includes('stipend') || l.includes('expected')) return profile.expectedStipend || '';
  if (l.includes('skill')) return Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');
  if (l.includes('linkedin')) return profile.linkedinUrl || '';
  if (l.includes('github')) return profile.githubUrl || '';
  if (l.includes('portfolio') || l.includes('website')) return profile.portfolioUrl || profile.websiteUrl || '';
  if (l.includes('gender')) return profile.gender || '';
  if (l.includes('date of birth') || l.includes('dob')) return profile.dateOfBirth || '';
  if (l.includes('work authorization') || l.includes('authorized')) return profile.workAuthorization || 'Yes';
  if (l.includes('language')) return profile.languageProficiency || '';

  return '';
}

// ── Form Fill Logic ──────────────────────────────────────────────────
async function fillFormFields(container, profile) {
  let filled = 0;
  const missingRequired = [];

  // Unified selector for performance
  const fields = container.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea, select');
  
  for (const field of fields) {
    if (!isVisible(field)) continue;
    
    // Skip if already filled
    const isRadioOrCheck = field.type === 'radio' || field.type === 'checkbox';
    if (!isRadioOrCheck && field.value && field.value.trim().length > 0) continue;
    if (isRadioOrCheck && field.checked) continue;

    const label = getFieldLabel(field);
    const answer = mapLabelToProfileValue(label, profile);
    
    if (!answer) {
      const isReq = field.hasAttribute('required') || field.closest('.form-group, .question_container')?.querySelector('.required, .text-danger, .asterisk');
      if (isReq && isVisible(field)) missingRequired.push(label || field.name || 'required field');
      continue;
    }

    // Fill based on type
    if (field.tagName === 'SELECT') {
      const opts = Array.from(field.options);
      const match = opts.find(o => o.text.toLowerCase().includes(answer.toLowerCase()) || o.value.toLowerCase() === answer.toLowerCase());
      if (match) {
        field.value = match.value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        // Handle Internshala's Chosen plugin
        if (window.jQuery && window.jQuery(field).data('chosen')) {
          injectScript(`try { jQuery('#${field.id}').trigger('chosen:updated'); } catch(e) {}`);
        }
        filled++;
        await sleep(100);
      }
    } else if (field.type === 'radio' || field.type === 'checkbox') {
      const fieldLabel = field.closest('label')?.textContent?.trim()?.toLowerCase() || field.value.toLowerCase();
      if (fieldLabel.includes(answer.toLowerCase()) || answer.toLowerCase().includes(fieldLabel)) {
        field.checked = true;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
        await sleep(100);
      }
    } else {
      setNativeValue(field, answer);
      filled++;
      await sleep(100);
    }
  }

  logger.info(`Filled ${filled} fields. Missing required: ${missingRequired.length}`);
  return { filled, missingRequired };
}

// ── Resume Handler ───────────────────────────────────────────────────
async function handleResume(container) {
  const uploaded = container.querySelector('.resume_uploaded, .uploaded_resume, .file-name, .resume-filename');
  if (uploaded && uploaded.textContent.trim()) {
    logger.success('Resume already uploaded');
    return true;
  }
  const fileInput = container.querySelector('input[type="file"]');
  if (fileInput) {
    logger.warn('Resume file input found but cannot auto-upload (security restriction). User must upload manually.');
    return false;
  }
  logger.info('No resume section detected');
  return true;
}

// ── Validation ───────────────────────────────────────────────────────
function getValidationErrors(container) {
  const errors = [];
  const errorEls = container.querySelectorAll('.error, .has-error, .field-error, .help-block.text-danger, .invalid-feedback, .form-group.has-error');
  errorEls.forEach(el => {
    const text = el.textContent.trim();
    if (text && text.length < 200) errors.push(text);
  });
  return errors;
}

function checkUnfilledRequired(container) {
  const unfilled = [];
  container.querySelectorAll('input[required], textarea[required], select[required]').forEach(el => {
    if (!el.value || !el.value.trim()) {
      const label = getFieldLabel(el);
      unfilled.push(label || el.name || el.id || 'unknown');
    }
  });
  return unfilled;
}

// ── Agent Lock Overlay ───────────────────────────────────────────────
let _lockOverlay = null;
let _lockToast = null;
let _toastTimer = null;

function createAgentLock() {
  if (document.getElementById('smartapply-internshala-lock')) return;
  const overlay = document.createElement('div');
  overlay.id = 'smartapply-internshala-lock';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:not-allowed;background:transparent;touch-action:none;';
  const BLOCKED = ['click','mousedown','mouseup','pointerdown','pointerup','touchstart','touchend','keydown','keyup','keypress'];
  for (const ev of BLOCKED) {
    overlay.addEventListener(ev, (e) => {
      if (e.target.closest?.('#smartapply-internshala-toast')) return;
      e.stopImmediatePropagation(); e.preventDefault(); showLockToast();
    }, true);
  }
  document.body.appendChild(overlay);
  _lockOverlay = overlay;
  buildLockToast();
}

function buildLockToast() {
  if (document.getElementById('smartapply-internshala-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'smartapply-internshala-toast';
  toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.88);z-index:2147483647;background:rgba(16,16,18,0.94);backdrop-filter:blur(18px);border:1px solid rgba(0,188,212,0.25);border-radius:18px;padding:28px 36px 22px;text-align:center;font-family:system-ui,sans-serif;box-shadow:0 24px 64px rgba(0,0,0,0.6);opacity:0;pointer-events:auto;transition:opacity 0.18s ease,transform 0.18s ease;min-width:260px;user-select:none;';
  toast.innerHTML = `
    <div style="font-size:36px;margin-bottom:12px">🎓</div>
    <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:6px">Agent is controlling</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,0.5);line-height:1.55;margin-bottom:20px">SmartApply is applying on Internshala.<br>Please don't touch the browser.</div>
    <button id="smartapply-internshala-stop" style="background:#C93535;color:#fff;border:none;border-radius:9px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer;font-family:system-ui,sans-serif;">■ Stop Bot</button>
  `;
  document.body.appendChild(toast);
  _lockToast = toast;
  document.getElementById('smartapply-internshala-stop').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'STOP_INTERNSHALA_AUTOMATION' }).catch(() => {});
    removeAgentLock();
  });
}

function showLockToast() {
  if (!_lockToast) buildLockToast();
  clearTimeout(_toastTimer);
  requestAnimationFrame(() => { _lockToast.style.opacity = '1'; _lockToast.style.transform = 'translate(-50%,-50%) scale(1)'; });
  _toastTimer = setTimeout(() => { _lockToast.style.opacity = '0'; _lockToast.style.transform = 'translate(-50%,-50%) scale(0.88)'; }, 2200);
}

function removeAgentLock() {
  clearTimeout(_toastTimer);
  if (_lockOverlay) { _lockOverlay.remove(); _lockOverlay = null; }
  if (_lockToast) { _lockToast.remove(); _lockToast = null; }
}

// ── Apply Modal Handler ──────────────────────────────────────────────
async function findAndClickApply() {
  // Try multiple selectors for the Apply button
  const selectors = [
    '#apply_now_button', '#make_application_button', '#easy_apply_button', 
    '.easy_apply_button', '#top_easy_apply_button',
    '.apply_now_btn', '.easy-apply-btn', 'button.btn.btn-primary.apply_button',
    'a.btn.btn-primary[href*="/apply/"]', '.apply_now_cta',
    '.apply_button', '#apply_button', '.btn_apply', '.apply_now_button'
  ];
  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (btn && isVisible(btn)) {
      const text = btn.textContent.trim().toLowerCase();
      if (text.includes('applied') || text.includes('already')) {
        logger.info('Already applied to this job');
        return false;
      }
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(800);
      clickElement(btn);
      logger.info(`Clicked Apply button: ${sel}`);
      return true;
    }
  }
  // Fallback: find button/link containing "apply" text
  const allBtns = document.querySelectorAll('button, a.btn, .btn');
  for (const btn of allBtns) {
    const text = btn.textContent.trim().toLowerCase();
    if ((text.includes('apply now') || text === 'apply' || text.includes('easy apply')) && isVisible(btn) && !text.includes('applied')) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(500);
      clickElement(btn);
      logger.info(`Clicked Apply button (text match: "${text}")`);
      return true;
    }
  }
  return false;
}

async function waitForModal(timeout = 10000) {
  const start = Date.now();
  logger.info('Waiting for application modal/form...');
  while (Date.now() - start < timeout) {
    // Check for modal
    const modal = document.querySelector('#easy_apply_modal, .modal.easy-apply-modal, .modal.show, .modal[id*="apply"], #application_modal, .application_modal, .modal-backdrop');
    if (modal && isVisible(modal)) {
      logger.success('Modal detected');
      return modal;
    }
    // Check for inline application form
    const inlineForm = document.querySelector('.easy_apply_step, .application_step, .step_container, .application_form, #application_form, .assessment_container, .assessment_step');
    if (inlineForm && isVisible(inlineForm)) {
      logger.success('Inline application form detected');
      return inlineForm.closest('.modal, .modal-content, form, .container-fluid, #application_form') || inlineForm;
    }
    // Fallback: any visible modal-content
    const anyModal = document.querySelector('.modal-content, .modal-body');
    if (anyModal && isVisible(anyModal)) {
      logger.success('Generic modal content detected');
      return anyModal;
    }
    await sleep(500);
  }
  logger.warn('Modal/Form not found within timeout');
  return null;
}

async function handleApplicationResult(result, job) {
  if (result.status === 'applied') {
    automation.appliedJobIds.add(job.jobId);
    const ids = Array.from(automation.appliedJobIds).slice(-5000);
    chrome.storage.local.set({ internshalaAppliedJobIds: ids }).catch(() => {});
    logger.success(`Applied: ${job.title}`);
    reportResult({ result: 'Applied', job_title: job.title, company: job.company, job_url: job.link, jobId: job.jobId });
  } else if (result.status === 'skipped') {
    logger.info(`Skipped: ${job.title} (${result.reason})`);
    reportResult({ result: 'Skipped', reason: result.reason, job_title: job.title, company: job.company, job_url: job.link, jobId: job.jobId });
  } else {
    logger.warn(`Failed: ${job.title} (${result.reason})`);
    reportResult({ result: 'Failed', reason: result.reason, job_title: job.title, company: job.company, job_url: job.link, jobId: job.jobId });
  }
}

async function handleEasyApplyModal(profile, settings) {
  const modal = await waitForModal();
  if (!modal) {
    logger.warn('Apply modal did not appear');
    return { status: 'failed', reason: 'modal_not_opened' };
  }
  logger.info('Easy Apply modal detected');
  await sleep(500);

  // Handle multi-step forms: keep clicking Next while filling fields
  let stepAttempts = 0;
  const MAX_STEPS = 8;

  while (stepAttempts < MAX_STEPS) {
    stepAttempts++;
    await sleep(500);

    // Fill all visible form fields in the current step
    const { filled, missingRequired } = await fillFormFields(modal, profile);
    logger.info(`Step ${stepAttempts}: filled ${filled} fields`);

    // Handle resume
    await handleResume(modal);

    // Check for validation errors
    const errors = getValidationErrors(modal);
    if (errors.length) {
      logger.warn(`Validation errors: ${errors.join('; ')}`);
    }

    // Look for Next button
    const nextBtn = findNextButton(modal);
    const submitBtn = findSubmitButton(modal);

    if (submitBtn && !nextBtn) {
      // We're at the final step
      const unfilled = checkUnfilledRequired(modal);
      if (unfilled.length) {
        logger.warn(`Unfilled required fields: ${unfilled.join(', ')}`);
        notifyPopup(`⚠️ Missing required: ${unfilled.join(', ')}`);
      }

      // Check humanConfirmSubmit setting
      if (settings?.humanConfirmSubmit && !settings?.autoSubmit) {
        logger.info('Waiting for user confirmation before submit...');
        notifyPopup('🛑 Ready to submit. Please confirm in popup.');
        chrome.runtime.sendMessage({
          type: 'INTERNSHALA_NEEDS_CONFIRMATION',
          payload: { step: 'submit_ready', missingFields: unfilled, errors },
        }).catch(() => {});
        // Wait for confirmation
        const confirmed = await waitForUserConfirmation(60000);
        if (!confirmed) {
          logger.info('User did not confirm. Skipping.');
          dismissModal(modal);
          return { status: 'skipped', reason: 'user_cancelled' };
        }
      }

      // Submit
      logger.info('Submitting application...');
      submitBtn.click();
      await sleep(3000);

      // Check for success
      if (checkSubmitSuccess()) {
        logger.success('Application submitted successfully!');
        return { status: 'applied' };
      } else {
        const postErrors = getValidationErrors(modal);
        logger.warn('Submit may have failed: ' + postErrors.join('; '));
        return { status: 'failed', reason: 'submit_error', errors: postErrors };
      }
    }

    if (nextBtn) {
      nextBtn.click();
      logger.info('Clicked Next');
      await sleep(1000);
      // Re-scan for newly visible fields after step transition
      continue;
    }

    // No Next or Submit found - check if success already
    if (checkSubmitSuccess()) {
      return { status: 'applied' };
    }

    break;
  }

  return { status: 'failed', reason: 'no_submit_found' };
}

function findNextButton(container) {
  const selectors = ['#next_button', '.next_button', 'button.btn.btn-primary.submit_button'];
  for (const sel of selectors) {
    const btn = container.querySelector(sel);
    if (btn && isVisible(btn) && btn.textContent.trim().toLowerCase().includes('next')) return btn;
  }
  const allBtns = container.querySelectorAll('button.btn-primary, .modal-footer button');
  for (const btn of allBtns) {
    const text = btn.textContent.trim().toLowerCase();
    if (text === 'next' || text === 'continue') return btn;
  }
  return null;
}

function findSubmitButton(container) {
  const selectors = ['#submit_button', '.submit_button', 'button[type="submit"].btn-primary'];
  for (const sel of selectors) {
    const btn = container.querySelector(sel);
    if (btn && isVisible(btn)) return btn;
  }
  const allBtns = container.querySelectorAll('button.btn-primary, .modal-footer button');
  for (const btn of allBtns) {
    const text = btn.textContent.trim().toLowerCase();
    if (text === 'submit' || text === 'submit application' || text === 'apply') return btn;
  }
  return null;
}

function checkSubmitSuccess() {
  const pageText = document.body?.textContent?.toLowerCase() || '';
  const successPhrases = ['application submitted', 'successfully applied', 'applied successfully', 'application sent', 'thank you for applying'];
  if (successPhrases.some(s => pageText.includes(s))) return true;
  const successEl = document.querySelector('.easy-apply-success, .application-success, .success_message, .alert-success');
  if (successEl && isVisible(successEl)) return true;
  return false;
}

function dismissModal(modal) {
  const closeBtn = modal.querySelector('.modal-header .close, button.close, [data-dismiss="modal"]');
  if (closeBtn) { closeBtn.click(); return; }
  // Press Escape
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// ── User Confirmation Gate ───────────────────────────────────────────
let _confirmResolve = null;

function waitForUserConfirmation(timeout = 60000) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    setTimeout(() => { _confirmResolve = null; resolve(false); }, timeout);
  });
}

// ── Global State ─────────────────────────────────────────────────────
let automation = {
  isRunning: false, isPaused: false, state: null, sessionId: null,
  totalApplied: 0, totalFailed: 0, totalSkipped: 0, appliedJobIds: new Set(),
};

// ── Message Handler ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_INTERNSHALA_AUTOMATION':
      startAutomation(message.state, message.resumeCounters).then(sendResponse);
      return true;
    case 'STOP_INTERNSHALA_AUTOMATION':
      stopAutomation(); sendResponse({ ok: true }); break;
    case 'PAUSE_INTERNSHALA_AUTOMATION':
      automation.isPaused = true; sendResponse({ ok: true }); break;
    case 'RESUME_INTERNSHALA_AUTOMATION':
      automation.isPaused = false; sendResponse({ ok: true }); break;
    case 'INTERNSHALA_USER_CONFIRMED':
      if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
      sendResponse({ ok: true }); break;
    case 'INTERNSHALA_USER_CANCELLED':
      if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
      sendResponse({ ok: true }); break;
    case 'PING':
      sendResponse({ ok: true }); break;
  }
});

// ── Auto-Resume ──────────────────────────────────────────────────────
async function triggerReloadAndResume(state) {
  try {
    await chrome.storage.local.set({
      internshalaAutoResume: true,
      internshalaResumeState: state
    });
  } catch(e) {}
}

function checkAutoResume() {
  chrome.storage.local.get(['internshalaAutoResume', 'internshalaResumeState']).then(res => {
    if (res.internshalaAutoResume && res.internshalaResumeState) {
      chrome.storage.local.set({ internshalaAutoResume: false }).catch(()=>{});
      setTimeout(() => {
        logger.info('Auto-resuming automation after navigation...');
        startAutomation(res.internshalaResumeState);
      }, 2500);
    }
  }).catch(()=>{});
}

function injectScript(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// ── Filter Automation ────────────────────────────────────────────────
async function applySearchFilters(profile, state) {
  logger.info('Applying search filters from profile...');
  let changed = false;

  const profileStr = profile.jobTitle || (profile.skills && profile.skills[0]) || '';
  const locStr = profile.preferredLocation || profile.currentCity || 'hyderabad';
  const expStr = profile.yearsOfExperience || '';

  const generateSlug = (str) => str ? str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
  
  const pSlug = generateSlug(profileStr);
  const lSlug = generateSlug(locStr);

  let targetPath = '/jobs/';
  if (pSlug && lSlug) targetPath = `/jobs/${pSlug}-jobs-in-${lSlug}/`;
  else if (pSlug) targetPath = `/jobs/${pSlug}-jobs/`;
  else if (lSlug) targetPath = `/jobs/jobs-in-${lSlug}/`;

  const normalize = (p) => p.toLowerCase().replace(/\/$/, '').split('?')[0];
  if (normalize(window.location.pathname) !== normalize(targetPath)) {
    logger.info(`Navigating to structured URL for filters: ${targetPath}`);
    await triggerReloadAndResume(state);
    window.location.href = `https://internshala.com${targetPath}`;
    return true; 
  }

  // Use jQuery injection to perfectly update the Experience Chosen dropdown
  if (expStr) {
    let expSearchStr = (expStr === '0' || expStr.toLowerCase() === 'fresher') ? 'fresher' : expStr;
    const code = `
      try {
        if (window.$ && $('#select_experience').length) {
          $('#select_experience').val('${expSearchStr}').trigger('change').trigger('chosen:updated');
        }
      } catch(e) {}
    `;
    injectScript(code);
    changed = true;
    logger.info(`Experience filter set to: ${expSearchStr}`);
    await sleep(4000); // Wait for XHR refresh from experience change
  }

  if (changed) {
    logger.info('Filters modified via dropdown. Waiting for results to fetch...');
    await sleep(4000);
  } else {
    logger.info('Filters applied successfully.');
  }

  return false; 
}

// ── Main Automation Loop ─────────────────────────────────────────────
async function startAutomation(state, resumeCounters) {
  createAgentLock();
  if (automation.isRunning) return { ok: false, reason: 'already_running' };

  automation.isRunning = true;
  automation.isPaused = false;
  
  // Persist sessionId in state so auto-resume maintains the same session
  if (!state.internshalaRuntime) state.internshalaRuntime = {};
  
  // Try to recover sessionId from storage first
  const storedState = await chrome.storage.local.get('internshalaResumeState');
  const recoveredSessionId = storedState.internshalaResumeState?.internshalaRuntime?.sessionId;
  
  if (recoveredSessionId) {
    state.internshalaRuntime.sessionId = recoveredSessionId;
    logger.info(`Recovered session ID: ${recoveredSessionId}`);
  } else if (!state.internshalaRuntime.sessionId) {
    state.internshalaRuntime.sessionId = `internshala_${Date.now()}`;
  }
  
  automation.state = state;
  automation.sessionId = state.internshalaRuntime.sessionId;

  try {
    const stored = await chrome.storage.local.get('internshalaAppliedJobIds');
    automation.appliedJobIds = new Set(stored.internshalaAppliedJobIds || []);
  } catch (_) { automation.appliedJobIds = new Set(); }

  if (resumeCounters) {
    automation.totalApplied = resumeCounters.totalApplied || 0;
    automation.totalFailed = resumeCounters.totalFailed || 0;
    automation.totalSkipped = resumeCounters.totalSkipped || 0;
  } else {
    automation.totalApplied = 0; automation.totalFailed = 0; automation.totalSkipped = 0;
  }

  const maxApps = state.internshalaSettings?.maxApplications || state.settings?.maxApplications || 15;
  const profile = state.internshalaProfile || state.profile || {};
  const settings = state.internshalaSettings || state.settings || {};
  const badWords = profile.bad_words || [];
  const pageType = detectPageType();
  const processedJobIds = new Set(state.internshalaRuntime?.processedJobIds || []);

  logger.info(`Internshala automation running. Max: ${maxApps}, Page: ${pageType}`);

  if (pageType === 'dashboard' || pageType === 'login') {
    if (pageType === 'dashboard') {
      logger.info('Dashboard detected. Redirecting to Jobs page to start search...');
      try { 
        await chrome.storage.local.set({ 
          internshalaFiltersSession: null,
          internshalaAutoResume: true,
          internshalaResumeState: automation.state
        }); 
      } catch(e){}
      window.location.href = 'https://internshala.com/jobs/';
    }
    return { ok: true };
  }

  if (pageType === 'job_listings' || pageType === 'internship_listings') {
    let filtersApplied = false;
    try {
      const stored = await chrome.storage.local.get('internshalaFiltersSession');
      filtersApplied = stored.internshalaFiltersSession === automation.sessionId;
    } catch(e){}

    if (!filtersApplied) {
      try { await chrome.storage.local.set({ internshalaFiltersSession: automation.sessionId }); } catch(e){}
      const changed = await applySearchFilters(profile, automation.state);
      if (changed) {
        logger.info('Filters applied. Navigation in progress...');
        return { ok: true };
      }
    }
  }

  if (pageType === 'detail') {
    const { internshalaCurrentJob } = await chrome.storage.local.get('internshalaCurrentJob');
    const job = internshalaCurrentJob || {};
    
    try {
      const clicked = await findAndClickApply();
      if (!clicked) {
        logger.warn(`Skipping (no apply button): ${job.title}`);
        reportResult({ result: 'Skipped', reason: 'no_apply_button', job_title: job.title, company: job.company, job_url: job.link, jobId: job.jobId });
        await sleep(2000);
        window.history.back();
      } else {
        // After clicking, the page might open a modal OR navigate to an application form
        logger.info('Apply clicked. Waiting for modal or navigation...');
        await sleep(3000);
        
        // Re-detect page type after click
        const newPageType = detectPageType();
        logger.info(`Detected post-click page type: ${newPageType}`);
        
        const result = await handleEasyApplyModal(profile, settings);
        await handleApplicationResult(result, job);
        
        if (newPageType === 'application_form' || window.location.href.includes('/application/form')) {
          window.location.href = 'https://internshala.com/jobs/';
        } else {
          window.history.back();
        }
      }
    } catch (err) {
      logger.error(`Error on ${job.title}: ${err.message}`);
      reportResult({ result: 'Failed', reason: err.message, job_title: job.title, company: job.company, job_url: job.link, jobId: job.jobId });
    }
    return { ok: true };
  }

  if (pageType === 'application_form' || pageType === 'easy_apply_modal') {
    const { internshalaCurrentJob } = await chrome.storage.local.get('internshalaCurrentJob');
    const job = internshalaCurrentJob || {};
    logger.info('Application form/modal detected. Filling fields...');
    const result = await handleEasyApplyModal(profile, settings);
    await handleApplicationResult(result, job);
    
    // If it was a navigation-based form, go back twice or to jobs
    if (window.location.href.includes('/application/form')) {
       window.location.href = 'https://internshala.com/jobs/';
    } else {
       window.history.back();
    }
    return { ok: true };
  }

  // ── Search Page Logic ──
  try {
    await sleep(DELAYS.LONG);
    let pageAttempts = 0;
    const MAX_PAGE_ATTEMPTS = 10;

    while (automation.isRunning && pageAttempts < MAX_PAGE_ATTEMPTS) {
      if (automation.isPaused) { await sleep(500); continue; }
      const total = automation.totalApplied + automation.totalFailed + automation.totalSkipped;
      if (total >= maxApps) { logger.info(`Max applications (${maxApps}) reached.`); break; }

      const cards = findInternshipCards();
      if (!cards.length) {
        window.scrollBy(0, 600); await sleep(1500);
        const retry = findInternshipCards();
        if (!retry.length) {
          const nextBtn = document.querySelector('#navigation a:last-child, .pagination a:last-child, a[rel="next"]');
          if (nextBtn && !nextBtn.classList.contains('disabled')) {
            logger.info('Going to next page…');
            nextBtn.click(); await sleep(DELAYS.EXTRA_LONG); pageAttempts++; continue;
          }
          logger.info('No more cards found.'); break;
        }
        continue; // Re-scan with retry results
      }

      let navigated = false;
      for (const card of cards) {
        if (!automation.isRunning) break;
        if (automation.isPaused) { await sleep(500); continue; }
        const totalNow = automation.totalApplied + automation.totalFailed + automation.totalSkipped;
        if (totalNow >= maxApps) break;

        card.setAttribute('data-sa-processed', 'true');
        const title = getCardTitle(card);
        const company = getCardCompany(card);
        const link = getCardLink(card);
        const jobId = link.match(/\/(\d+)\/?/) ? link.match(/\/(\d+)\/?/)[1] : link;

        if (processedJobIds.has(jobId)) continue;

        if (isCardAlreadyApplied(card)) {
          logger.info(`Skipping (already applied): ${title}`);
          reportResult({ result: 'Skipped', reason: 'already_applied', job_title: title, company, job_url: link, jobId });
          continue;
        }
        if (badWords.length) {
          const titleLow = title.toLowerCase();
          if (badWords.some(w => titleLow.includes(w.toLowerCase()))) {
            logger.info(`Skipping (bad word): ${title}`);
            reportResult({ result: 'Skipped', reason: 'bad_word', job_title: title, company, job_url: link, jobId });
            continue;
          }
        }
        if (automation.appliedJobIds.has(jobId)) {
          logger.info(`Skipping (duplicate): ${title}`);
          reportResult({ result: 'Skipped', reason: 'duplicate', job_title: title, company, job_url: link, jobId });
          continue;
        }

        if (!link || !title) {
          logger.warn(`Skipping card: title or link not found. Title: "${title}", Link: "${link}"`);
          continue;
        }

        logger.info(`Applying: ${title} at ${company}`);
        notifyPopup(`📋 Applying: ${title} at ${company}`);

        await chrome.storage.local.set({ internshalaCurrentJob: { jobId, title, company, link } });
        window.location.href = link;
        navigated = true;
        break; 
      }

      if (navigated) return { ok: true };

      // If we processed all cards on this page without navigating
      window.scrollBy(0, 400);
      await sleep(1000);
      const nextBtn = document.querySelector('#navigation a:last-child, .pagination a:last-child, a[rel="next"]');
      if (nextBtn && !nextBtn.classList.contains('disabled')) {
        logger.info('Going to next page…');
        nextBtn.click(); await sleep(DELAYS.EXTRA_LONG); pageAttempts++; continue;
      } else {
        logger.info('No more pages found.'); break;
      }
    }
  } catch (err) {
    logger.error(`Automation error: ${err.message}`);
  }

  automation.isRunning = false;
  removeAgentLock();
  logger.info('Internshala automation finished');

  chrome.runtime.sendMessage({
    type: 'INTERNSHALA_AUTOMATION_FINISHED',
    payload: { totalApplied: automation.totalApplied, totalFailed: automation.totalFailed, totalSkipped: automation.totalSkipped },
  }).catch(() => {});

  return { ok: true };
}

function stopAutomation() {
  automation.isRunning = false;
  automation.isPaused = false;
  removeAgentLock();
  logger.info('Internshala automation stopped');
}

// ── Messaging Helpers ────────────────────────────────────────────────
function sendProgress() {
  chrome.runtime.sendMessage({
    type: 'INTERNSHALA_PROGRESS_UPDATE',
    payload: { totalApplied: automation.totalApplied, totalFailed: automation.totalFailed, totalSkipped: automation.totalSkipped },
  }).catch(() => {});
}

function reportResult(data) {
  chrome.runtime.sendMessage({
    type: 'INTERNSHALA_REPORT_RESULT',
    payload: { ...data, platform: 'internshala', session_id: automation.sessionId },
  }).catch(() => {});
}

function notifyPopup(text) {
  chrome.runtime.sendMessage({ type: 'INTERNSHALA_POPUP_LOG', text }).catch(() => {});
}

// ── Floating Logger ──────────────────────────────────────────────────
function initFloatingLogger() {
  if (document.getElementById('smartapply-internshala-logger')) return;
  const c = document.createElement('div');
  c.id = 'smartapply-internshala-logger';
  c.style.cssText = 'position:fixed;bottom:20px;left:20px;width:320px;height:360px;background:rgba(28,28,30,0.85);backdrop-filter:blur(12px);border:1px solid rgba(0,188,212,0.2);border-radius:12px;z-index:2147483647;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);transition:opacity 0.3s;pointer-events:auto;';

  const h = document.createElement('div');
  h.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);font-weight:600;font-size:13px;color:#fff;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(0,188,212,0.15),transparent);border-radius:12px 12px 0 0;font-family:system-ui,sans-serif;cursor:grab;user-select:none;';
  h.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:#00bcd4;box-shadow:0 0 8px #00bcd4;"></div> SmartApply — Internshala Logs';

  const feed = document.createElement('div');
  feed.id = 'smartapply-internshala-log-feed';
  feed.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;color:#c1c1c4;display:flex;flex-direction:column;scrollbar-width:none;';

  c.appendChild(h); c.appendChild(feed); document.body.appendChild(c);

  // Draggable
  let dragging = false, cx = 0, cy = 0, ix = 0, iy = 0, ox = 0, oy = 0;
  h.addEventListener('mousedown', (e) => { ix = e.clientX - ox; iy = e.clientY - oy; dragging = true; });
  document.addEventListener('mousemove', (e) => { if (!dragging) return; e.preventDefault(); cx = e.clientX - ix; cy = e.clientY - iy; ox = cx; oy = cy; c.style.transform = `translate(${cx}px,${cy}px)`; });
  document.addEventListener('mouseup', () => { dragging = false; });

  appendLog('Internshala logger ready.', 'success');
}

// ── Init ─────────────────────────────────────────────────────────────
initFloatingLogger();
checkAutoResume();
logger.info(`Internshala content script loaded on ${window.location.hostname}`);
chrome.runtime.sendMessage({ type: 'INTERNSHALA_CONTENT_READY', url: window.location.href }).catch(() => {});

})();

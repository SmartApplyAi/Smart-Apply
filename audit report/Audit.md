# Audit Report: Extension and Automation Service Removal

This document outlines all the files, code blocks, endpoints, components, and references related to the Chrome Extension and Automation Service that need to be removed or modified to completely excise these features from the codebase.

## 1. Files and Directories to Delete Entirely

The following files are strictly dedicated to the extension or automation and can be safely deleted:

### Backend
- `services/automation_service.py`
- `routers/automation.py`
- `routers/extension_auth.py`
- `tests/test_automation_service.py`

### General
- `extension.zip` (if it exists in the codebase root/parent directory based on the reference in `routers/jobs.py`)
- `dummy-extension.zip` (if it exists)

*(Note: The user indicated the `Extension/` folder has already been removed).*

## 2. Code Modifications Required (Backend)

The following files contain references, imports, or logic related to the extension or automation that must be stripped out:

### `main.py`
- Remove the router inclusions for `automation.router` and `extension_auth.router`.

### `dependencies.py`
- Remove `extension_routes` check allowing unverified emails for extension endpoints.
- Remove logic inside `get_current_user` that handles token validation for `token_type == "extension"` and database lookups in `db.extension_sessions`.

### `database.py`
- Remove index creation for `automation_sessions`, `automation_logs`, `extension_tokens`, and `extension_sessions`.

### `utils.py`
- Remove `create_extension_token(data: dict, expires_delta=None)` function.

### `routers/jobs.py`
- Remove imports for `automation_service`.
- Remove the following endpoints:
  - `GET /extension/download`
  - `POST /extension/connect`
  - `POST /extension/report-step`
  - `POST /extension/report-result`

### `routers/ai.py`
- Remove logic/references checking for the extension threshold.
- Remove `_get_user_resume_text` import from `automation_service` if present (or refactor if moved).
- Remove the `pre-apply-score` feature if it's strictly an extension gate.

### `routers/admin.py` & `services/admin_service.py`
- Remove endpoints and service logic for `GET /admin/sessions` (active automation sessions view).
- Remove references to `automation_sessions` in admin queries.
- Remove the "Automation Summary" email generation/logic in admin actions.

### `routers/dashboard.py` & `services/dashboard_service.py`
- Remove logic pulling activity feed events related to `automation_logs` or where `type == "automation"`.

### `routers/websocket_router.py`
- Remove CORS / Origin checks for `chrome-extension://`.

### `services/email_service.py`
- Remove references and functions sending "Automation Summary" emails.

### `tests/conftest.py`
- Remove table/collection clears or mocks for `automation_sessions`, `automation_logs`, `extension_tokens`, and `extension_sessions`.

## 3. Code Modifications Required (Frontend - React)

The following files contain UI, logic, or text referencing the extension or automation that must be stripped out:

### API Services / Utilities
- `frontend-react/src/services/linkedinBridge.js` - **DELETE FILE** (Strictly for extension communication).

### Pages
- `frontend-react/src/pages/DashboardPage.jsx`:
  - Remove the "Extension" tab from the UI.
  - Remove the `downloadExtension` function and associated buttons.
  - Remove active tab checks/logic for `'extension'`.
- `frontend-react/src/pages/SettingsPage.jsx`:
  - Remove the "Extension" panel/tab.
  - Remove `POST /extension/pairing-code` calls and UI for generating pairing codes.
- `frontend-react/src/pages/ResumePage.jsx`:
  - Remove calls to `LinkedInBridge.syncProfileToExtension`.
- `frontend-react/src/pages/SkillGapPage.jsx`:
  - Remove text: "Start applying to jobs with the extension..."
- `frontend-react/src/pages/PrivacyPolicyPage.jsx`:
  - Remove references to the Chrome extension and "Extension Data" collection.

### Components
- `frontend-react/src/components/profile/LoginsSection.jsx`:
  - Remove text explaining credentials used by the extension.
- `frontend-react/src/components/profile/AdditionalSection.jsx`:
  - Remove text explaining answers help the extension fill forms.
- `frontend-react/src/components/contact/ContactSection.jsx`:
  - Remove instructions referencing Extensions.
- `frontend-react/src/components/faq/FAQSection.jsx`:
  - Remove FAQs relating to the extension running locally, working worldwide, and keeping tabs open.
- `frontend-react/src/components/features/FeaturesSection.jsx`:
  - Remove the "Auto Apply with AI" / Extension feature block.
- `frontend-react/src/components/cta/CTASection.jsx`:
  - Remove text referencing "AI-powered automation".
- `frontend-react/src/components/howitworks/HowItWorks.jsx`:
  - Remove the "Auto Apply with AI" step.
- `frontend-react/src/components/layout/Footer.jsx`:
  - Remove mentions of "AI-powered job application automation".

### Layouts & App Config
- `frontend-react/src/App.jsx`:
  - Remove the route mapping for `/extension`.
- `frontend-react/src/layouts/ProtectedLayout.jsx`:
  - Remove `/extension` from the `isDashboardPath` list.
- `frontend-react/index.html`:
  - Update `<title>` to remove "Job Application Automation".
  - Update `<meta name="description">` to remove mentions of automatically applying to jobs.

## 4. Documentation

### `README.md`
- Needs a massive overhaul to remove all claims and documentation regarding the Chrome Extension, Auto-Applying, and the `/api/automation/` and `/api/extension-auth/` endpoints.

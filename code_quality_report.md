# Code Quality & Unused Assets Report

This report outlines unused API endpoints, dead code (both frontend and backend), and recommendations for code quality improvements in the SmartApply repository.

## 1. Unused Backend API Endpoints

The following FastAPI endpoints are defined in the backend but do not appear to be called by either the React frontend or the Chrome extension.

**Admin & Monitoring:**
- `GET /admin/nim-test`
- `GET /admin/mail-config`
- `PUT /admin/mail-config`
- `GET /monitor/monitor/stats`

**Notifications:**
- `GET /notifications/unread-count`
- `PATCH /notifications/{notification_id}/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/{notification_id}`

**Jobs / Applications:**
- `GET /jobs/stats`
- `GET /jobs/public-stats`
- `GET /jobs/recent`
- `POST /jobs/applications`
- `GET /jobs/applications/{app_id}`
- `PATCH /jobs/applications/{app_id}`
- `DELETE /jobs/applications/{app_id}`
- `POST /jobs/applications/batch`

**Extension & Automation:**
- `POST /jobs/extension/save-cookies`
- `POST /jobs/extension/connect`
- `POST /automation/start`
- `POST /automation/pause`
- `POST /automation/resume`
- `GET /automation/status`
- `GET /automation/logs`
- `GET /automation/extension/tokens`
- `DELETE /automation/extension/tokens/{token_id}`
- `GET /automation/stream`

**AI Tools:**
- `POST /ai/job-match`
- `POST /ai/resume-suggestions`
- `POST /ai/extract-text`

**Profile & Dashboard:**
- `PUT /profile/job-preferences`
- `PUT /profile/platform-accounts`
- `POST /profile/save-all`
- `GET /dashboard/recent-applications`
- `GET /dashboard/activity-feed`
- `GET /dashboard/stats-by-period`

**Auth:**
- `POST /auth/exchange-code`

*Recommendation:* These unused endpoints represent dead weight. We should either remove them to reduce the API surface area (improving security and maintainability) or verify if they are meant for future implementations or external integrations (e.g. mobile apps).

---

## 2. Backend Dead Code & Unused Variables

Static analysis using `vulture` and manual verification found the following unused variables and functions in the Python backend:

**Configuration (`config.py`):**
- `DEMO_MODE` and `DEMO_EMAIL`

**Dependencies (`dependencies.py`):**
- `get_current_active_user`
- `get_optional_user`

**Services (`services/`):**
- `admin_service.py`: Unused variable `active_users`
- `ai_service.py`: Unused functions `analyze_resume_standalone` and `rank_jobs`
- `automation_service.py`: Unused import `generate_extension_token`, unused function `extension_connect`, unused variable `device_name`
- `email_service.py`: Unused function `send_application_alert`
- `resume_service.py`: Unreachable code after `return text` in PDF processing logic.

**Utilities (`utils.py`):**
- Unused functions `generate_extension_token`, `paginate_params`, `paginate_response`, and `serialise_doc`.

**WebSockets (`websocket/`):**
- `events.py`: Multiple unused variables (`MATCH_SCORE`, `AUTOMATION_STARTED`, etc.)
- `handlers.py`: Unused function `handle_automation_progress`
- `manager.py`: Unused method `broadcast`
- `pubsub.py`: Multiple broadcast event functions (e.g., job events, skill gap alerts) that are defined but never dispatched.

*Recommendation:* Remove the dead code and unreachable code blocks. Doing so will make the codebase smaller, cleaner, and easier to navigate without affecting functionality.

---

## 3. Frontend Dead Code

Static analysis using `knip` revealed several unused React components, unused dependencies, and unnecessary exports.

**Unused Components:**
- `src/components/common/FloatingBackground.jsx`
- `src/components/common/OrDivider.jsx`
- `src/components/common/SkeletonLoader.jsx`
- `src/components/stats/StatsSection.jsx`
- `src/components/ui/GlassCard.jsx`
- `src/components/ui/PrimaryButton.jsx`
- `src/layouts/AdminLayout.jsx`
- `src/layouts/PublicLayout.jsx`

**Unused Dependency:**
- `pdfjs-dist` (Listed in `package.json` but not used in the source code).

**Unused Exports:**
- Default context exports in `AuthContext.jsx`, `ThemeContext.jsx`, `ToastContext.jsx` (these are accessed via custom hooks instead).
- `setExtensionId`, `getExtensionId`, and `initExtensionId` in `src/services/linkedinBridge.js`.

*Recommendation:* Delete the unused components and layouts. Uninstall `pdfjs-dist` from `package.json` to reduce the bundle size. Clean up the unused exports.

---

## 4. Overall Code Quality Recommendations

1. **Prune Unused Code:** Follow the findings in Sections 1-3 to aggressively remove endpoints, functions, components, and variables that serve no purpose.
2. **Type Hinting (Backend):** The FastAPI backend currently lacks comprehensive type hinting in several service modules. Adding `TypedDict` or Pydantic models for function arguments (rather than raw `dict`) would improve type safety.
3. **Dependency Optimization (Frontend):** Ensure that frontend dependencies (like `pdfjs-dist`) that are no longer used are uninstalled properly (`npm uninstall pdfjs-dist`) to avoid unnecessary footprint.
4. **Error Handling Check:** Ensure that all database queries and external service interactions (like LLM APIs) are properly wrapped in `try/except` blocks to prevent unexpected server crashes and properly format HTTP responses for the client.
5. **Security (Endpoints):** Ensure that any deprecated routes are removed, as leaving unused endpoints open can lead to security vulnerabilities if they lack proper validation or authentication scopes.

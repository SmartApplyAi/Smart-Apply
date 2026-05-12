# SmartApply — AI-Powered Job Application Automation `v2.0.0`

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)
![Python](https://img.shields.io/badge/python-3.10+-3776AB.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![NVIDIA NIM](https://img.shields.io/badge/NVIDIA_NIM-Llama_3.1_70B-76B900.svg)

**SmartApply** is an AI-powered job application automation platform. Users upload their resume, fill out a profile, and then the Chrome extension auto-applies to LinkedIn jobs using **NVIDIA NIM (Llama 3.1 70B)** for intelligent form answers and cover letters. The platform includes ATS resume analysis, skill gap detection, AI roadmap generation, mock interview preparation, application tracking dashboard, weekly summary emails, and engagement features for continuous career growth.

---

## Problem Statement

Job seekers waste hours manually applying to dozens of jobs — copy-pasting the same information, writing cover letters, and answering repetitive screening questions. After applying, they have no structured way to track progress, identify skill gaps, or prepare for interviews. The process is tedious, error-prone, and time-consuming.

## Solution

SmartApply automates the entire job application lifecycle:

1. **Upload & Profile** — Upload a resume (PDF), auto-extract data, build a rich profile
2. **Chrome Extension** — Auto-fills LinkedIn Easy Apply forms using AI
3. **AI Pre-Apply Gate** — Scores job-fit (0–100) before applying; skips low-match roles
4. **ATS Analyzer** — Provides detailed resume scoring against job descriptions
5. **Skill Gap & Roadmap** — Identifies missing skills and generates phased learning plans
6. **Interview Prep** — AI-powered mock interviews with real-time feedback & evaluation
7. **Engagement** — Application streak tracking, daily AI career tips, weekly review widget
8. **Dashboard** — Real-time analytics with WebSocket live updates
9. **Automated Emails** — Weekly digest with stats, streak, skill gaps via APScheduler

---

## Architecture

```
Webapp/
├── main.py                    # FastAPI entry point + lifespan handler
├── config.py                  # pydantic-settings environment config
├── database.py                # MongoDB (Motor) connection + index setup
├── storage.py                 # Cloudflare R2 (S3-compatible) client
├── dependencies.py            # JWT auth middleware + role checks
├── utils.py                   # JWT, Argon2/bcrypt, Fernet crypto, PII redaction
├── limiter.py                 # SlowAPI rate limiting configuration
├── redis_client.py            # Redis async client (token blacklist, pub/sub)
├── scheduler.py               # APScheduler — weekly digest + recurring jobs
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
├── Procfile                   # Render deployment config
├── render.yaml                # Render blueprint
│
├── routers/                   # API route definitions
│   ├── auth.py                #   /api/auth/* — signup, login, OAuth, JWT
│   ├── profile.py             #   /api/profile/* — profile CRUD
│   ├── resume.py              #   /api/resume/* — upload, parse, download
│   ├── jobs.py                #   /api/jobs/* — application tracking
│   ├── automation.py          #   /api/automation/* — session management
│   ├── dashboard.py           #   /api/dashboard/* — stats, streak, tips, review
│   ├── ai.py                  #   /api/ai/* — ATS, cover letter, screening, interview
│   ├── skillgap.py            #   /api/skillgap/* — skill analysis + roadmap
│   ├── admin.py               #   /api/admin/* — user/key/template management
│   ├── monitor.py             #   /api/monitor/* — health + metrics
│   ├── extension_auth.py      #   /api/extension-auth/* — extension pairing
│   ├── websocket_router.py    #   /api/ws/* — real-time WebSocket
│   └── notifications.py       #   /api/notifications/* — in-app alerts
│
├── services/                  # Business logic layer
│   ├── auth_service.py        #   Registration, login, token rotation, password reset
│   ├── profile_service.py     #   Profile CRUD, job prefs, encrypted platform creds
│   ├── resume_service.py      #   PDF parsing (PyPDF2 + pdfplumber), R2 storage
│   ├── jobs_service.py        #   Application tracking, stats aggregation
│   ├── automation_service.py  #   Extension session lifecycle, result reporting
│   ├── dashboard_service.py   #   Dashboard aggregation, charts data
│   ├── ai_service.py          #   NVIDIA NIM integration — all LLM features
│   ├── skillgap_service.py    #   Skill gap analysis + roadmap generation
│   ├── streak_service.py      #   Streak tracking, daily tips, weekly review
│   ├── email_service.py       #   Brevo transactional + weekly digest emails
│   ├── admin_service.py       #   Platform stats, user management
│   ├── monitor_service.py     #   Health checks, keep-alive, system metrics
│   ├── notification_service.py #  In-app notification CRUD
│   └── audit_service.py       #   Security audit logging
│
├── websocket/                 # Real-time communication
│   ├── manager.py             #   WebSocket connection manager
│   ├── pubsub.py              #   Redis Pub/Sub listener
│   └── events.py              #   Event type constants
│
├── middleware/                 # Request/response middleware
│
├── tests/                     # Pytest suite (50+ tests)
│
├── Extension/                 # Chrome Extension (Manifest V3)
│   ├── manifest.json          #   Extension manifest
│   ├── background/            #   Service worker
│   ├── content/               #   Content scripts (LinkedIn automation)
│   ├── popup/                 #   Extension popup UI
│   ├── shared/                #   Shared utilities
│   └── assets/                #   Icons and images
│
└── frontend-react/            # Vite + React 19 Frontend
    ├── src/
    │   ├── pages/             #   Dashboard, ATS, Interview, SkillGap, Profile, etc.
    │   ├── components/        #   Reusable UI components
    │   ├── layouts/           #   App layout with sidebar
    │   ├── auth/              #   AuthContext, authStore, refreshManager
    │   ├── websocket/         #   WebSocketProvider for real-time updates
    │   ├── services/          #   Axios API client with interceptors
    │   ├── index.css           #   Design system (light/dark tokens)
    │   └── App.jsx            #   Main app with React Router
    ├── public/                #   Static assets
    └── package.json           #   Frontend dependencies
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, FastAPI 0.115, Uvicorn, Gunicorn |
| **Database** | MongoDB Atlas (Motor async driver) |
| **Cache/Pub-Sub** | Redis (Upstash / local) — token blacklist, WebSocket pub/sub |
| **File Storage** | Cloudflare R2 (S3-compatible) — resume PDFs |
| **Email** | Brevo (Sendinblue) transactional API |
| **AI/LLM** | NVIDIA NIM — Meta Llama 3.1 70B Instruct |
| **Scheduling** | APScheduler (AsyncIOScheduler) — weekly digests |
| **Auth** | JWT (access + refresh), Argon2/bcrypt, Google OAuth 2.0 |
| **Encryption** | Fernet (cryptography) — platform credentials at rest |
| **Rate Limiting** | SlowAPI — per-endpoint rate limits |
| **Frontend** | React 19, Vite, Chart.js, React Router v6 |
| **Extension** | Chrome Extension (Manifest V3) — LinkedIn Easy Apply |
| **Real-time** | WebSocket + Redis Pub/Sub — live dashboard updates |
| **Deployment** | Render (single web service — backend serves React build) |

---

## Features

### Core Application Flow
- ✅ Email/password signup with 6-digit PIN verification
- ✅ Google OAuth login (one-click)
- ✅ JWT access + refresh token authentication with secure cookie rotation
- ✅ Resume PDF upload with auto-extraction (PyPDF2 + pdfplumber)
- ✅ Comprehensive profile editor (personal, professional, education, job preferences)
- ✅ Platform credentials stored with Fernet encryption at rest

### Chrome Extension — LinkedIn Automation
- ✅ Secure pairing via 6-character code
- ✅ Auto-fill LinkedIn Easy Apply forms using AI-generated answers
- ✅ AI pre-apply scoring gate — skips low-match jobs (< 65%)
- ✅ Real-time progress reporting back to dashboard
- ✅ Heartbeat monitoring for active sessions
- ✅ Extension session management (start/pause/resume/stop)

### AI Features (NVIDIA NIM — Llama 3.1 70B)
- ✅ **Screening Question Answering** — Individual and batch, supports all field types (text, number, dropdown, radio, date)
- ✅ **Cover Letter Generation** — Tailored to job title, company, and candidate profile
- ✅ **ATS Resume Analyzer** — Strict rubric-based scoring (0–100), section breakdown, keyword matching, actionable improvements
- ✅ **Job Match Scoring** — Resume vs. JD comparison with skill gap detection
- ✅ **Resume Improvement Suggestions** — AI-powered action items and power words
- ✅ **Mock Interview Prep** — 4 types (behavioral, technical, HR, custom) with real-time Q&A and final evaluation
- ✅ **Skill Roadmap Generation** — Phased 30/60/90-day learning plans with resources
- ✅ **Daily AI Career Tips** — Personalized daily tip generated and cached per user
- ✅ Multi-key rotation with blacklisting and exponential backoff
- ✅ PII redaction before all AI calls (email, phone, LinkedIn, GitHub, addresses)

### Dashboard & Analytics
- ✅ Real-time dashboard with WebSocket live updates
- ✅ Application statistics (total, applied, failed, skipped, success rate)
- ✅ Daily activity bar chart
- ✅ Application history with filters (Applied/Failed/Skipped) and search
- ✅ **Application streak tracking** — consecutive active days with 🔥 flame animation
- ✅ **Daily AI career tip** — dismissible card with category badge
- ✅ **Weekly review widget** — modal on first login of the week with stats summary

### Skill Gap & Learning
- ✅ Aggregate skill gap analysis from recent applications
- ✅ Matched vs. missing skills with frequency counts
- ✅ AI-generated learning roadmaps with phases, milestones, and resource links
- ✅ Real-time WebSocket notifications (ROADMAP_READY, SKILL_GAP_ALERT)

### Email & Notifications
- ✅ Email verification (6-digit PIN)
- ✅ Password reset emails
- ✅ Automation session summary emails (with top 3 matched jobs)
- ✅ High-match job failure alerts (≥ 80% score)
- ✅ **Weekly digest email** — applications, success rate, streak, skill gaps (APScheduler: Monday 9 AM UTC)
- ✅ In-app notification system with unread counts
- ✅ Admin broadcast emails

### Admin Panel
- ✅ Platform-wide statistics
- ✅ User management (list, activate/deactivate, role toggle, hard delete)
- ✅ NVIDIA NIM API key management with live testing
- ✅ Custom profile questions CRUD
- ✅ Email template editor (all template types)
- ✅ Broadcast email to all users
- ✅ Active automation session monitoring
- ✅ Security audit trail

### Security
- ✅ JWT access + refresh tokens with Argon2/bcrypt password hashing
- ✅ Token blacklisting via Redis (revocation on logout)
- ✅ Refresh token reuse detection — revokes all sessions on theft attempt
- ✅ Rate limiting on all API endpoints (SlowAPI) — auth, AI, dashboard, jobs, profile, resume, admin
- ✅ CORS configured for frontend + Chrome extension origins
- ✅ Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP)
- ✅ Request ID tracing on every request
- ✅ Fernet (AES) encryption for platform credentials at rest
- ✅ PII redaction before AI API calls
- ✅ Input validation on all endpoints via Pydantic
- ✅ Audit logging for sensitive actions
- ✅ Email verification requirement (configurable)

## Future Enhancements

The following features are currently implemented and ship with this release:
- ✅ Mock Interview Prep (services/ai_service.py — interview_chat)
- ✅ Skill Gap Analysis (services/skillgap_service.py)
- ✅ AI Learning Roadmap Generator (services/skillgap_service.py + frontend pages)
- ✅ Smart Pre-Apply Scoring Gate (Extension/background/service-worker.js — PRE_APPLY_SCORE)

Genuine next-phase features (not yet built):
- 🔜 Smart job ranking UI — surface best-match jobs in a ranked list with score badges
- 🔜 Recruiter analytics — track which companies viewed profiles vs responded
- 🔜 Multi-resume routing — automatically select the most relevant resume per job domain
- 🔜 Browser-native job board search — discover jobs from within the extension without navigating to LinkedIn
- 🔜 Funnel email drip — auto-follow-up emails when application status stalls at "Viewed"

---

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/SmartApplyAi/Smart-Apply.git
cd Smart-Apply
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# Install Frontend dependencies
cd frontend-react
npm install
cd ..
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required variables:**

| Variable | Description |
|---|---|
| `SECRET_KEY` | JWT signing key (generate a strong random string) |
| `MONGODB_URL` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name (default: `smartapply`) |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public URL |
| `BREVO_API_KEY` | Brevo transactional email API key |
| `BREVO_SENDER_EMAIL` | Sender email for Brevo |
| `NIM_API_KEYS` | Comma-separated NVIDIA NIM API keys |
| `FRONTEND_URL` | Frontend URL (default: `http://localhost:5173`) |
| `REDIS_URL` | Redis connection string (optional, for WebSockets + token revocation) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional) |

### 3. Run Locally

```bash
python main.py
```

Or with Uvicorn directly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API is at `http://localhost:8000/api/` and docs at `http://localhost:8000/api/docs`.

### 4. Build Frontend (for production)

```bash
cd frontend-react
npm run build
cd ..
```

The backend serves the compiled frontend from `frontend-react/dist`.

### 5. Run Tests

```bash
python -m pytest tests/ --ignore=tests/test_linkedin_parser.py -q
```

---

## API Endpoints

### Auth (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | Register new account |
| POST | `/auth/login` | Login, get JWT |
| POST | `/auth/verify` | Verify email (6-digit PIN) |
| POST | `/auth/resend-pin` | Resend verification code |
| POST | `/auth/logout` | Logout, revoke all tokens |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset with token |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/change-password` | Change password (authenticated) |
| GET | `/auth/me` | Get current user |
| GET | `/auth/google` | Google OAuth redirect |
| POST | `/auth/exchange-code` | Exchange Google auth code |
| POST | `/auth/verify-token` | Verify Google ID token |

### Profile (`/api/profile`)
| Method | Path | Description |
|---|---|---|
| GET | `/profile/me` | Get full profile (personal + job prefs + platforms) |
| PUT | `/profile/update` | Update personal/professional data |
| PUT | `/profile/job-preferences` | Update job search preferences |
| PUT | `/profile/platform-accounts` | Update platform credentials (encrypted) |
| POST | `/profile/save-all` | Atomic save of all profile sections |
| DELETE | `/profile/delete-account` | Delete all user data |

### Resume (`/api/resume`)
| Method | Path | Description |
|---|---|---|
| POST | `/resume/upload` | Upload + parse PDF resume |
| GET | `/resume/list` | List all uploaded resumes |
| GET | `/resume/download/{key}` | Download resume file |
| GET | `/resume/view/{key}` | Stream PDF for preview |
| DELETE | `/resume/{key}` | Delete resume |
| PUT | `/resume/{id}/activate` | Set as active resume |

### AI (`/api/ai`)
| Method | Path | Description |
|---|---|---|
| POST | `/ai/answer-question` | AI Q&A with context |
| POST | `/ai/answer-screening-question` | Answer single screening question |
| POST | `/ai/answer-screening-batch` | Batch answer screening questions |
| POST | `/ai/cover-letter` | Generate tailored cover letter |
| POST | `/ai/ats-analyze` | Full ATS resume analysis |
| POST | `/ai/ats-analyze-upload` | ATS analysis from uploaded PDF |
| POST | `/ai/job-match` | Job matching & ranking |
| POST | `/ai/resume-suggestions` | Resume improvement suggestions |
| POST | `/ai/interview-chat` | Mock interview conversation |
| POST | `/ai/pre-apply-score` | Pre-apply fit scoring (extension gate) |

### Skill Gap (`/api/skillgap`)
| Method | Path | Description |
|---|---|---|
| GET | `/skillgap/analysis` | Aggregate skill gap analysis |
| POST | `/skillgap/roadmap` | Generate AI learning roadmap |
| GET | `/skillgap/roadmaps` | List saved roadmaps |
| GET | `/skillgap/roadmaps/{id}` | Get specific roadmap |

### Dashboard (`/api/dashboard`)
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/summary` | Full dashboard summary |
| GET | `/dashboard/recent-applications` | Recent applications |
| GET | `/dashboard/activity-feed` | Activity feed |
| GET | `/dashboard/stats-by-period` | Graph-ready stats (day/week/month) |
| GET | `/dashboard/streak` | Application streak tracking |
| GET | `/dashboard/daily-tip` | AI-generated daily career tip |
| GET | `/dashboard/weekly-review` | Weekly review stats widget |
| POST | `/dashboard/weekly-review/seen` | Mark weekly review as dismissed |

### Jobs (`/api/jobs`)
| Method | Path | Description |
|---|---|---|
| GET | `/jobs/stats` | Application statistics |
| GET | `/jobs/history` | Paginated history with filters |
| GET | `/jobs/recent` | Recent applications |
| POST | `/jobs/applications` | Create application record |
| GET | `/jobs/applications/{id}` | Get application details |
| PATCH | `/jobs/applications/{id}` | Update application |
| DELETE | `/jobs/applications/{id}` | Delete application |
| POST | `/jobs/applications/batch` | Batch create applications |

### Automation (`/api/automation`)
| Method | Path | Description |
|---|---|---|
| POST | `/automation/start` | Start automation session |
| POST | `/automation/pause` | Pause session |
| POST | `/automation/resume` | Resume session |
| POST | `/automation/stop` | Stop session (triggers summary email) |
| GET | `/automation/status` | Get session status |
| GET | `/automation/logs` | Get session logs |

### Extension (`/api/jobs/extension`)
| Method | Path | Description |
|---|---|---|
| POST | `/jobs/extension/connect` | Connect extension with pairing code |
| POST | `/jobs/extension/heartbeat` | Extension heartbeat ping |
| POST | `/jobs/extension/report-step` | Report automation step |
| POST | `/jobs/extension/report-result` | Report application result |
| GET | `/jobs/extension/download` | Download user resume for extension |

### Extension Auth (`/api/extension-auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/extension-auth/login` | Native extension login |
| POST | `/extension-auth/refresh` | Refresh extension token |
| GET | `/extension-auth/me` | Get extension user context |

### Admin (`/api/admin`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Platform-wide statistics |
| GET | `/admin/users` | List and manage users |
| PATCH | `/admin/users/{id}` | Update user status/role |
| DELETE | `/admin/users/{id}` | Hard delete user |
| POST | `/admin/broadcast` | Send broadcast email to all users |
| GET | `/admin/sessions` | Monitor active automation sessions |
| GET | `/admin/keys` | Get NVIDIA NIM API keys (masked) |
| PUT | `/admin/keys` | Update NVIDIA NIM API keys |
| POST | `/admin/nim-test` | Test NIM API connectivity |
| GET | `/admin/email-templates` | Get email templates |
| PUT | `/admin/email-templates` | Update email template |
| GET | `/admin/questions` | Get custom profile questions |
| POST | `/admin/questions` | Create custom question |
| PUT | `/admin/questions/{id}` | Update custom question |
| DELETE | `/admin/questions/{id}` | Delete custom question |
| GET | `/admin/audit-logs` | Security audit trail |

### Notifications (`/api/notifications`)
| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List notifications |
| PATCH | `/notifications/{id}/read` | Mark as read |
| PATCH | `/notifications/read-all` | Mark all as read |
| DELETE | `/notifications/{id}` | Delete notification |
| GET | `/notifications/unread-count` | Get unread count |

### Monitoring (`/api/monitor`)
| Method | Path | Description |
|---|---|---|
| GET | `/monitor/health` | System health status |
| GET | `/monitor/metrics` | Performance metrics |
| GET | `/monitor/db-status` | Database connection status |

### WebSocket (`/api/ws`)
| Protocol | Path | Description |
|---|---|---|
| WS | `/ws/{user_id}` | Real-time dashboard updates |

**WebSocket Event Types:**
- `BOT_PROGRESS` — Live automation progress counter
- `MATCH_SCORE` — Real-time job match score
- `SESSION_STARTED` / `SESSION_STOPPED` — Automation lifecycle
- `ROADMAP_READY` — Skill roadmap generation complete
- `SKILL_GAP_ALERT` — New skill gap detected
- `SESSION_REVOKED` — Force disconnect on token theft

---

## Scheduled Jobs (APScheduler)

| Job | Schedule | Description |
|---|---|---|
| **Weekly Digest** | Monday 9:00 AM UTC | Sends personalized weekly summary email to all active verified users with applications count, success rate, streak, and top skill gaps |

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | User accounts (email, password hash, role, verification status) |
| `user_profiles` | Personal/professional profiles |
| `job_preferences` | Job search preferences (keywords, location, filters) |
| `platform_accounts` | Encrypted platform credentials (LinkedIn) |
| `refresh_tokens` | JWT refresh tokens with revocation tracking |
| `email_verification_tokens` | 6-digit verification PINs |
| `password_reset_tokens` | Password reset tokens |
| `resumes` | Resume metadata + parsed text + R2 object keys |
| `job_applications` | Application tracking (result, match score, skills) |
| `automation_sessions` | Automation session state and lifecycle |
| `automation_logs` | Step-by-step automation logs |
| `extension_tokens` | Chrome extension auth tokens |
| `extension_sessions` | Extension session tracking |
| `skill_roadmaps` | Generated learning roadmaps |
| `daily_tips` | Cached daily AI career tips (per user per day) |
| `weekly_review_seen` | Weekly review widget dismissal tracking |
| `notifications` | In-app notifications |
| `audit_logs` | Security audit trail |
| `email_templates` | Admin-customizable email templates |
| `custom_questions` | Admin-defined profile questions |

---

## Deployment on Render

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Set **Build Command**:
   ```
   cd frontend-react && npm install && npm run build && cd .. && pip install -r requirements.txt
   ```
4. Set **Start Command**:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Add all environment variables from `.env`
6. Deploy — both frontend and backend are served from the same service

### Production Checklist
- Set `DEBUG=False` and `is_production=True`
- Set `REQUIRE_EMAIL_VERIFICATION=True`
- Configure `REDIS_URL` for WebSockets and token revocation
- Set `RENDER_EXTERNAL_URL` for keep-alive pings
- Ensure `NIM_API_KEYS` has multiple keys for rotation

---

## Chrome Extension

The Chrome Extension (`Extension/` directory) is a Manifest V3 extension that:

1. **Pairs** with the user's SmartApply account via a 6-character code
2. **Navigates** LinkedIn job search results based on user preferences
3. **Extracts** job descriptions from LinkedIn pages
4. **Scores** each job via the AI pre-apply gate (≥65% threshold)
5. **Auto-fills** Easy Apply forms using AI-generated answers
6. **Reports** results back to the dashboard in real-time

### Installing the Extension
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `Extension/` directory

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Security Layers                       │
├─────────────────────────────────────────────────────────┤
│ 1. Rate Limiting (SlowAPI)         — per-endpoint       │
│ 2. CORS + Security Headers         — HSTS, CSP, X-Frame │
│ 3. JWT Verification                — access + refresh    │
│ 4. Redis Token Blacklist           — instant revocation  │
│ 5. Refresh Token Reuse Detection   — theft protection    │
│ 6. Argon2 Password Hashing         — bcrypt fallback     │
│ 7. Fernet Encryption               — credentials at rest │
│ 8. PII Redaction                   — before AI calls     │
│ 9. Input Validation (Pydantic)     — all endpoints       │
│ 10. Audit Logging                  — sensitive actions    │
│ 11. Request ID Tracing             — every request       │
└─────────────────────────────────────────────────────────┘
```

---

## License

This project is for educational and portfolio purposes.

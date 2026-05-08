# SmartApply — AI-Assisted Job Application Automation `v1.1.0`

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)


Full-stack application with a **Python FastAPI** backend and **React (Vite)** frontend, deployable as a single Render web service.

## Architecture

```
Webapp/
├── main.py                 # FastAPI entry point
├── config.py               # Environment configuration
├── database.py             # MongoDB (Motor) connection
├── storage.py              # Cloudflare R2 (S3) client
├── dependencies.py         # Auth middleware & DI
├── utils.py                # JWT, bcrypt, crypto, helpers
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables (not committed)
├── .env.example            # Template for .env
├── routers/                # API route definitions
│   ├── auth.py             #   /api/auth/*
│   ├── profile.py          #   /api/profile/*
│   ├── resume.py           #   /api/resume/*
│   ├── jobs.py             #   /api/jobs/*
│   ├── automation.py       #   /api/automation/*
│   ├── dashboard.py        #   /api/dashboard/*
│   ├── ai.py               #   /api/ai/*
│   └── notifications.py    #   /api/notifications/*
├── services/               # Business logic
│   ├── auth_service.py     #   Registration, login, tokens, reset
│   ├── profile_service.py  #   Profile CRUD, job prefs, platforms
│   ├── resume_service.py   #   Upload, parse, R2 storage
│   ├── jobs_service.py     #   Application tracking, stats
│   ├── automation_service.py   Session mgmt, extension auth
│   ├── dashboard_service.py    Aggregated dashboard data
│   ├── ai_service.py       #   NVIDIA NIM: ATS, cover letter, AI
│   ├── email_service.py    #   Brevo transactional emails
│   ├── notification_service.py In-app notifications
│   └── audit_service.py    #   Security audit logging
└── frontend-react/         # Vite + React Frontend
    ├── src/
    │   ├── components/     #   Reusable UI components
    │   ├── pages/          #   Page-level components
    │   ├── layouts/        #   Shared page layouts
    │   ├── context/        #   Auth & Global state
    │   ├── services/       #   API client services
    │   ├── styles/         #   Global & component-specific CSS
    │   └── App.jsx         #   Main application & routing
    ├── public/             #   Static assets
    └── package.json        #   Frontend dependencies
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn |
| **Database** | MongoDB Atlas (Motor async driver) |
| **File Storage** | Cloudflare R2 (S3-compatible) |
| **Email** | Brevo (Sendinblue) transactional API |
| **AI** | NVIDIA NIM (Llama 3.1 70B) |
| **Auth** | JWT (access + refresh tokens), bcrypt |
| **Frontend** | React 19, Vite, Chart.js, React Router |

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd Webapp
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt

# 2. Install Frontend dependencies
cd frontend-react
npm install
cd ..
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:

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

### 3. Run locally

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

The backend is configured to serve the compiled frontend from `frontend-react/dist`.

## API Endpoints

### Auth (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | Register new account |
| POST | `/auth/login` | Login, get JWT |
| POST | `/auth/verify` | Verify email (6-digit PIN) |
| POST | `/auth/resend-pin` | Resend verification code |
| POST | `/auth/logout` | Logout, revoke tokens |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset with token |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/change-password` | Change password (auth) |
| GET | `/auth/me` | Get current user |
| GET | `/auth/google` | Google OAuth redirect |
| POST | `/auth/exchange-code` | Exchange Google code |

### Profile (`/api/profile`)
| Method | Path | Description |
|---|---|---|
| GET | `/profile/me` | Get full profile |
| PUT | `/profile/update` | Update personal/professional data |
| PUT | `/profile/job-preferences` | Update job search preferences |
| PUT | `/profile/platform-accounts` | Update platform credentials |

### Resume (`/api/resume`)
| Method | Path | Description |
|---|---|---|
| POST | `/resume/upload` | Upload + parse PDF resume |
| GET | `/resume/list` | List all resumes |
| GET | `/resume/download/{key}` | Download resume |
| GET | `/resume/view/{key}` | Stream PDF for preview |
| DELETE | `/resume/{key}` | Delete resume |
| PUT | `/resume/{id}/activate` | Set active resume |

### Jobs (`/api/jobs`)
| Method | Path | Description |
|---|---|---|
| GET | `/jobs/stats` | Application statistics |
| GET | `/jobs/history` | Paginated history |
| GET | `/jobs/recent` | Recent applications |
| POST | `/jobs/applications` | Create application |
| GET | `/jobs/applications/{id}` | Get application |
| PATCH | `/jobs/applications/{id}` | Update application |
| DELETE | `/jobs/applications/{id}` | Delete application |
| POST | `/jobs/applications/batch` | Batch create |

### Automation (`/api/automation`)
| Method | Path | Description |
|---|---|---|
| POST | `/automation/start` | Start session |
| POST | `/automation/pause` | Pause session |
| POST | `/automation/resume` | Resume session |
| POST | `/automation/stop` | Stop session |
| GET | `/automation/status` | Get session status |
| GET | `/automation/logs` | Get session logs |

### Extension (`/api/jobs/extension`)
| Method | Path | Description |
|---|---|---|
| POST | `/jobs/extension/connect` | Connect extension |
| POST | `/jobs/extension/heartbeat` | Heartbeat |
| POST | `/jobs/extension/report-step` | Report step |
| POST | `/jobs/extension/report-result` | Report result |

### Dashboard (`/api/dashboard`)
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/summary` | Full dashboard summary |
| GET | `/dashboard/recent-applications` | Recent apps |
| GET | `/dashboard/activity-feed` | Activity feed |
| GET | `/dashboard/stats-by-period` | Graph data |

### AI (`/api/ai`)
| Method | Path | Description |
|---|---|---|
| POST | `/ai/answer-question` | AI Q&A with context |
| POST | `/ai/cover-letter` | Generate cover letter |
| POST | `/ai/ats-analyze` | Full ATS analysis |
| POST | `/ai/linkedin-optimize` | LinkedIn optimization |
| POST | `/ai/job-match` | Job matching |
| POST | `/ai/resume-suggestions` | Resume improvements |

### Notifications (`/api/notifications`)
| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List notifications |
| PATCH | `/notifications/{id}/read` | Mark read |
| PATCH | `/notifications/read-all` | Mark all read |
| DELETE | `/notifications/{id}` | Delete |
| GET | `/notifications/unread-count` | Unread count |

## Deployment on Render

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Set **Build Command**: `cd frontend-react && npm install && npm run build && cd .. && pip install -r requirements.txt`
4. Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add all environment variables from `.env`
6. Deploy — both frontend and backend will be served from the same service

## Security

- JWT access + refresh tokens with bcrypt password hashing
- Rate limiting on auth endpoints
- CORS configured for frontend origin
- Security headers (X-Content-Type-Options, X-Frame-Options, HSTS)
- Request ID tracing for every request
- Audit logging for sensitive actions
- Platform passwords AES-encrypted at rest
- Input validation on all endpoints via Pydantic

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | User accounts |
| `user_profiles` | Personal/professional profiles |
| `job_preferences` | Job search preferences |
| `platform_accounts` | Encrypted platform credentials |
| `refresh_tokens` | JWT refresh tokens |
| `email_verification_tokens` | 6-digit verification PINs |
| `password_reset_tokens` | Password reset tokens |
| `resumes` | Resume metadata + parsed data |
| `job_applications` | Application tracking |
| `automation_sessions` | Automation session state |
| `automation_logs` | Step-by-step automation logs |
| `extension_tokens` | Browser extension auth tokens |
| `notifications` | In-app notifications |
| `audit_logs` | Security audit trail |

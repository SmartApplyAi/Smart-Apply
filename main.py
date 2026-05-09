import sys
import os
import uuid
import time
import asyncio
import re

# Create logs directory if it doesn't exist
os.makedirs("logs", exist_ok=True)

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from slowapi.errors import RateLimitExceeded
from limiter import limiter

from loguru import logger
from config import settings
from database import connect_db, close_db
from redis_client import init_redis, close_redis
from dependencies import get_current_user

# ── Logging setup ────────────────────────────────────────────────────────────
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <7}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level="DEBUG" if settings.DEBUG else "INFO",
    colorize=True,
)
logger.add(
    "logs/smartapply.log",
    rotation="10 MB",
    retention="30 days",
    compression="zip",
    level="INFO",
)


# ── Rate Limiter ─────────────────────────────────────────────────────────────
# limiter instance imported from limiter.py


# ── Lifecycle ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info(f"Starting {settings.APP_NAME} backend ({settings.APP_ENV})")
    await connect_db()
    await init_redis()
    
    # Start keep-alive scheduler
    from services.monitor_service import MonitorService
    asyncio.create_task(MonitorService.keep_alive_task())
    
    # Start Redis Pub/Sub listener for WebSockets if Redis is available
    from redis_client import get_redis
    if get_redis() is not None:
        from websocket.pubsub import start_pubsub_listener
        pubsub_task = asyncio.create_task(start_pubsub_listener())
    else:
        logger.warning("Redis is not available, skipping Pub/Sub listener startup.")

    # Verify R2 Credentials
    if not settings.R2_ACCOUNT_ID or not settings.R2_ACCESS_KEY_ID or not settings.R2_SECRET_ACCESS_KEY:
        logger.warning("Cloudflare R2 credentials missing. File uploads will fail.")
    
    logger.info("All systems ready ✓")
    yield
    await close_redis()
    await close_db()
    logger.info("Shutdown complete.")


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description="AI-assisted job application automation platform",
    version="1.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
)

app.state.limiter = limiter
from slowapi import _rate_limit_exceeded_handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "chrome-extension://" + settings.CHROME_EXTENSION_ID if settings.CHROME_EXTENSION_ID else "chrome-extension://*",
    ] + (["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"] if not settings.is_production else []),
    allow_credentials=True,
)


# ── Request ID + Timing Middleware ───────────────────────────────────────────
class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        start = time.time()

        response = await call_next(request)

        duration_ms = round((time.time() - start) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        # Don't log static file requests or health checks
        path = request.url.path
        if not path.startswith("/assets") and path != "/api/health" and not re.search(r"\.[a-z0-9]{2,5}$", path.lower()):
            logger.debug(
                f"[{request_id}] {request.method} {path} → {response.status_code} ({duration_ms}ms)"
            )

        return response


app.add_middleware(RequestContextMiddleware)


# ── Security Headers Middleware ──────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # CSP Configuration (tightened for Production)
        # Note: We must allow connect-src to self, wss to self, and extension origins for SmartApply functionality.
        # We allow cdnjs.cloudflare.com for Font Awesome and fonts.googleapis.com / fonts.gstatic.com for Google Fonts.
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "  # Needed for React
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            "img-src 'self' data: https:; "
            "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
            "connect-src 'self' ws: wss: chrome-extension:; "
            "frame-ancestors 'none';"
        )
        response.headers["Content-Security-Policy"] = csp

        if settings.is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

from middleware.admin_middleware import AdminAuditMiddleware
app.add_middleware(AdminAuditMiddleware)


# ── Global Error Handler ────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", "???")
    logger.error(f"[{rid}] Unhandled error: {exc}")

    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ── Register Routers ────────────────────────────────────────────────────────
from routers import auth, profile, resume, jobs, automation, dashboard, ai, notifications, profile_linkedin, websocket_router, extension_auth

app.include_router(auth.router, prefix="/api")
app.include_router(extension_auth.router, prefix="/api")
app.include_router(websocket_router.router)
app.include_router(profile.router, prefix="/api")
app.include_router(resume.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(automation.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(profile_linkedin.router, prefix="/api")

# Monitoring
from routers import monitor, admin
app.include_router(monitor.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
    }


@app.get("/api/config/extension")
async def get_extension_config(user: dict = Depends(get_current_user)):
    """Return the extension ID from environment variables."""
    logger.info(f"User {user['email']} requested extension config")
    return {"extension_id": settings.CHROME_EXTENSION_ID}



# ── Serve React Frontend Static Files ────────────────────────────────────────
# In production, serve the React build from frontend-react/dist
frontend_dir = os.path.join(os.path.dirname(__file__), "frontend-react", "dist")

if os.path.isdir(frontend_dir):
    # Mount the Vite assets directory
    assets_dir = os.path.join(frontend_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], include_in_schema=False)
    async def catch_all(request: Request, full_path: str):
        """SPA fallback for all non-API paths."""
        if full_path.lower().startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": f"API endpoint /{full_path} not found"})
        
        # If it looks like a file (has an extension) and wasn't found in mounted assets, 404
        if re.search(r"\.[a-z0-9]{2,5}$", full_path.lower()):
             # Check if it exists in dist root (e.g. favicon.ico)
             root_file = os.path.join(frontend_dir, full_path)
             if os.path.isfile(root_file):
                 return FileResponse(root_file)
             return Response(status_code=404)
             
        # Otherwise, serve index.html for SPA routing
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    logger.info(f"Serving React frontend from: {frontend_dir}")
else:
    logger.warning(f"React build directory not found at {frontend_dir} — API-only mode. Run 'npm run build' in frontend-react.")


# ── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )

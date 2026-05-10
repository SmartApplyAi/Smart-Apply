"""
SmartApply Backend Configuration
Loads all settings from environment variables via pydantic-settings.
"""

import os
import secrets
import asyncio
from typing import List, Optional
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import PrivateAttr

# Resolve the .env file – check backend dir first, then project root
_backend_dir = Path(__file__).resolve().parent
_env_candidates = [_backend_dir / ".env", _backend_dir.parent / ".env"]
_env_file = next((p for p in _env_candidates if p.exists()), _backend_dir / ".env")


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────
    APP_NAME: str = "SmartApply"
    APP_ENV: str = "development"
    DEBUG: bool = True
    DEMO_MODE: bool = False
    DEMO_EMAIL: str = "demo@smartapply.ai"

    # ── Security ──────────────────────────────────────
    SECRET_KEY: str = os.environ.get("SECRET_KEY", secrets.token_urlsafe(64))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # ── MongoDB ───────────────────────────────────────
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "smartapply"

    # ── Cloudflare R2 ────────────────────────────────
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "smart-apply"
    R2_PUBLIC_URL: str = ""

    # ── Brevo ─────────────────────────────────────────
    BREVO_API_KEY: str = ""
    BREVO_SENDER_EMAIL: str = "noreply@smartapply.ai"
    BREVO_SENDER_NAME: str = "SmartApply"

    # ── NVIDIA NIM ────────────────────────────────────
    NIM_API_KEYS: str = ""

    # ── Frontend ──────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:5173"

    # In development (DEBUG=True), default to False to ease setup.
    # In production, this should be True.
    REQUIRE_EMAIL_VERIFICATION: bool = True

    # ── Google OAuth ──────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ── Extension ─────────────────────────────────────
    CHROME_EXTENSION_ID: str = ""

    # ── Redis ─────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    _nim_keys_cache: Optional[List[str]] = PrivateAttr(default=None)

    # ── Render & Monitoring ───────────────────────────
    RENDER_EXTERNAL_URL: Optional[str] = None
    APP_BASE_URL: Optional[str] = None
    KEEP_ALIVE_INTERVAL: int = 10  # minutes

    # Lock for NIM API keys cache to prevent race conditions during refresh
    _nim_lock: Optional[asyncio.Lock] = PrivateAttr(default=None)

    def _get_nim_lock(self) -> asyncio.Lock:
        if self._nim_lock is None:
             self._nim_lock = asyncio.Lock()
        return self._nim_lock

    async def reset_nim_cache(self):
        """Reset the cached NIM API keys (thread-safe)."""
        async with self._get_nim_lock():
            self._nim_keys_cache = None

    async def get_nim_api_key_list(self) -> List[str]:
        """Parse comma-separated NIM API keys into a list (cached, thread-safe)."""
        async with self._get_nim_lock():
            if self._nim_keys_cache is None:
                self._nim_keys_cache = [k.strip() for k in self.NIM_API_KEYS.split(",") if k.strip()]
            return self._nim_keys_cache

    @property
    def r2_endpoint_url(self) -> str:
        return f"https://{self.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    model_config = {
        "env_file": str(_env_file),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        "populate_by_name": True,
    }


# Singleton
settings = Settings()

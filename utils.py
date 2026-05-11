"""
Utility helpers: JWT creation, password hashing, crypto.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
import passlib.exc
from config import settings
import hashlib
import secrets
import random
import re

# Fix for passlib + bcrypt 4.x incompatibility
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class About:
        __version__ = bcrypt.__version__
    bcrypt.__about__ = About()

# ── Password hashing ────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, passlib.exc.UnknownHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return pwd_context.needs_update(hashed)
    except Exception:
        return True # If it can't be identified, it definitely needs a rehash (upon next successful login)


# ── JWT Tokens ───────────────────────────────────────────────────────────────
def create_access_token(
    data: dict, expires_delta: Optional[timedelta] = None
) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access", "aud": settings.APP_NAME})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode.update({"exp": expire, "type": "refresh", "aud": settings.APP_NAME})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_extension_token(data: dict, expires_delta=None) -> str:
    """Create a JWT for extension sessions. Preserves type='extension'."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=30))
    to_encode["exp"] = expire
    to_encode["aud"] = settings.APP_NAME  # consistent with other tokens
    if "type" not in to_encode:
        to_encode["type"] = "extension"
    # Do NOT overwrite type — this is intentional
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT. Accepts tokens with or without audience (grace period)."""
    try:
        # New tokens: verify audience
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=settings.APP_NAME,
            options={"verify_exp": True, "verify_aud": True}
        )
    except JWTError:
        try:
            # Grace period: accept pre-backend5 tokens without aud claim
            return jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": True, "verify_aud": False}
            )
        except JWTError:
            return None


# ── Verification PIN ────────────────────────────────────────────────────────
def generate_pin(length: int = 6) -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(length))


# ── Reset token ─────────────────────────────────────────────────────────────
def generate_reset_token() -> str:
    return secrets.token_urlsafe(48)


from cryptography.fernet import Fernet
import base64

def _get_fernet():
    # Derive a 32-byte key from the SECRET_KEY for Fernet
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_value(value: str) -> str:
    """Robust encryption for platform credentials using Fernet."""
    if not value:
        return ""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_value(enc: str) -> str:
    """Decrypt a value encrypted with Fernet."""
    if not enc:
        return ""
    try:
        return _get_fernet().decrypt(enc.encode()).decode()
    except Exception:
        # Fallback for old XOR-encrypted values or invalid data
        return ""


def redact_pii(text: str) -> str:
    """Redact sensitive PII like emails and phone numbers from text before sending to AI."""
    if not text:
        return text
    
    # Redact Emails
    text = re.sub(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b", "[EMAIL_REDACTED]", text)
    
    # Redact Phone Numbers
    text = re.sub(
        r"\b(?:\+\d{1,3}[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}\b", 
        "[PHONE_REDACTED]", 
        text
    )
    
    # Redact Social/Profile Links
    text = re.sub(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-]+/?", "[LINKEDIN_REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(r"(?:https?://)?(?:www\.)?github\.com/[\w\-]+/?", "[GITHUB_REDACTED]", text, flags=re.IGNORECASE)

    # Redact common Address patterns (basic)
    text = re.sub(r"\d+\s+[A-Z][a-zA-Z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Way)\b", "[ADDRESS_REDACTED]", text, flags=re.IGNORECASE)

    # Redact Birthdates / sensitive dates (heuristic)
    text = re.sub(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", "[DATE_REDACTED]", text)
    text = re.sub(r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b", "[DATE_REDACTED]", text, flags=re.IGNORECASE)
    
    return text

"""
Utility helpers: JWT creation, password hashing, crypto, pagination.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
import passlib.exc
from config import settings
import hashlib
import hmac
import secrets
import random
import math

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
    return pwd_context.needs_update(hashed)


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


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token. Explicitly checks expiry and audience."""
    try:
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM],
            audience=settings.APP_NAME,
            options={"verify_exp": True, "verify_aud": True}
        )
        return payload
    except JWTError:
        return None


# ── Verification PIN ────────────────────────────────────────────────────────
def generate_pin(length: int = 6) -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(length))


# ── Reset token ─────────────────────────────────────────────────────────────
def generate_reset_token() -> str:
    return secrets.token_urlsafe(48)


# ── Extension tokens ────────────────────────────────────────────────────────
def generate_extension_token() -> str:
    return secrets.token_urlsafe(64)


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


# ── Pagination ──────────────────────────────────────────────────────────────
def paginate_params(skip: int = 0, limit: int = 20) -> dict:
    limit = min(max(limit, 1), 100)
    skip = max(skip, 0)
    return {"skip": skip, "limit": limit}


def paginate_response(items: list, total: int, skip: int, limit: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1 if limit else 1,
        "pages": math.ceil(total / limit) if limit else 1,
        "has_next": (skip + limit) < total,
        "has_prev": skip > 0,
    }


# ── MongoDB ObjectId serialiser ──────────────────────────────────────────────
def serialise_doc(doc: dict) -> dict:
    """Convert MongoDB document for JSON serialisation."""
    if doc is None:
        return {}
    result = {}
    for key, value in doc.items():
        if key == "_id":
            result["id"] = str(value)
        elif hasattr(value, "isoformat"):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result

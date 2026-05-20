"""
FastAPI dependencies: JWT authentication, current-user extraction, role checks.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from database import get_db
from config import settings
from bson import ObjectId

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """Extract and validate the JWT from the Authorization header.
    Returns the full user document from MongoDB.
    """
    token = None

    # 1. Try Authorization header
    if credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=settings.APP_NAME,
            options={"verify_aud": True}
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        # Verify token type
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        # Check if token is blacklisted in Redis
        from redis_client import get_redis
        import hashlib
        from loguru import logger

        redis_client = get_redis()
        if redis_client:
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            is_revoked = await redis_client.exists(f"revoked:token:{token_hash}")
            if is_revoked:
                raise HTTPException(status_code=401, detail="Token has been revoked")
        else:
            # Degraded mode: we skip the revocation check if Redis is unavailable.
            logger.warning("SECURITY WARNING: Redis unavailable, skipping token revocation check.")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Fetch user from DB
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Extension: Allow extension routes even if email not verified (to allow setup and automation)
    # These routes often use their own extension tokens anyway.
    extension_routes = [
        "/api/jobs/extension/connect",
        "/api/jobs/extension/heartbeat",
        "/api/jobs/extension/report-step",
        "/api/jobs/extension/report-result",
        "/api/jobs/extension/download"
    ]
    is_extension_route = request.url.path in extension_routes
    
    if settings.REQUIRE_EMAIL_VERIFICATION and not user.get("email_verified", False) and not is_extension_route:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required",
        )

    # Attach string ID for convenience
    user["id"] = str(user["_id"])
    return user


async def get_current_user_flexible(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """Extract and validate a JWT from the Authorization header.
    Accepts both 'access' and 'extension' token types, so that extension
    clients can call user-scoped endpoints like resume streaming.
    """
    token = None

    if credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db_ref = get_db()

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=settings.APP_NAME,
            options={"verify_aud": True}
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        token_type = payload.get("type")
        if token_type not in ("access", "extension"):
            raise HTTPException(status_code=401, detail="Invalid token type")

        # For access tokens, verify against Redis blacklist
        if token_type == "access":
            from redis_client import get_redis
            import hashlib
            from loguru import logger as _logger

            redis_client = get_redis()
            if redis_client:
                token_hash = hashlib.sha256(token.encode()).hexdigest()
                is_revoked = await redis_client.exists(f"revoked:token:{token_hash}")
                if is_revoked:
                    raise HTTPException(status_code=401, detail="Token has been revoked")
            else:
                _logger.warning("SECURITY WARNING: Redis unavailable, skipping token revocation check.")

        # For extension tokens, verify the session is still active
        if token_type == "extension":
            import hashlib as _hashlib
            token_hash = _hashlib.sha256(token.encode()).hexdigest()
            session = await db_ref.extension_sessions.find_one({
                "user_id": user_id,
                "token_hash": token_hash,
                "is_active": True
            })
            if not session:
                raise HTTPException(status_code=401, detail="Extension session revoked")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Fetch user from DB
    user = await db_ref.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")

    user["id"] = str(user["_id"])
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

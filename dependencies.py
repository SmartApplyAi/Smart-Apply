"""
FastAPI dependencies: JWT authentication, current-user extraction, role checks.
"""

from datetime import datetime, timezone
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

    # 2. Fallback: cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        # Verify token type
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        # Check if token is blacklisted
        db = get_db()
        blacklisted = await db.blacklisted_tokens.find_one({"token": token})
        if blacklisted:
            raise HTTPException(status_code=401, detail="Token has been revoked")
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


async def get_current_active_user(user: dict = Depends(get_current_user)) -> dict:
    """Alias that also confirms the user is active."""
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> Optional[dict]:
    """Dependency for routes that work with or without auth."""
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None

"""
Auth API routes.
Matches the frontend expectations at /api/auth/*.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from services import auth_service
from services.audit_service import log_action
from dependencies import get_current_user
from fastapi import Depends
from limiter import limiter
from loguru import logger

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Request Models ──────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class VerifyRequest(BaseModel):
    email: EmailStr
    pin: str = Field(..., min_length=6, max_length=6)


class ResendPinRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class ExchangeCodeRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/signup")
@limiter.limit("5/minute")
async def signup(body: SignupRequest, request: Request):
    """Register a new user account."""
    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    try:
        result = await auth_service.register_user(body.email, body.password)
        await log_action("anonymous", "signup", "auth", ip_address=_get_ip(request))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
@limiter.limit("10/minute")
async def login(body: LoginRequest, request: Request, response: Response):
    """Authenticate and return tokens."""
    try:
        result = await auth_service.login_user(
            body.email, body.password, ip=_get_ip(request)
        )
        await log_action(
            result["user"]["id"], "login", "auth", ip_address=_get_ip(request)
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/verify")
@limiter.limit("5/minute")
async def verify_email(body: VerifyRequest, request: Request):
    """Verify email with 6-digit PIN."""
    try:
        return await auth_service.verify_email(body.email, body.pin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/resend-pin")
@limiter.limit("3/minute")
async def resend_pin(body: ResendPinRequest, request: Request):
    """Resend verification PIN."""
    try:
        return await auth_service.resend_pin(body.email)
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))


@router.post("/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    """Logout and revoke tokens."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = request.cookies.get("access_token")
    
    return await auth_service.logout_user(user["id"], token)


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get the current authenticated user profile summary."""
    # Filter sensitive fields
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user.get("role", "user"),
        "email_verified": user.get("email_verified", False),
        "has_profile": user.get("has_profile", False),
        "created_at": user["created_at"].isoformat() if hasattr(user.get("created_at"), "isoformat") else None
    }


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    """Request a password reset email."""
    result = await auth_service.forgot_password(body.email)
    return result


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Reset password using the token from the email."""
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    try:
        return await auth_service.reset_password(body.token, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refresh")
async def refresh_token(request: Request):
    """Refresh the access token using a refresh token."""
    # Look for refresh token in body or cookie
    try:
        body = await request.json()
    except Exception:
        body = {}
    token = body.get("refresh_token") or request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(status_code=400, detail="Refresh token required")

    try:
        return await auth_service.refresh_access_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest, user: dict = Depends(get_current_user)
):
    """Change password for authenticated user."""
    try:
        return await auth_service.change_password(
            user["id"], body.current_password, body.new_password
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))





@router.get("/google/callback", name="google_callback", include_in_schema=False)
async def google_callback(request: Request, code: str):
    """Handle Google's redirect by exchanging the code for a token server-side."""
    from config import settings
    from fastapi.responses import RedirectResponse
    import httpx
    import uuid
    from datetime import datetime, timezone, timedelta
    from database import get_db
    db = get_db()
    
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return RedirectResponse(f"{settings.FRONTEND_URL}/login.html?error=oauth_not_configured")

    try:
        async with httpx.AsyncClient() as client:
            # 1. Exchange code for token
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": _get_redirect_uri(request),
                }
            )
            if token_response.status_code != 200:
                return RedirectResponse(f"{settings.FRONTEND_URL}/login.html?error=exchange_failed")

            token_data = token_response.json()
            google_access_token = token_data.get("access_token")

            # 2. Get user profile info
            user_response = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {google_access_token}"}
            )
            if user_response.status_code != 200:
                return RedirectResponse(f"{settings.FRONTEND_URL}/login.html?error=profile_failed")

            user_info = user_response.json()
            email = user_info.get("email")
            
            if not email:
                return RedirectResponse(f"{settings.FRONTEND_URL}/login.html?error=no_email")

            # 3. Handle login/registration
            auth_result = await auth_service.google_login_user(
                email=email,
                name=user_info.get("name", ""),
                ip=_get_ip(request)
            )
            
            # 4. Create short-lived handoff code (safer than token in fragment)
            handoff_id = str(uuid.uuid4())
            await db.oauth_handoffs.insert_one({
                "id": handoff_id,
                "access_token": auth_result["access_token"],
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)
            })
            
            return RedirectResponse(f"{settings.FRONTEND_URL}/login.html?oauth_code={handoff_id}")

    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/login.html?error=server_error")


@router.post("/exchange-code")
async def exchange_code(body: ExchangeCodeRequest, request: Request):
    """Exchange a Google OAuth code for an access token.
    (Placeholder — requires Google OAuth credentials to be configured.)
    """
    from config import settings
    import httpx

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=501,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env",
        )

    async with httpx.AsyncClient() as client:
        # Use provided redirect_uri or fallback to the standard callback
        redirect_uri = body.redirect_uri or _get_redirect_uri(request)
        
        # Exchange code for token
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": body.code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            }
        )
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange Google code")

        token_data = token_response.json()
        access_token = token_data.get("access_token")

        # Get user profile info
        user_response = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Google profile")

        user_info = user_response.json()
        email = user_info.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Google account has no email")

        # Use auth_service to handle the login/registration
        return await auth_service.google_login_user(
            email=email,
            name=user_info.get("name", ""),
            ip=_get_ip(request)
        )


@router.post("/oauth-handoff")
@limiter.limit("10/minute")
async def oauth_handoff(request: Request, body: dict):
    """Exchange a temporary handoff code for the actual access token."""
    from database import get_db
    from datetime import datetime, timezone
    db = get_db()
    
    handoff_id = body.get("code")
    if not handoff_id:
        raise HTTPException(status_code=400, detail="Code required")
        
    handoff = await db.oauth_handoffs.find_one_and_delete({
        "id": handoff_id,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    })
    
    if not handoff:
        raise HTTPException(status_code=401, detail="Invalid or expired code")
        
    # Get user info from token (we need it for the frontend)
    from utils import decode_token
    payload = decode_token(handoff["access_token"])
    
    return {
        "access_token": handoff["access_token"],
        "user": {
            "email": payload.get("email"),
            "id": payload.get("sub"),
            "role": payload.get("role", "user")
        }
    }


@router.get("/google")
async def google_login(request: Request):
    """Redirect to Google OAuth.
    (Placeholder — requires Google OAuth credentials.)
    """
    from config import settings

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=501,
            detail="Google OAuth not configured",
        )

    from urllib.parse import urlencode

    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": _get_redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    })
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")




# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _get_redirect_uri(request: Request) -> str:
    """Robustly generate the Google OAuth redirect URI."""
    from config import settings
    
    # Priority 1: Explicitly configured APP_BASE_URL (Recommended for production)
    if settings.APP_BASE_URL:
        base = settings.APP_BASE_URL.rstrip("/")
        return f"{base}/api/auth/google/callback"

    # Priority 2: Render's automatic URL
    if settings.RENDER_EXTERNAL_URL:
        base = settings.RENDER_EXTERNAL_URL.rstrip("/")
        return f"{base}/api/auth/google/callback"
        
    # Priority 3: Dynamic url_for (Fallback)
    url = str(request.url_for("google_callback"))
    if settings.APP_ENV == "production" and url.startswith("http://"):
        url = url.replace("http://", "https://", 1)
    return url

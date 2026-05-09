"""
Tests for services/auth_service.py
Covers: registration, login, email verification, token refresh, password flows, logout.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from tests.conftest import FAKE_USER_ID, FAKE_USER_OID


# ── Registration ────────────────────────────────────────────────────────────

async def test_register_new_user(mock_db, mock_redis):
    """New user: creates user doc, inserts verification PIN, sends email."""
    mock_db.users.find_one = AsyncMock(return_value=None)
    mock_db.users.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=FAKE_USER_OID)
    )

    with patch("services.email_service.send_email", new_callable=AsyncMock, return_value=True):
        from services.auth_service import register_user
        result = await register_user("new@example.com", "StrongPass123!")

        assert "check your email" in result["message"].lower() or "created" in result["message"].lower()
        mock_db.users.insert_one.assert_called_once()
        mock_db.email_verification_tokens.insert_one.assert_called_once()


async def test_register_existing_verified_user(mock_db, mock_redis):
    """Registering with an already-verified email raises ValueError."""
    # find_one returns different results on successive calls:
    # 1st call from register_user checks existing user — return verified user
    mock_db.users.find_one = AsyncMock(return_value={
        "_id": FAKE_USER_OID,
        "email": "exists@example.com",
        "email_verified": True,
    })

    from services.auth_service import register_user
    with pytest.raises(ValueError, match="already exists"):
        await register_user("exists@example.com", "Pass123!")


async def test_register_existing_unverified_resends_pin(mock_db, mock_redis):
    """Re-registering with an unverified email resends the PIN."""
    mock_db.users.find_one = AsyncMock(return_value={
        "_id": FAKE_USER_OID,
        "email": "unverified@example.com",
        "email_verified": False,
        "password_hash": "old_hash",
    })

    with patch("services.email_service.send_email", new_callable=AsyncMock, return_value=True):
        from services.auth_service import register_user
        result = await register_user("unverified@example.com", "NewPass!")

        assert "resent" in result["message"].lower() or "verification" in result["message"].lower()
        mock_db.email_verification_tokens.insert_one.assert_called_once()


# ── Email Verification ──────────────────────────────────────────────────────

async def test_verify_email_valid_pin(mock_db, mock_redis):
    """Valid PIN marks user as verified and cleans up tokens."""
    # The service calls find_one with a query dict; our AsyncMock returns regardless of args
    mock_db.email_verification_tokens.find_one = AsyncMock(return_value={
        "email": "test@example.com",
        "pin": "123456",
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
    })
    mock_db.users.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

    from services.auth_service import verify_email
    result = await verify_email("test@example.com", "123456")

    assert "verified" in result["message"].lower()
    mock_db.email_verification_tokens.delete_many.assert_called_once()


async def test_verify_email_invalid_pin(mock_db, mock_redis):
    """Invalid/expired PIN raises ValueError."""
    mock_db.email_verification_tokens.find_one = AsyncMock(return_value=None)

    from services.auth_service import verify_email
    with pytest.raises(ValueError, match="Invalid or expired"):
        await verify_email("test@example.com", "000000")


# ── Resend PIN ──────────────────────────────────────────────────────────────

async def test_resend_pin_rate_limited(mock_db, mock_redis):
    """Requesting a new PIN within 60s raises ValueError."""
    # First find_one call (users): return unverified user
    # Second find_one call (email_verification_tokens): return recent token
    mock_db.users.find_one = AsyncMock(return_value={
        "_id": FAKE_USER_OID,
        "email": "test@example.com",
        "email_verified": False,
    })
    mock_db.email_verification_tokens.find_one = AsyncMock(return_value={
        "email": "test@example.com",
        "created_at": datetime.now(timezone.utc),
    })

    from services.auth_service import resend_pin
    with pytest.raises(ValueError, match="wait"):
        await resend_pin("test@example.com")


# ── Login ────────────────────────────────────────────────────────────────────

async def test_login_success(mock_db, mock_redis, sample_user):
    """Valid credentials return tokens and update last_login."""
    mock_db.users.find_one = AsyncMock(return_value=sample_user)
    mock_db.user_profiles.find_one = AsyncMock(return_value={
        "user_id": FAKE_USER_ID, "first_name": "John", "phone_number": "123",
    })

    with patch("services.auth_service.verify_password", return_value=True), \
         patch("utils.needs_rehash", return_value=False):
        from services.auth_service import login_user
        result = await login_user("test@example.com", "CorrectPassword")

        assert "access_token" in result
        assert "refresh_token" in result
        assert result["token_type"] == "bearer"
        assert result["user"]["email"] == "test@example.com"


async def test_login_wrong_password(mock_db, mock_redis, sample_user):
    """Wrong password raises ValueError."""
    mock_db.users.find_one = AsyncMock(return_value=sample_user)

    with patch("utils.verify_password", return_value=False):
        from services.auth_service import login_user
        with pytest.raises(ValueError, match="Invalid email or password"):
            await login_user("test@example.com", "WrongPassword")


async def test_login_nonexistent_user(mock_db, mock_redis):
    """Login with nonexistent email raises ValueError."""
    mock_db.users.find_one = AsyncMock(return_value=None)

    from services.auth_service import login_user
    with pytest.raises(ValueError, match="Invalid email or password"):
        await login_user("nobody@example.com", "AnyPassword")


async def test_login_deactivated_user(mock_db, mock_redis, sample_user):
    """Deactivated user cannot log in."""
    sample_user["is_active"] = False
    mock_db.users.find_one = AsyncMock(return_value=sample_user)

    with patch("services.auth_service.verify_password", return_value=True), \
         patch("utils.needs_rehash", return_value=False):
        from services.auth_service import login_user
        with pytest.raises(ValueError, match="deactivated"):
            await login_user("test@example.com", "SomePassword")


async def test_login_unverified_email(mock_db, mock_redis, sample_user):
    """Unverified email raises ValueError when verification is required."""
    sample_user["email_verified"] = False
    mock_db.users.find_one = AsyncMock(return_value=sample_user)

    with patch("services.auth_service.verify_password", return_value=True), \
         patch("utils.needs_rehash", return_value=False):
        from services.auth_service import login_user
        with pytest.raises(ValueError, match="verify your email"):
            await login_user("test@example.com", "SomePassword")


async def test_login_google_only_account(mock_db, mock_redis):
    """Google-only account (empty password_hash) gets a clear error message."""
    mock_db.users.find_one = AsyncMock(return_value={
        "_id": FAKE_USER_OID, "email": "google@example.com",
        "password_hash": "", "email_verified": True, "is_active": True,
    })

    from services.auth_service import login_user
    with pytest.raises(ValueError, match="Google Sign-In"):
        await login_user("google@example.com", "AnyPassword")


# ── Token Refresh ────────────────────────────────────────────────────────────

async def test_refresh_token_reuse_revokes_all(mock_db, mock_redis):
    """Reusing a revoked refresh token triggers full session revocation."""
    revoked_doc = {
        "token": "reused.token", "user_id": FAKE_USER_ID, "revoked": True,
    }
    mock_db.refresh_tokens.find_one = AsyncMock(return_value=revoked_doc)

    from services.auth_service import refresh_access_token
    with pytest.raises(ValueError, match="Invalid or revoked"):
        await refresh_access_token("reused.token")

    mock_db.refresh_tokens.update_many.assert_called_once()


# ── Logout ───────────────────────────────────────────────────────────────────

async def test_logout_revokes_tokens(mock_db, mock_redis):
    """Logout revokes all refresh tokens for the user."""
    with patch("utils.decode_token", return_value=None):
        from services.auth_service import logout_user
        result = await logout_user(FAKE_USER_ID, access_token="some.token")

        assert result["message"] == "Logged out successfully"
        mock_db.refresh_tokens.update_many.assert_called_once()


# ── Change Password ──────────────────────────────────────────────────────────

async def test_change_password_success(mock_db, mock_redis, sample_user):
    """Changing password updates hash, revokes sessions, sends alert."""
    mock_db.users.find_one = AsyncMock(return_value=sample_user)
    mock_db.user_profiles.find_one = AsyncMock(return_value={"first_name": "John"})

    with patch("services.auth_service.verify_password", return_value=True), \
         patch("services.email_service.send_email", new_callable=AsyncMock, return_value=True):
        from services.auth_service import change_password
        result = await change_password(FAKE_USER_ID, "OldPass", "NewPass")

        assert "changed" in result["message"].lower()
        mock_db.users.update_one.assert_called_once()
        mock_db.refresh_tokens.update_many.assert_called_once()

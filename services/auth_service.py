"""
Authentication service: registration, login, verification, password reset, tokens.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId
from database import get_db
from config import settings
from utils import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_pin,
    generate_reset_token,
)
from services.email_service import (
    send_verification_email,
    send_password_reset_email,
    send_security_alert,
)
from loguru import logger


async def register_user(email: str, password: str) -> dict:
    """Register a new user, send verification PIN via Brevo."""
    db = get_db()

    # Check for existing user
    existing = await db.users.find_one({"email": email.lower().strip()})
    if existing:
        if existing.get("email_verified"):
            raise ValueError("An account with this email already exists")
        else:
            # Re-send verification to unverified user
            # Update password in case they want to change it during re-registration
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password_hash": hash_password(password), "updated_at": datetime.now(timezone.utc)}}
            )
            pin = generate_pin()
            await db.email_verification_tokens.delete_many({"email": email.lower()})
            await db.email_verification_tokens.insert_one(
                {
                    "email": email.lower().strip(),
                    "pin": pin,
                    "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
                    "created_at": datetime.now(timezone.utc),
                }
            )
            sent = await send_verification_email(email, pin)
            if not sent:
                logger.warning(f"Failed to send verification email to {email}")
            return {"message": "Verification code resent to your email"}

    # Create user
    role = "user"
    user_doc = {
        "email": email.lower().strip(),
        "password_hash": hash_password(password),
        "role": role,
        "email_verified": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Generate and store PIN
    pin = generate_pin()
    await db.email_verification_tokens.insert_one(
        {
            "email": email.lower().strip(),
            "pin": pin,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
            "created_at": datetime.now(timezone.utc),
        }
    )

    # Send verification email
    sent = await send_verification_email(email, pin)
    if not sent:
        logger.warning(f"Failed to send verification email to {email}")
    logger.info(f"User registered: {email} (ID: {user_id})")

    return {"message": "Account created. Check your email for the verification code."}


async def verify_email(email: str, pin: str) -> dict:
    """Verify user email with the 6-digit PIN."""
    db = get_db()

    token_doc = await db.email_verification_tokens.find_one(
        {
            "email": email.lower().strip(),
            "pin": pin,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    if not token_doc:
        raise ValueError("Invalid or expired verification code")

    # Mark user as verified
    result = await db.users.update_one(
        {"email": email.lower().strip()},
        {"$set": {"email_verified": True, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise ValueError("User not found")

    # Clean up tokens
    await db.email_verification_tokens.delete_many({"email": email.lower().strip()})
    logger.info(f"Email verified: {email}")

    return {"message": "Email verified successfully"}


async def resend_pin(email: str) -> dict:
    """Resend the verification PIN."""
    db = get_db()

    user = await db.users.find_one({"email": email.lower().strip()})
    if not user:
        # Don't reveal if user exists
        return {"message": "If an account exists, a new code has been sent."}

    if user.get("email_verified"):
        return {"message": "Email is already verified."}

    # Rate limit: max 1 per 60 seconds
    recent = await db.email_verification_tokens.find_one(
        {
            "email": email.lower().strip(),
            "created_at": {
                "$gt": datetime.now(timezone.utc) - timedelta(seconds=60)
            },
        }
    )
    if recent:
        raise ValueError("Please wait before requesting another code")

    pin = generate_pin()
    await db.email_verification_tokens.delete_many({"email": email.lower().strip()})
    await db.email_verification_tokens.insert_one(
        {
            "email": email.lower().strip(),
            "pin": pin,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
            "created_at": datetime.now(timezone.utc),
        }
    )
    sent = await send_verification_email(email, pin)
    if not sent:
        logger.warning(f"Failed to send verification email to {email}")

    return {"message": "New verification code sent."}


async def login_user(email: str, password: str, ip: str = "") -> dict:
    """Authenticate user and return tokens."""
    db = get_db()

    user = await db.users.find_one({"email": email.lower().strip()})
    if not user:
        raise ValueError("Invalid email or password")
        
    if not user.get("password_hash"):
        raise ValueError("This account uses Google Sign-In. Please use the 'Sign in with Google' button.")

    if not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid email or password")

    # Gracefully rehash to argon2 if needed
    from utils import needs_rehash
    if needs_rehash(user["password_hash"]):
        new_hash = hash_password(password)
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": new_hash}})
        logger.info(f"Rehashed password to Argon2 for user: {email}")

    if not user.get("is_active", True):
        raise ValueError("Account is deactivated")

    if settings.REQUIRE_EMAIL_VERIFICATION and not user.get("email_verified"):
        raise ValueError("Please verify your email before logging in")

    user_id = str(user["_id"])

    # Check if profile exists
    profile = await db.user_profiles.find_one({"user_id": user_id})
    has_profile = profile is not None and bool(profile.get("first_name")) and bool(profile.get("phone_number"))

    # Generate tokens
    role = user.get("role", "user")
    
    token_data = {
        "sub": user_id,
        "email": user["email"],
        "role": role,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Cleanup old tokens (revoked or expired)
    await db.refresh_tokens.delete_many({
        "$or": [
            {"user_id": user_id, "revoked": True},
            {"user_id": user_id, "expires_at": {"$lt": datetime.now(timezone.utc)}}
        ]
    })

    # Store refresh token
    await db.refresh_tokens.insert_one(
        {
            "token": refresh_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "created_at": datetime.now(timezone.utc),
            "ip": ip,
            "revoked": False,
        }
    )

    # Broadcast new login event to other active sessions
    from redis_client import get_redis
    import json
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("security_events", json.dumps({
            "type": "USER_NOTIFICATION",
            "user_id": user_id,
            "payload": {
                "title": "New Login Detected",
                "message": f"A new login was detected from your account. If this was not you, please change your password immediately."
            }
        }))
    else:
        logger.warning("Redis unavailable: skipping login event broadcast.")

    # Update last login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}},
    )

    logger.info(f"User logged in: {email}")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
            "role": user.get("role", "user"),
            "has_profile": has_profile,
        },
    }


async def google_login_user(email: str, name: str, ip: str = "") -> dict:
    """Authenticate or register user via Google OAuth."""
    db = get_db()
    email = email.lower().strip()
    
    user = await db.users.find_one({"email": email})
    
    if not user:
        # Register new user
        role = "user"
        user_doc = {
            "email": email,
            "password_hash": "", # No password for Google users
            "role": role,
            "email_verified": True, # Pre-verified by Google
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)
        
        # Pre-fill profile with name
        parts = name.split()
        first_name = parts[0] if parts else ""
        last_name = parts[-1] if len(parts) > 1 else ""
        
        await db.user_profiles.update_one(
            {"user_id": user_id},
            {
                "$setOnInsert": {
                    "first_name": first_name,
                    "last_name": last_name,
                    "created_at": datetime.now(timezone.utc),
                },
                "$set": {
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True
        )
        user = await db.users.find_one({"_id": result.inserted_id})
        logger.info(f"Google user registered: {email}")
    else:
        if not user.get("is_active", True):
            raise ValueError("Account is deactivated")
        # Ensure email is marked verified since they proved ownership via Google
        if not user.get("email_verified"):
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"email_verified": True}})

    user_id = str(user["_id"])
    
    # Check if profile exists and has a name
    profile = await db.user_profiles.find_one({"user_id": user_id})
    has_profile = profile is not None and bool(profile.get("first_name"))
    
    # Generate tokens
    role = user.get("role", "user")
        
    token_data = {
        "sub": user_id,
        "email": user["email"],
        "role": role,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Cleanup old tokens
    await db.refresh_tokens.delete_many({
        "$or": [
            {"user_id": user_id, "revoked": True},
            {"user_id": user_id, "expires_at": {"$lt": datetime.now(timezone.utc)}}
        ]
    })

    # Store refresh token
    await db.refresh_tokens.insert_one(
        {
            "token": refresh_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "created_at": datetime.now(timezone.utc),
            "ip": ip,
            "revoked": False,
        }
    )

    # Broadcast new login event to other active sessions
    from redis_client import get_redis
    import json
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("security_events", json.dumps({
            "type": "USER_NOTIFICATION",
            "user_id": user_id,
            "payload": {
                "title": "New Google Login Detected",
                "message": f"A new login via Google was detected from your account."
            }
        }))
    else:
        logger.warning("Redis unavailable: skipping Google login event broadcast.")

    # Update last login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}},
    )

    logger.info(f"Google user logged in: {email}")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
            "role": user.get("role", "user"),
            "has_profile": has_profile,
        },
    }


async def refresh_access_token(refresh_token: str) -> dict:
    """Issue a new access token from a valid refresh token."""
    db = get_db()

    # Check if the token was revoked (possibly reused refresh token indicating theft)
    revoked_check = await db.refresh_tokens.find_one({"token": refresh_token, "revoked": True})
    if revoked_check:
        # Threat detected: Refresh token reuse!
        user_id = revoked_check.get("user_id")
        logger.warning(f"SECURITY ALERT: Refresh token reuse detected for user {user_id}. Revoking ALL sessions.")

        # Revoke all refresh tokens for this user
        if user_id:
            await db.refresh_tokens.update_many(
                {"user_id": user_id}, {"$set": {"revoked": True}}
            )

            # Broadcast session revoked event
            from redis_client import get_redis
            import json
            redis_client = get_redis()
            if redis_client:
                await redis_client.publish("security_events", json.dumps({
                    "type": "SESSION_REVOKED",
                    "user_id": user_id
                }))
            else:
                logger.warning("Redis unavailable: skipping session revoked broadcast.")

        raise ValueError("Invalid or revoked refresh token")

    # Find the stored active refresh token
    stored = await db.refresh_tokens.find_one(
        {"token": refresh_token, "revoked": False}
    )
    if not stored:
        raise ValueError("Invalid or revoked refresh token")

    if stored["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise ValueError("Refresh token expired")

    # Decode to get user data
    try:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise ValueError("Invalid token type")
    except Exception as e:
        if isinstance(e, ValueError): raise e
        raise ValueError("Invalid refresh token")

    user_id = payload.get("sub")
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise ValueError("User not found")

    # Generate new access token
    token_data = {
        "sub": user_id,
        "email": user["email"],
        "role": user.get("role", "user"),
    }
    new_access_token = create_access_token(token_data)

    # Generate new refresh token for rotation
    new_refresh_token = create_refresh_token(token_data)

    # Rotate token in DB
    await db.refresh_tokens.update_one(
        {"_id": stored["_id"]},
        {"$set": {"revoked": True}}
    )

    await db.refresh_tokens.insert_one(
        {
            "token": new_refresh_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "created_at": datetime.now(timezone.utc),
            "ip": stored.get("ip", ""),
            "revoked": False,
        }
    )

    return {"access_token": new_access_token, "refresh_token": new_refresh_token, "token_type": "bearer", "user": {"id": user_id, "email": user["email"], "role": user.get("role", "user")}}


async def logout_user(user_id: str, access_token: Optional[str] = None) -> dict:
    """Revoke refresh tokens and blacklist the current access token."""
    db = get_db()

    # Revoke all refresh tokens for this user
    await db.refresh_tokens.update_many(
        {"user_id": user_id}, {"$set": {"revoked": True}}
    )

    # Blacklist the current access token in Redis
    if access_token:
        try:
            payload = decode_token(access_token)
            if not payload:
                # Token already expired or invalid, no need to blacklist
                return {"message": "Logged out successfully"}
                
            exp = payload.get("exp")
            if exp:
                remaining_seconds = max(0, int(exp - datetime.now(timezone.utc).timestamp()))
                if remaining_seconds > 0:
                    from redis_client import get_redis
                    redis_client = get_redis()
                    if redis_client:
                        # Use JTI if available, otherwise hash the token
                        import hashlib
                        token_hash = hashlib.sha256(access_token.encode()).hexdigest()
                        await redis_client.set(f"revoked:token:{token_hash}", "1", ex=remaining_seconds)
                    else:
                        logger.warning("Redis unavailable: skipping token blacklist on logout.")
        except Exception as e:
            logger.debug(f"Access token already expired or invalid during logout: {e}")

    # Broadcast session revoked event
    from redis_client import get_redis
    import json
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("security_events", json.dumps({
            "type": "SESSION_REVOKED",
            "user_id": user_id
        }))
    else:
        logger.warning("Redis unavailable: skipping session revoked broadcast on logout.")

    logger.info(f"User logged out: {user_id}")
    return {"message": "Logged out successfully"}


async def forgot_password(email: str) -> dict:
    """Generate a password reset token and send it via email."""
    db = get_db()

    user = await db.users.find_one({"email": email.lower().strip()})
    if not user:
        # Don't reveal whether user exists
        return {
            "message": "If an account exists with this email, a reset link has been sent."
        }

    # Generate reset token
    token = generate_reset_token()
    await db.password_reset_tokens.delete_many({"email": email.lower().strip()})
    await db.password_reset_tokens.insert_one(
        {
            "email": email.lower().strip(),
            "token": token,
            "expires_at": datetime.now(timezone.utc)
            + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
            "created_at": datetime.now(timezone.utc),
            "used": False,
        }
    )

    # Build reset URL
    reset_url = f"{settings.FRONTEND_URL}/forgot-password?token={token}"

    # Get user name for email
    profile = await db.user_profiles.find_one({"user_id": str(user["_id"])})
    name = profile.get("first_name", "") if profile else ""

    sent = await send_password_reset_email(email, reset_url, name)
    if not sent:
        logger.warning(f"Failed to send password reset email to {email}")
    logger.info(f"Password reset requested: {email}")

    return {
        "message": "If an account exists with this email, a reset link has been sent."
    }


async def reset_password(token: str, new_password: str) -> dict:
    """Reset password using the reset token."""
    db = get_db()

    token_doc = await db.password_reset_tokens.find_one(
        {
            "token": token,
            "used": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    if not token_doc:
        raise ValueError("Invalid or expired reset token")

    email = token_doc["email"]

    # Update password
    result = await db.users.update_one(
        {"email": email},
        {
            "$set": {
                "password_hash": hash_password(new_password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    if result.modified_count == 0:
        raise ValueError("User not found")

    # Mark token as used
    await db.password_reset_tokens.update_one(
        {"_id": token_doc["_id"]}, {"$set": {"used": True}}
    )

    # Revoke all refresh tokens (security: force re-login)
    user = await db.users.find_one({"email": email})
    if user:
        user_id_str = str(user["_id"])
        await db.refresh_tokens.update_many(
            {"user_id": user_id_str}, {"$set": {"revoked": True}}
        )

        # Broadcast session revoked event
        from redis_client import get_redis
        import json
        redis_client = get_redis()
        if redis_client:
            await redis_client.publish("security_events", json.dumps({
                "type": "SESSION_REVOKED",
                "user_id": user_id_str
            }))
        else:
            logger.warning("Redis unavailable: skipping session revoked broadcast on password reset.")

    logger.info(f"Password reset completed: {email}")
    return {"message": "Password reset successfully"}


async def change_password(
    user_id: str, current_password: str, new_password: str
) -> dict:
    """Change password for an authenticated user."""
    db = get_db()

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise ValueError("User not found")

    if not user.get("password_hash"):
        raise ValueError("Accounts created via Google do not have a password set. Please use 'Forgot Password' to set one.")

    if not verify_password(current_password, user["password_hash"]):
        raise ValueError("Current password is incorrect")

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(new_password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    # Revoke all refresh tokens
    await db.refresh_tokens.update_many(
        {"user_id": user_id}, {"$set": {"revoked": True}}
    )

    # Broadcast session revoked event
    from redis_client import get_redis
    import json
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("security_events", json.dumps({
            "type": "SESSION_REVOKED",
            "user_id": user_id
        }))
    else:
        logger.warning("Redis unavailable: skipping session revoked broadcast on account deletion.")

    # Send security alert
    profile = await db.user_profiles.find_one({"user_id": user_id})
    name = profile.get("first_name", "") if profile else ""
    sent = await send_security_alert(user["email"], "Password changed", name=name)
    if not sent:
        logger.warning(f"Failed to send password change security alert to {user['email']}")
    logger.info(f"Password changed: {user['email']}")

    return {"message": "Password changed successfully. Please log in again."}


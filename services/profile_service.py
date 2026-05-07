"""
Profile service: user profile, job preferences, platform accounts.
"""

from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from database import get_db
from utils import encrypt_value, decrypt_value
from loguru import logger


async def get_full_profile(user_id: str) -> dict:
    """Get the full profile: personal info, job preferences, platform accounts."""
    db = get_db()
    import asyncio

    profile_task = db.user_profiles.find_one({"user_id": user_id})
    job_prefs_task = db.job_preferences.find_one({"user_id": user_id})
    platforms_task = db.platform_accounts.find_one({"user_id": user_id})

    results = await asyncio.gather(
        profile_task, job_prefs_task, platforms_task,
        return_exceptions=True
    )
    
    profile = results[0] if not isinstance(results[0], Exception) else None
    job_prefs = results[1] if not isinstance(results[1], Exception) else None
    platforms = results[2] if not isinstance(results[2], Exception) else None
    
    if any(isinstance(r, Exception) for r in results):
        logger.error(f"Partial failure in get_full_profile for user {user_id}: {[r for r in results if isinstance(r, Exception)]}")

    # Decrypt platform account credentials for extension/auto-login
    platform_data = {}
    if platforms:
        for key, value in platforms.items():
            if key in ("_id", "user_id", "created_at", "updated_at", "linkedin_cookies") or key.startswith("_linkedin_raw_"):
                continue

            # Security: Do NOT decrypt passwords in general profile calls
            if "password" in key.lower():
                platform_data[key] = "••••••••"
                continue

            # Decrypt other Fernet tokens (starts with gAAAAA)
            if isinstance(value, str) and value.startswith("gAAAAA"):
                try:
                    platform_data[key] = decrypt_value(value)
                except Exception:
                    platform_data[key] = "••••••••"
            else:
                platform_data[key] = value

    return {
        "profile": _clean_doc(profile) if profile else {},
        "job_preferences": _clean_doc(job_prefs) if job_prefs else {},
        "platform_accounts": platform_data,
    }


async def update_profile(user_id: str, data: dict) -> dict:
    """Update or create the user profile."""
    db = get_db()

    # Fields allowed for profile
    allowed_fields = {
        "first_name", "middle_name", "last_name",
        "phone_number", "phone_country_code", "current_city", "street", "state", "country", "zipcode",
        "gender", "ethnicity", "disability_status", "veteran_status",
        "linkedin_profile", "github", "website",
        "linkedin_headline", "linkedin_summary", "skills_summary", "cover_letter",
        "years_of_experience", "current_ctc", "desired_salary", "notice_period",
        "recent_employer", "confidence_level",
        "education_text", "experience_text",
        "linkedin_cookies",
        "_linkedin_raw_experience", "_linkedin_raw_education",
        "_linkedin_raw_skills", "_linkedin_raw_certifications",
        "_linkedin_raw_languages", "dynamic_answers",
    }

    # Validate and sanitize dynamic_answers to prevent payload abuse
    if "dynamic_answers" in data:
        answers = data["dynamic_answers"]
        if not isinstance(answers, dict) or len(str(answers)) > 50000:
            raise ValueError("dynamic_answers too large or invalid")
        data["dynamic_answers"] = {str(k)[:100]: str(v)[:5000] for k, v in answers.items()}

    update_data = {}
    for k, v in data.items():
        if k in allowed_fields:
            if k.startswith("_linkedin_raw_") and isinstance(v, list):
                # Limit to 50 items and truncate long strings within items
                cleaned_v = []
                for item in v[:50]:
                    if isinstance(item, str):
                        cleaned_v.append(item[:1000])
                    elif isinstance(item, dict):
                        # Shallow clean of dict items
                        cleaned_v.append({str(dk)[:50]: str(dv)[:1000] for dk, dv in item.items()})
                    else:
                        cleaned_v.append(item)
                update_data[k] = cleaned_v
            else:
                update_data[k] = v
    update_data["user_id"] = user_id
    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.user_profiles.update_one(
        {"user_id": user_id},
        {"$set": update_data, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    # Also update the user's has_profile flag
    has_name = bool(update_data.get("first_name") or update_data.get("last_name"))
    if has_name:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"has_profile": True}},
        )

    updated = await db.user_profiles.find_one({"user_id": user_id})
    logger.info(f"Profile updated for user: {user_id}")

    return {"message": "Profile updated", "profile": _clean_doc(updated)}


async def update_job_preferences(user_id: str, data: dict) -> dict:
    """Update or create job preferences."""
    db = get_db()

    allowed_fields = {
        "search_terms", "search_location", "experience_level", "on_site",
        "date_posted", "switch_number", "easy_apply_only", "bad_words",
        "good_words", "job_type", "us_citizenship", "require_visa",
    }

    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    update_data["user_id"] = user_id
    update_data["updated_at"] = datetime.now(timezone.utc)

    await db.job_preferences.update_one(
        {"user_id": user_id},
        {"$set": update_data, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    logger.info(f"Job preferences updated for user: {user_id}")
    return {"message": "Job preferences updated"}


async def update_platform_accounts(user_id: str, data: dict) -> dict:
    """Update platform login credentials (encrypted)."""
    db = get_db()

    update_data = {"user_id": user_id, "updated_at": datetime.now(timezone.utc)}

    # Process each field
    for key, value in data.items():
        if "password" in key and value:
            # Encrypt passwords
            update_data[key] = encrypt_value(value)
        elif value is not None:
            update_data[key] = value

    await db.platform_accounts.update_one(
        {"user_id": user_id},
        {"$set": update_data, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    logger.info(f"Platform accounts updated for user: {user_id}")
    return {"message": "Platform accounts updated"}


async def get_decrypted_platform_accounts(user_id: str, caller_verified: bool = False) -> dict:
    """Get platform accounts with decrypted passwords.
    
    SECURITY WARNING: This function returns plaintext credentials.
    It MUST only be called from authenticated, authorized contexts (e.g.,
    extension auto-login for the owning user). Never expose via a public
    endpoint without strict ownership verification.
    
    Args:
        user_id: The user whose credentials to decrypt.
        caller_verified: Must be explicitly set to True by the caller to
            confirm that the requesting user has been authenticated and
            authorized to access these credentials.
    """
    if not caller_verified:
        logger.warning(f"get_decrypted_platform_accounts called without caller_verified for user {user_id}")
        raise ValueError("Caller must explicitly verify authorization before accessing decrypted credentials")
    
    db = get_db()
    platforms = await db.platform_accounts.find_one({"user_id": user_id})
    if not platforms:
        return {}

    result = {}
    for key, value in platforms.items():
        if key in ("_id", "user_id", "created_at", "updated_at"):
            continue
        if "password" in key and value:
            result[key] = decrypt_value(value)
        else:
            result[key] = value
    return result




async def save_linkedin_cookies(user_id: str, cookies: list) -> dict:
    """Save LinkedIn session cookies for automation."""
    db = get_db()
    
    await db.platform_accounts.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "linkedin_cookies": cookies,
                "updated_at": datetime.now(timezone.utc)
            },
            "$setOnInsert": {"created_at": datetime.now(timezone.utc)}
        },
        upsert=True
    )
    
    logger.info(f"LinkedIn cookies saved for user: {user_id}")
    return {"message": "LinkedIn cookies saved"}


async def atomic_save_profile(user_id: str, data: dict) -> dict:
    """Atomic update of profile, job preferences, and platform accounts."""
    # We use separate functions but return one success message.
    # A true MongoDB transaction could be used here if needed.
    
    if "profile" in data:
        await update_profile(user_id, data["profile"])
    
    if "job_preferences" in data:
        await update_job_preferences(user_id, data["job_preferences"])
        
    if "platform_accounts" in data:
        await update_platform_accounts(user_id, data["platform_accounts"])
        
    return {"message": "Full profile saved successfully"}


async def delete_full_profile(user_id: str) -> bool:
    """Delete all data associated with a user."""
    db = get_db()
    
    # 1. Validate ObjectId and check user existence BEFORE deleting anything else
    try:
        oid = ObjectId(user_id)
    except Exception:
        logger.error(f"Invalid user_id format provided for deletion: {user_id}")
        return False

    user = await db.users.find_one({"_id": oid})
    if not user:
        logger.warning(f"Attempted to delete non-existent user: {user_id}")
        return False

    # 2. Delete profiles
    await db.user_profiles.delete_one({"user_id": user_id})
    await db.job_preferences.delete_one({"user_id": user_id})
    await db.platform_accounts.delete_one({"user_id": user_id})
    
    # 3. Delete resumes from DB and R2
    from storage import delete_file_from_r2
    resumes = await db.resumes.find({"user_id": user_id}).to_list(length=None)
    for res in resumes:
        if res.get("object_key"):
            try:
                await delete_file_from_r2(res["object_key"])
            except Exception as e:
                logger.error(f"Failed to delete resume from R2 during profile deletion: {e}")
    
    await db.resumes.delete_many({"user_id": user_id})
    
    # 4. Delete job applications
    await db.job_applications.delete_many({"user_id": user_id})
    
    # 5. Delete automation sessions & logs
    await db.automation_sessions.delete_many({"user_id": user_id})
    await db.automation_logs.delete_many({"user_id": user_id})
    
    # 5. Delete extension tokens
    await db.extension_tokens.delete_many({"user_id": user_id})
    
    # 6. Delete user account itself
    try:
        result = await db.users.delete_one({"_id": ObjectId(user_id)})
    except Exception:
        # If user_id is not a valid ObjectId string
        logger.error(f"Invalid user_id provided for deletion: {user_id}")
        return False
    
    logger.warning(f"USER DELETED: {user_id}")
    return result.deleted_count > 0


def _clean_doc(doc: dict) -> dict:
    """Remove internal MongoDB fields and raw scraped data from a document."""
    if not doc:
        return {}
    clean = {}
    for key, value in doc.items():
        # Exclude internal ID, user reference, and ALL raw scraped LinkedIn data
        if key in ("_id", "user_id") or key.startswith("_linkedin_raw_") or key == "linkedin_cookies":
            continue
        if hasattr(value, "isoformat"):
            clean[key] = value.isoformat()
        else:
            clean[key] = value
    return clean

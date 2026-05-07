"""
MongoDB async connection using Motor.
Provides the database instance and collection accessors.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from config import settings
from loguru import logger

_client: AsyncIOMotorClient | None = None
_db = None


async def connect_db():
    """Establish the MongoDB connection."""
    global _client, _db
    logger.info("Connecting to MongoDB…")
    _client = AsyncIOMotorClient(
        settings.MONGODB_URL,
        maxPoolSize=20,
        minPoolSize=5,
        serverSelectionTimeoutMS=5000,
    )
    _db = _client[settings.MONGODB_DB_NAME]

    # Verify connectivity
    await _client.admin.command("ping")
    logger.info(f"Connected to MongoDB database: {settings.MONGODB_DB_NAME}")

    # Create indexes
    await _ensure_indexes()
    
    # Load dynamic config
    await _load_dynamic_config()


async def close_db():
    """Close the MongoDB connection."""
    global _client
    if _client:
        _client.close()
        logger.info("MongoDB connection closed.")


async def _ensure_indexes():
    """Create indexes for frequently-queried fields."""
    db = get_db()

    # Users
    await db.users.create_index("email", unique=True)
    await db.users.create_index("created_at", background=True)

    # Profiles
    await db.user_profiles.create_index("user_id", unique=True)

    # Job preferences
    await db.job_preferences.create_index("user_id", unique=True)

    # Platform accounts
    await db.platform_accounts.create_index("user_id", unique=True)

    # Refresh tokens
    await db.refresh_tokens.create_index("token", unique=True)
    await db.refresh_tokens.create_index("user_id", background=True)
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)

    # Email verification tokens
    await db.email_verification_tokens.create_index("email", background=True)
    await db.email_verification_tokens.create_index(
        "expires_at", expireAfterSeconds=0
    )

    # Password reset tokens
    await db.password_reset_tokens.create_index("token", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)

    # Resumes
    await db.resumes.create_index("user_id", background=True)
    await db.resumes.create_index([("user_id", 1), ("is_active", -1)], background=True)

    # Job applications
    await db.job_applications.create_index([("user_id", 1), ("job_link", 1)], background=True)
    await db.job_applications.create_index([("user_id", 1), ("applied_at", -1)], background=True)
    await db.job_applications.create_index([("user_id", 1), ("job_link", 1), ("applied_at", -1)], background=True) # Dedup optimization
    await db.job_applications.create_index([("user_id", 1), ("result", 1)], background=True)
    # Text index for search
    await db.job_applications.create_index(
        [("job_title", "text"), ("company", "text")],
        name="job_search_index",
        background=True
    )

    # Automation sessions
    await db.automation_sessions.create_index("user_id", background=True)
    await db.automation_sessions.create_index([("user_id", 1), ("status", 1)], background=True)

    # Automation logs
    await db.automation_logs.create_index([("user_id", 1), ("timestamp", -1)], background=True)
    await db.automation_logs.create_index("session_id", background=True)

    # Extension tokens
    await db.extension_tokens.create_index("token", unique=True)
    await db.extension_tokens.create_index("user_id", background=True)

    # Notifications
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.notifications.create_index([("user_id", 1), ("read", 1)], background=True)

    # Audit logs
    await db.audit_logs.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.audit_logs.create_index("action", background=True)

    # Blacklisted tokens (TTL)
    await db.blacklisted_tokens.create_index("token", unique=True)
    await db.blacklisted_tokens.create_index("expires_at", expireAfterSeconds=0)

    logger.info("MongoDB indexes ensured.")


async def _load_dynamic_config():
    """Load settings from DB 'config' collection and update settings object."""
    db = get_db()
    try:
        cursor = db.config.find({})
        async for doc in cursor:
            if doc["key"] == "nvidia_nim_keys":
                object.__setattr__(settings, "NIM_API_KEYS", doc["value"])
                
        # Trigger NIM cycle reset only if keys found
        if settings.NIM_API_KEYS:
            try:
                # Local import to prevent circular dependency
                from services.ai_service import reset_keys_cycle
                await reset_keys_cycle()
                logger.info("Dynamic config: NIM API keys loaded and cycled.")
            except ImportError:
                logger.warning("Dynamic config: ai_service not yet available for key cycling.")
            except Exception as e:
                logger.error(f"Error cycling keys during startup: {e}")
                
    except Exception as e:
        logger.warning(f"Could not load dynamic config from DB: {e}")


def get_db():
    """Return the database instance."""
    if _db is None:
        raise RuntimeError("Database not initialised. Call connect_db() first.")
    return _db

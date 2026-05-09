"""
Shared pytest fixtures for the SmartApply test suite.
Provides mock database, Redis, and common test data helpers.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from bson import ObjectId


# ── Fake ObjectId helper ────────────────────────────────────────────────────

def fake_oid(hex_suffix: str = "aabbccddeeff") -> ObjectId:
    """Generate a deterministic ObjectId for tests."""
    return ObjectId(hex_suffix.ljust(24, "0"))


FAKE_USER_ID = str(fake_oid("a0a0a0a0a0a1"))
FAKE_USER_OID = fake_oid("a0a0a0a0a0a1")


# ── Mock DB Fixture ─────────────────────────────────────────────────────────

import database

@pytest.fixture(autouse=True)
def mock_db():
    """
    Returns a MagicMock database object with AsyncMock methods on all
    collections used across the codebase.
    """
    db = MagicMock()

    collections = [
        "users", "user_profiles", "job_preferences", "platform_accounts",
        "refresh_tokens", "email_verification_tokens", "password_reset_tokens",
        "automation_sessions", "automation_logs", "extension_tokens",
        "extension_sessions", "resumes", "job_applications",
        "config", "email_templates", "dynamic_questions", "audit_logs",
    ]

    for name in collections:
        coll = MagicMock()
        coll.find_one = AsyncMock(return_value=None)
        coll.find = MagicMock(return_value=AsyncMock(to_list=AsyncMock(return_value=[])))
        coll.insert_one = AsyncMock()
        coll.update_one = AsyncMock()
        coll.update_many = AsyncMock()
        coll.delete_one = AsyncMock()
        coll.delete_many = AsyncMock()
        coll.count_documents = AsyncMock(return_value=0)
        setattr(db, name, coll)

    database._db = db
    yield db
    database._db = None


# ── Mock Redis Fixture ──────────────────────────────────────────────────────

import redis_client

@pytest.fixture(autouse=True)
def mock_redis():
    """Returns an AsyncMock Redis client and patches get_redis."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock()
    redis.publish = AsyncMock()

    redis_client._redis_client = redis
    yield redis
    redis_client._redis_client = None


# ── Common Test Data ────────────────────────────────────────────────────────

@pytest.fixture
def sample_user():
    """A typical verified, active user document."""
    return {
        "_id": FAKE_USER_OID,
        "email": "test@example.com",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$fakesalt$fakehash",
        "role": "user",
        "email_verified": True,
        "is_active": True,
        "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
        "last_login": None,
    }


@pytest.fixture
def sample_profile():
    """A typical user profile document."""
    return {
        "_id": ObjectId(),
        "user_id": FAKE_USER_ID,
        "first_name": "John",
        "last_name": "Doe",
        "phone_number": "1234567890",
        "current_city": "Mumbai",
        "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
    }

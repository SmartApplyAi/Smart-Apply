"""
Tests for services/profile_service.py
Covers: get/update profile, job preferences, platform accounts, encryption, deletion.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
from bson import ObjectId
from tests.conftest import FAKE_USER_ID, FAKE_USER_OID


async def test_get_full_profile_with_resume(mock_db):
    mock_db.user_profiles.find_one = AsyncMock(return_value={
        "_id": ObjectId(), "user_id": FAKE_USER_ID,
        "first_name": "Jane", "last_name": "Doe",
        "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
    })
    mock_db.job_preferences.find_one = AsyncMock(return_value={
        "_id": ObjectId(), "user_id": FAKE_USER_ID,
        "search_terms": ["Python Developer"],
    })
    mock_db.platform_accounts.find_one = AsyncMock(return_value=None)
    mock_db.resumes.find_one = AsyncMock(return_value={
        "user_id": FAKE_USER_ID, "object_key": "resumes/abc123.pdf",
        "filename": "jane_resume.pdf", "content_type": "application/pdf",
        "uploaded_at": datetime(2025, 6, 1, tzinfo=timezone.utc), "is_active": True,
    })

    from services.profile_service import get_full_profile
    result = await get_full_profile(FAKE_USER_ID)

    assert result["profile"]["first_name"] == "Jane"
    assert result["profile"]["resumeFileName"] == "jane_resume.pdf"
    assert result["job_preferences"]["search_terms"] == ["Python Developer"]


async def test_get_full_profile_no_data(mock_db):
    mock_db.user_profiles.find_one = AsyncMock(return_value=None)
    mock_db.job_preferences.find_one = AsyncMock(return_value=None)
    mock_db.platform_accounts.find_one = AsyncMock(return_value=None)
    mock_db.resumes.find_one = AsyncMock(return_value=None)

    from services.profile_service import get_full_profile
    result = await get_full_profile(FAKE_USER_ID)

    assert result["profile"]["resumePath"] == ""
    assert result["job_preferences"] == {}
    assert result["platform_accounts"] == {}


async def test_get_full_profile_masks_passwords(mock_db):
    mock_db.user_profiles.find_one = AsyncMock(return_value=None)
    mock_db.job_preferences.find_one = AsyncMock(return_value=None)
    mock_db.platform_accounts.find_one = AsyncMock(return_value={
        "_id": ObjectId(), "user_id": FAKE_USER_ID,
        "linkedin_email": "jane@example.com",
        "linkedin_password": "gAAAAAsecretencryptedvalue",
        "updated_at": datetime.now(timezone.utc),
    })
    mock_db.resumes.find_one = AsyncMock(return_value=None)

    from services.profile_service import get_full_profile
    result = await get_full_profile(FAKE_USER_ID)

    assert result["platform_accounts"]["linkedin_password"] == "••••••••"
    assert result["platform_accounts"]["linkedin_email"] == "jane@example.com"


async def test_update_profile_allowed_fields(mock_db):
    mock_db.user_profiles.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    mock_db.user_profiles.find_one = AsyncMock(return_value={
        "_id": ObjectId(), "user_id": FAKE_USER_ID,
        "first_name": "Jane", "updated_at": datetime.now(timezone.utc),
    })

    from services.profile_service import update_profile
    result = await update_profile(FAKE_USER_ID, {
        "first_name": "Jane", "malicious_field": "ignored", "role": "admin",
    })

    assert result["message"] == "Profile updated"
    call_args = mock_db.user_profiles.update_one.call_args
    set_data = call_args[0][1]["$set"] if call_args[0] else call_args[1]["$set"]
    assert "malicious_field" not in set_data
    assert "role" not in set_data


async def test_update_profile_sets_has_profile_flag(mock_db):
    mock_db.user_profiles.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    mock_db.user_profiles.find_one = AsyncMock(return_value={
        "_id": ObjectId(), "user_id": FAKE_USER_ID,
        "first_name": "John", "updated_at": datetime.now(timezone.utc),
    })
    mock_db.users.update_one = AsyncMock()

    from services.profile_service import update_profile
    await update_profile(FAKE_USER_ID, {"first_name": "John"})
    mock_db.users.update_one.assert_called_once()


async def test_update_job_preferences(mock_db):
    mock_db.job_preferences.update_one = AsyncMock()

    from services.profile_service import update_job_preferences
    result = await update_job_preferences(FAKE_USER_ID, {
        "search_terms": ["ML Engineer"], "hacker_field": "ignored",
    })

    assert result["message"] == "Job preferences updated"
    call_args = mock_db.job_preferences.update_one.call_args
    set_data = call_args[0][1]["$set"] if call_args[0] else call_args[1]["$set"]
    assert set_data["search_terms"] == ["ML Engineer"]
    assert "hacker_field" not in set_data


async def test_update_platform_accounts_encrypts_passwords(mock_db):
    mock_db.platform_accounts.update_one = AsyncMock()

    with patch("services.profile_service.encrypt_value", return_value="ENCRYPTED") as mock_enc:
        from services.profile_service import update_platform_accounts
        await update_platform_accounts(FAKE_USER_ID, {
            "linkedin_email": "test@example.com", "linkedin_password": "supersecret",
        })
        mock_enc.assert_called_once_with("supersecret")
        call_args = mock_db.platform_accounts.update_one.call_args
        set_data = call_args[0][1]["$set"] if call_args[0] else call_args[1]["$set"]
        assert set_data["linkedin_password"] == "ENCRYPTED"

async def test_delete_full_profile(mock_db):
    mock_db.users.find_one = AsyncMock(return_value={"_id": FAKE_USER_OID})
    mock_db.users.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[{"object_key": "resumes/f1.pdf"}])
    mock_db.resumes.find = MagicMock(return_value=mock_cursor)

    with patch("storage.delete_file_from_r2", new_callable=AsyncMock) as mock_r2:
        from services.profile_service import delete_full_profile
        result = await delete_full_profile(FAKE_USER_ID)
        assert result is True
        mock_r2.assert_called_once()
        mock_db.users.delete_one.assert_called_once()


async def test_delete_full_profile_invalid_id(mock_db):
    from services.profile_service import delete_full_profile
    assert await delete_full_profile("not-valid") is False


def test_clean_doc_strips_internal_fields():
    from services.profile_service import _clean_doc
    doc = {
        "_id": ObjectId(), "user_id": "abc",
        "first_name": "John", "_linkedin_raw_experience": [],
        "linkedin_cookies": [], "updated_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
    }
    cleaned = _clean_doc(doc)
    assert "_id" not in cleaned and "user_id" not in cleaned
    assert "_linkedin_raw_experience" not in cleaned
    assert cleaned["first_name"] == "John"


def test_clean_doc_handles_none():
    from services.profile_service import _clean_doc
    assert _clean_doc(None) == {}

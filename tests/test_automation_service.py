"""
Tests for services/automation_service.py
Covers: session lifecycle, extension auth, step/result reporting, pub/sub.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from tests.conftest import FAKE_USER_ID, FAKE_USER_OID


# ── Session Lifecycle ───────────────────────────────────────────────────────

async def test_start_session(mock_db):
    mock_db.automation_sessions.find_one = AsyncMock(return_value=None)
    mock_db.automation_sessions.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )

    from services.automation_service import start_session
    result = await start_session(FAKE_USER_ID, {"search_terms": ["Dev"]})

    assert result["status"] == "running"
    assert "session_id" in result
    mock_db.automation_sessions.insert_one.assert_called_once()


async def test_start_session_already_active(mock_db):
    mock_db.automation_sessions.find_one = AsyncMock(return_value={
        "_id": ObjectId(), "user_id": FAKE_USER_ID, "status": "running",
    })

    from services.automation_service import start_session
    with pytest.raises(ValueError, match="already active"):
        await start_session(FAKE_USER_ID)


async def test_pause_session(mock_db):
    mock_db.automation_sessions.update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )

    from services.automation_service import pause_session
    result = await pause_session(FAKE_USER_ID)
    assert result["status"] == "paused"


async def test_pause_no_running_session(mock_db):
    mock_db.automation_sessions.update_one = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )

    from services.automation_service import pause_session
    with pytest.raises(ValueError, match="No running session"):
        await pause_session(FAKE_USER_ID)


async def test_resume_session(mock_db):
    mock_db.automation_sessions.update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )

    from services.automation_service import resume_session
    result = await resume_session(FAKE_USER_ID)
    assert result["status"] == "running"


async def test_stop_session_sends_email(mock_db):
    session_doc = {
        "_id": ObjectId(), "user_id": FAKE_USER_ID, "status": "running",
        "total_applied": 5, "total_failed": 1, "total_skipped": 2,
    }
    mock_db.automation_sessions.find_one = AsyncMock(return_value=session_doc)
    mock_db.automation_sessions.update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )
    mock_db.users.find_one = AsyncMock(return_value={
        "_id": FAKE_USER_OID, "email": "test@example.com",
    })

    with patch("services.email_service.send_automation_summary", new_callable=AsyncMock) as mock_email:
        from services.automation_service import stop_session
        result = await stop_session(FAKE_USER_ID)

        assert result["status"] == "completed"
        mock_email.assert_called_once_with("test@example.com", 8, 5, 1, 2, "")


async def test_get_session_status_idle(mock_db):
    mock_db.automation_sessions.find_one = AsyncMock(return_value=None)

    from services.automation_service import get_session_status
    result = await get_session_status(FAKE_USER_ID)
    assert result["status"] == "idle"
    assert result["session"] is None


# ── Extension Heartbeat ─────────────────────────────────────────────────────

async def test_extension_heartbeat(mock_db):
    mock_db.extension_tokens.update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )

    from services.automation_service import extension_heartbeat
    result = await extension_heartbeat("valid-token", "1.2.3.4")
    assert result["message"] == "Heartbeat recorded"


async def test_extension_heartbeat_invalid_token(mock_db):
    mock_db.extension_tokens.update_one = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )

    from services.automation_service import extension_heartbeat
    with pytest.raises(ValueError, match="Invalid or revoked"):
        await extension_heartbeat("bad-token")


# ── Report Result ───────────────────────────────────────────────────────────

async def test_extension_report_result_applied(mock_db):
    session_id = "a1b2c3d4e5f6a1b2c3d4e5f6" # 24 hex chars for valid ObjectId
    mock_db.automation_sessions.update_one = AsyncMock()
    mock_db.automation_logs.insert_one = AsyncMock()

    with patch("services.jobs_service.create_application", new_callable=AsyncMock) as mock_create, \
         patch("services.automation_service.broadcast_update", new_callable=AsyncMock):
        from services.automation_service import extension_report_result
        result = await extension_report_result(FAKE_USER_ID, session_id, {
            "result": "Applied", "job_title": "SWE", "company": "ACME",
            "job_url": "https://example.com/job",
        })

        assert result["message"] == "Result recorded"
        mock_create.assert_called_once()
        mock_db.automation_sessions.update_one.assert_called_once()


async def test_extension_report_result_skipped(mock_db):
    session_id = "a1b2c3d4e5f6a1b2c3d4e5f6"
    mock_db.automation_sessions.update_one = AsyncMock()
    mock_db.automation_logs.insert_one = AsyncMock()

    with patch("services.jobs_service.create_application", new_callable=AsyncMock) as mock_create, \
         patch("services.automation_service.broadcast_update", new_callable=AsyncMock):
        from services.automation_service import extension_report_result
        await extension_report_result(FAKE_USER_ID, session_id, {
            "result": "Skipped", "job_title": "SWE", "company": "ACME",
        })

        mock_create.assert_not_called()


# ── Pub/Sub ─────────────────────────────────────────────────────────────────

async def test_subscribe_unsubscribe():
    from services.automation_service import (
        subscribe_to_updates, unsubscribe_from_updates,
        broadcast_update, _subscribers,
    )

    # Clean slate
    _subscribers.clear()

    queue = await subscribe_to_updates("user_x")
    assert "user_x" in _subscribers
    assert queue in _subscribers["user_x"]

    await broadcast_update("user_x", "hello")
    msg = await asyncio.wait_for(queue.get(), timeout=1)
    assert "hello" in msg

    await unsubscribe_from_updates("user_x", queue)
    assert "user_x" not in _subscribers

"""
Automation service: session management, extension auth, step tracking.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from bson import ObjectId
from database import get_db
from utils import generate_extension_token, create_access_token
from config import settings
from loguru import logger


# In-memory subscription manager for real-time updates (SSE)
_subscribers: Dict[str, List[asyncio.Queue]] = {}


# ── Session Management ──────────────────────────────────────────────────────

async def start_session(user_id: str, preferences: dict = None) -> dict:
    """Create a new automation session."""
    db = get_db()

    # Check for existing active session
    active = await db.automation_sessions.find_one(
        {"user_id": user_id, "status": {"$in": ["running", "paused"]}}
    )
    if active:
        raise ValueError("An automation session is already active")

    doc = {
        "user_id": user_id,
        "status": "running",
        "preferences": preferences or {},
        "total_applied": 0,
        "total_failed": 0,
        "total_skipped": 0,
        "started_at": datetime.now(timezone.utc),
        "ended_at": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.automation_sessions.insert_one(doc)
    session_id = str(result.inserted_id)

    logger.info(f"Automation session started: {session_id} for user {user_id}")
    return {"message": "Automation session started", "session_id": session_id, "status": "running"}


async def pause_session(user_id: str) -> dict:
    """Pause the active automation session."""
    db = get_db()

    result = await db.automation_sessions.update_one(
        {"user_id": user_id, "status": "running"},
        {"$set": {"status": "paused", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise ValueError("No running session found")

    return {"message": "Session paused", "status": "paused"}


async def resume_session(user_id: str) -> dict:
    """Resume a paused automation session."""
    db = get_db()

    result = await db.automation_sessions.update_one(
        {"user_id": user_id, "status": "paused"},
        {"$set": {"status": "running", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise ValueError("No paused session found")

    return {"message": "Session resumed", "status": "running"}


async def stop_session(user_id: str, background_tasks = None) -> dict:
    """Stop the active automation session."""
    db = get_db()

    # Fetch session to get stats for email
    session = await db.automation_sessions.find_one(
        {"user_id": user_id, "status": {"$in": ["running", "paused"]}}
    )
    if not session:
        raise ValueError("No active session found")

    result = await db.automation_sessions.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "status": "completed",
                "ended_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    # Send summary email
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user and user.get("email"):
            applied = session.get("total_applied", 0) or 0
            failed = session.get("total_failed", 0) or 0
            skipped = session.get("total_skipped", 0) or 0
            total = applied + failed + skipped
            
            if total > 0:
                from services.email_service import send_automation_summary
                if background_tasks:
                    background_tasks.add_task(send_automation_summary, user["email"], total, applied, failed, skipped, user.get("name", ""))
                else:
                    await send_automation_summary(user["email"], total, applied, failed, skipped, user.get("name", ""))
    except Exception as e:
        logger.error(f"Failed to send automation summary email: {e}")

    return {"message": "Session stopped", "status": "completed"}


async def get_session_status(user_id: str) -> dict:
    """Get the current automation session status."""
    db = get_db()

    session = await db.automation_sessions.find_one(
        {"user_id": user_id},
        sort=[("created_at", -1)],
    )

    if not session:
        return {"status": "idle", "session": None}

    return {
        "status": session.get("status", "idle"),
        "session": {
            "id": str(session["_id"]),
            "status": session.get("status"),
            "total_applied": session.get("total_applied", 0),
            "total_failed": session.get("total_failed", 0),
            "total_skipped": session.get("total_skipped", 0),
            "started_at": session["started_at"].isoformat() if session.get("started_at") else None,
            "ended_at": session["ended_at"].isoformat() if session.get("ended_at") else None,
        },
    }


async def get_session_logs(user_id: str, session_id: Optional[str] = None, limit: int = 50) -> dict:
    """Get automation logs for a session."""
    db = get_db()

    query = {"user_id": user_id}
    if session_id:
        query["session_id"] = session_id

    cursor = (
        db.automation_logs.find(query)
        .sort("timestamp", -1)
        .limit(min(limit, 200))
    )

    logs = []
    async for doc in cursor:
        logs.append(
            {
                "id": str(doc["_id"]),
                "session_id": doc.get("session_id", ""),
                "step": doc.get("step", ""),
                "status": doc.get("status", ""),
                "message": doc.get("message", ""),
                "data": doc.get("data", {}),
                "timestamp": doc["timestamp"].isoformat() if doc.get("timestamp") else None,
            }
        )

    return {"logs": logs}


# ── Extension Auth ──────────────────────────────────────────────────────────

# Deprecated: use new pairing flow instead.
async def extension_connect(
    user_id: str,
    device_name: str = "",
    ip_address: str = "",
    user_agent: str = "",
) -> dict:
    raise ValueError("Deprecated: use the new pairing flow endpoint /api/extension/pairing-code")


async def extension_heartbeat(token: str, ip_address: str = "") -> dict:
    """Update the extension's last activity timestamp."""
    db = get_db()

    result = await db.extension_tokens.update_one(
        {"token": token, "revoked": False},
        {"$set": {"last_active": datetime.now(timezone.utc), "ip_address": ip_address}},
    )

    if result.modified_count == 0:
        raise ValueError("Invalid or revoked extension token")

    return {"message": "Heartbeat recorded"}


async def validate_extension_token(token: str) -> Optional[str]:
    """Validate an extension token and return the user_id."""
    from utils import decode_token
    from database import get_db
    import hashlib
    db = get_db()

    try:
        payload = decode_token(token)
        if not payload or payload.get("type") != "extension":
            return None

        user_id = payload.get("sub")
        device_id = payload.get("device_id")
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Verify it hasn't been revoked in DB
        doc = await db.extension_sessions.find_one({"user_id": user_id, "device_id": device_id, "token_hash": token_hash, "is_active": True})
        if not doc:
            return None

        return user_id
    except Exception as e:
        logger.error(f"Error validating extension token: {e}")
        return None


async def extension_report_step(
    user_id: str, session_id: str, step: str, status: str, message: str = "", data: dict = None
) -> dict:
    """Log an automation step from the extension."""
    db = get_db()

    log_doc = {
        "user_id": user_id,
        "session_id": session_id,
        "step": step,
        "status": status,
        "message": message,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc),
    }
    await db.automation_logs.insert_one(log_doc)

    return {"message": "Step logged"}


async def extension_report_result(user_id: str, session_id: str, result_data: dict) -> dict:
    """Report a completed application result from the extension."""
    db = get_db()

    # Update session counters
    result_type = result_data.get("result", "Applied")
    inc_field = {
        "Applied": "total_applied",
        "Failed": "total_failed",
        "Skipped": "total_skipped",
    }.get(result_type, "total_applied")

    if session_id:
        try:
            # Only attempt update if session_id is a valid 24-char hex string
            if len(session_id) == 24 and all(c in "0123456789abcdef" for c in session_id.lower()):
                await db.automation_sessions.update_one(
                    {"_id": ObjectId(session_id)},
                    {
                        "$inc": {inc_field: 1},
                        "$set": {"updated_at": datetime.now(timezone.utc)},
                    },
                )
        except Exception as e:
            logger.warning(f"Failed to update session {session_id} stats: {e}")

    # Create job application record
    # ONLY if result is "Applied"
    from services.jobs_service import create_application
    
    job_title = result_data.get("job_title", "").strip()
    company = result_data.get("company", "").strip()
    
    # Ensure job_url is populated from job_link if missing
    if "job_url" not in result_data and "job_link" in result_data:
        result_data["job_url"] = result_data.get("job_link", "")

    if result_type == "Applied" and job_title and company:
        await create_application(user_id, result_data)
    elif result_type != "Applied":
        logger.info(f"Automation finished with {result_type} for user {user_id}. Skipping database application record.")
    else:
        logger.warning(f"Result reported with missing job_title or company for user {user_id}. Skipping application record.")

    # Log the result
    await extension_report_step(
        user_id, session_id,
        step="application_result",
        status=result_type,
        message=f"{result_data.get('job_title', '')} at {result_data.get('company', '')}",
        data=result_data,
    )

    # Broadcast update for real-time dashboard
    await broadcast_update(user_id, f"Application {result_type} for {result_data.get('job_title', 'Unknown Job')} at {result_data.get('company', 'Unknown Company')}")

    return {"message": "Result recorded"}


async def revoke_extension_token(user_id: str, token_id: str) -> dict:
    """Revoke a specific extension token."""
    db = get_db()

    result = await db.extension_tokens.update_one(
        {"_id": ObjectId(token_id), "user_id": user_id},
        {"$set": {"revoked": True}},
    )

    if result.modified_count == 0:
        raise ValueError("Token not found")

    return {"message": "Extension token revoked"}


async def list_extension_tokens(user_id: str, skip: int = 0, limit: int = 20) -> dict:
    """List all extension tokens for a user (paginated)."""
    db = get_db()

    total = await db.extension_tokens.count_documents({"user_id": user_id, "revoked": False})
    cursor = db.extension_tokens.find(
        {"user_id": user_id, "revoked": False}
    ).sort("created_at", -1).skip(skip).limit(limit)

    tokens = []
    async for doc in cursor:
        tokens.append(
            {
                "id": str(doc["_id"]),
                "device_name": doc.get("device_name", ""),
                "ip_address": doc.get("ip_address", ""),
                "last_active": doc["last_active"].isoformat() if doc.get("last_active") else None,
                "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
            }
        )
    return {"tokens": tokens, "total": total}


async def subscribe_to_updates(user_id: str) -> asyncio.Queue:
    """Create a new update queue for a user."""
    queue = asyncio.Queue()
    if user_id not in _subscribers:
        _subscribers[user_id] = []
    _subscribers[user_id].append(queue)
    return queue


async def unsubscribe_from_updates(user_id: str, queue: asyncio.Queue):
    """Remove an update queue for a user."""
    if user_id in _subscribers:
        if queue in _subscribers[user_id]:
            _subscribers[user_id].remove(queue)
        if not _subscribers[user_id]:
            del _subscribers[user_id]


async def broadcast_update(user_id: str, message: str):
    """Send an update to all active subscribers for a user."""
    if user_id in _subscribers:
        import json
        payload = json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), "message": message})
        for queue in _subscribers[user_id]:
            await queue.put(payload)

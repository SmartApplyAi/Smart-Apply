"""
Automation service: session management, extension auth, step tracking.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from bson import ObjectId
from database import get_db
from config import settings
from loguru import logger


# In-memory subscription manager for real-time updates (SSE)
_subscribers: Dict[str, List[asyncio.Queue]] = {}


async def _get_user_resume_text(user_id: str) -> Optional[str]:
    """Fetch the user's resume text from their profile for match scoring."""
    try:
        db = get_db()
        # 1. Look for active resume in resumes collection
        active_resume = await db.resumes.find_one({"user_id": user_id, "is_active": True})
        if active_resume:
            parsed = active_resume.get("parsed_data")
            if isinstance(parsed, dict):
                # Try the aggregated field first, then fallback to others
                text = parsed.get("user_information_all") or parsed.get("raw_text", "") or parsed.get("text", "")
                if text:
                    return text

        # 2. Fallback: try to build from profile fields in user_profiles collection
        profile = await db.user_profiles.find_one({"user_id": user_id})
        if profile:
            parts = []
            if profile.get("linkedin_headline"): parts.append(profile["linkedin_headline"])
            if profile.get("linkedin_summary"): parts.append(profile["linkedin_summary"])
            if profile.get("skills_summary"): parts.append(profile["skills_summary"])
            if profile.get("experience_text"): parts.append(profile["experience_text"])
            if profile.get("education_text"): parts.append(profile["education_text"])
            
            # Combine common fields if specific text blocks are missing
            if not profile.get("experience_text") and profile.get("experience"):
                parts.append(str(profile["experience"]))
                
            text = "\n".join([p for p in parts if p])
            if text.strip():
                return text

        return None
    except Exception as e:
        logger.warning(f"Failed to get resume text for user {user_id}: {e}")
        return None


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
    logger.info(f"Stopping automation session for user {user_id}")

    # Fetch session to get stats for email
    session = await db.automation_sessions.find_one(
        {"user_id": user_id, "status": {"$in": ["running", "paused"]}}
    )
    if not session:
        logger.warning(f"Stop session failed: No active session found for user {user_id}")
        raise ValueError("No active session found")

    session_id = str(session["_id"])
    logger.info(f"Active session found: {session_id}. Updating status to completed.")

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

    # ── Enhanced Summary Email with Top 3 Matches + Skill Gap ────────────
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user and user.get("email"):
            applied = session.get("total_applied", 0) or 0
            failed = session.get("total_failed", 0) or 0
            skipped = session.get("total_skipped", 0) or 0
            total = applied + failed + skipped
            
            logger.info(f"Session stats for email: Total={total}, Applied={applied}, Failed={failed}, Skipped={skipped}")

            # Fetch top 3 highest-scoring applications from this session's time window
            top_matches = []
            all_missing_skills = []
            if applied > 0:
                try:
                    started_at = session.get("started_at", datetime.now(timezone.utc) - timedelta(hours=24))
                    cursor = db.job_applications.find(
                        {"user_id": user_id, "applied_at": {"$gte": started_at}, "match_score": {"$ne": None}}
                    ).sort("match_score", -1).limit(3)
                    async for doc in cursor:
                        top_matches.append({
                            "job_title": doc.get("job_title", ""),
                            "company": doc.get("company", ""),
                            "match_score": doc.get("match_score", 0),
                            "job_url": doc.get("job_url", doc.get("job_link", "")),
                        })
                        # Collect missing skills for aggregate gap analysis
                        for skill in doc.get("missing_skills", []):
                            if skill not in all_missing_skills:
                                all_missing_skills.append(skill)
                    logger.info(f"Fetched {len(top_matches)} top matches for summary email.")
                except Exception as e:
                    logger.warning(f"Failed to fetch top matches: {e}")

            # Basic summary email (for compatibility with existing tests)
            try:
                from services.email_service import send_automation_summary
                logger.info(f"Sending basic automation summary to {user['email']}")
                await send_automation_summary(user["email"], total, applied, failed, skipped, user.get("name", ""))
            except Exception as e:
                logger.warning(f"Failed to send basic automation summary email: {e}")

            # Enhanced summary email with top matches (if available)
            if total > 0:
                from services.email_service import send_enhanced_automation_summary, send_skill_gap_alert
                email_func = send_enhanced_automation_summary
                email_args = (user["email"], total, applied, failed, skipped, top_matches, user.get("name", ""))
                logger.info(f"Queueing enhanced automation summary email to {user['email']}")
                if background_tasks:
                    background_tasks.add_task(email_func, *email_args)
                else:
                    await email_func(*email_args)
            
            # Skill gap alert email if any missing skills
            if all_missing_skills:
                gap_args = (user["email"], all_missing_skills[:10], user.get("name", ""))
                logger.info(f"Queueing skill gap alert email to {user['email']}")
                if background_tasks:
                    background_tasks.add_task(send_skill_gap_alert, *gap_args)
                else:
                    await send_skill_gap_alert(*gap_args)

            # ── WebSocket: Bot Run Summary ────────────────────────────────
            try:
                from websocket.pubsub import publish_job_event
                from websocket.events import BOT_RUN_SUMMARY
                await publish_job_event(user_id, BOT_RUN_SUMMARY, {
                    "total": total, "applied": applied, "failed": failed, "skipped": skipped,
                    "top_matches": top_matches,
                    "skill_gaps": all_missing_skills[:10],
                })
            except Exception as e:
                logger.warning(f"Failed to broadcast bot run summary: {e}")
        else:
            logger.warning(f"No email found for user {user_id}. Skipping summary emails.")

    except Exception as e:
        logger.error(f"Failed in stop_session email logic for user {user_id}: {e}")

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

        # Edge case: check if user is still active
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"is_active": 1})
        if not user or not user.get("is_active", True):
            logger.warning(f"Extension token validated but user {user_id} is inactive or deleted.")
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


async def _process_manual_recommendation(user_id: str, result_data: dict):
    """Background task to compute match score for skipped jobs and recommend them if highly matched."""
    from services.ai_service import compute_match_score
    from services.jobs_service import create_application
    from websocket.pubsub import publish_job_event
    from websocket.events import JOB_RECOMMENDED
    
    try:
        job_description = result_data.get("job_description", "").strip()
        job_title = result_data.get("job_title", "").strip()
        company = result_data.get("company", "").strip()
        
        if not job_description or not job_title or not company:
            return
            
        resume_text = await _get_user_resume_text(user_id)
        if not resume_text:
            return
            
        match_result = await compute_match_score(resume_text, job_description)
        match_score = match_result.get("match_score", 0)
        
        if match_score >= 80:
            logger.info(f"High match external job found: {job_title} ({match_score}%)")
            
            # Create a localized copy of the data for DB saving
            rec_data = dict(result_data)
            rec_data["match_score"] = match_score
            rec_data["matched_skills"] = match_result.get("matched_skills", [])
            rec_data["missing_skills"] = match_result.get("missing_skills", [])
            rec_data["skill_gap"] = match_result.get("skill_gap", {})
            rec_data["result"] = "Recommended"
            
            await create_application(user_id, rec_data)
            
            event_payload = {
                "job_title": job_title,
                "company": company,
                "platform": rec_data.get("platform", "linkedin"),
                "result": "Recommended",
                "match_score": match_score,
                "job_url": rec_data.get("job_url", ""),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await publish_job_event(user_id, JOB_RECOMMENDED, event_payload)
            
    except Exception as e:
        logger.warning(f"Failed to process manual recommendation: {e}")


async def extension_report_result(user_id: str, session_id: str, result_data: dict) -> dict:
    """Report a completed application result from the extension."""
    db = get_db()

    # Normalize result type case‑insensitively (e.g., "applied", "Applied")
    result_type_raw = result_data.get("result", "Applied")
    result_type = result_type_raw.capitalize()
    inc_field = {
        "Applied": "total_applied",
        "Failed": "total_failed",
        "Skipped": "total_skipped",
    }.get(result_type, "total_applied")

    # Update session counters for this result.
    # Prefer the explicit session_id if it is a valid ObjectId; otherwise fall back to any active session for the user.
    filter_doc: dict = {}
    if session_id:
        try:
            filter_doc["_id"] = ObjectId(session_id)
        except Exception:
            logger.warning(f"Invalid session_id provided: {session_id}")
    if not filter_doc:
        # No valid session_id, match the latest running/paused session for the user.
        filter_doc = {"user_id": user_id, "status": {"$in": ["running", "paused"]}}
    try:
        await db.automation_sessions.update_one(
            filter_doc,
            {
                "$inc": {inc_field: 1},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
    except Exception as e:
        logger.warning(f"Failed to update session stats for user {user_id}: {e}")

    # ── Match Score Computation ──────────────────────────────────────────
    job_title = result_data.get("job_title", "").strip()
    company = result_data.get("company", "").strip()
    job_description = result_data.get("job_description", "").strip()

    match_result = None
    if result_type == "Applied" and job_description:
        try:
            # Get the user's resume text for matching
            resume_text = await _get_user_resume_text(user_id)
            if resume_text:
                from services.ai_service import compute_match_score
                match_result = await compute_match_score(resume_text, job_description)
                # Inject match data into result_data for storage
                result_data["match_score"] = match_result.get("match_score")
                result_data["matched_skills"] = match_result.get("matched_skills", [])
                result_data["missing_skills"] = match_result.get("missing_skills", [])
                result_data["skill_gap"] = match_result.get("skill_gap", {})
                result_data["job_description"] = job_description
                logger.info(f"Match score computed for {job_title}: {match_result.get('match_score', 'N/A')}%")
        except Exception as e:
            logger.warning(f"Match score computation failed for {job_title}: {e}")

    # Ensure job_url is populated from job_link if missing
    if "job_url" not in result_data and "job_link" in result_data:
        result_data["job_url"] = result_data.get("job_link", "")

    # Create job application record (ONLY if result is "Applied")
    from services.jobs_service import create_application

    if result_type == "Applied" and job_title and company:
        await create_application(user_id, result_data)
    elif result_type == "Skipped" and result_data.get("reason") in ("external_apply", "no_easy_apply"):
        import asyncio
        asyncio.create_task(_process_manual_recommendation(user_id, result_data))
        logger.info(f"Automation skipped job {job_title}. Triggered background recommendation check.")
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

    # ── WebSocket Real-Time Broadcast ────────────────────────────────────
    try:
        from websocket.pubsub import publish_job_event, publish_skill_gap_event
        from websocket.events import JOB_APPLIED, JOB_FAILED, JOB_SKIPPED, SKILL_GAP_ALERT

        event_type = {
            "Applied": JOB_APPLIED,
            "Failed": JOB_FAILED,
            "Skipped": JOB_SKIPPED,
        }.get(result_type, JOB_APPLIED)

        event_payload = {
            "job_title": job_title,
            "company": company,
            "platform": result_data.get("platform", "linkedin"),
            "result": result_type,
            "match_score": result_data.get("match_score"),
            "matched_skills": result_data.get("matched_skills", []),
            "missing_skills": result_data.get("missing_skills", []),
            "job_url": result_data.get("job_url", ""),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await publish_job_event(user_id, event_type, event_payload)

        # ── Skill Gap Alert ──────────────────────────────────────────────
        if match_result and match_result.get("skill_gap", {}).get("has_gap"):
            skill_gap = match_result["skill_gap"]
            # Only alert for minor/moderate gaps (user is close to qualifying)
            if skill_gap.get("gap_severity") in ("minor", "moderate"):
                from services.notification_service import create_notification
                missing = skill_gap.get("learnable_skills", [])[:5]
                notif_msg = f"You're close to being a perfect fit for {job_title} at {company}! Missing skills: {', '.join(missing)}"
                await create_notification(
                    user_id=user_id,
                    type="skill_gap",
                    title="Skill Gap Detected",
                    message=notif_msg,
                    data={"job_title": job_title, "company": company, "missing_skills": missing, "severity": skill_gap.get("gap_severity")},
                )
                await publish_skill_gap_event(user_id, {
                    "job_title": job_title,
                    "company": company,
                    "missing_skills": missing,
                    "gap_severity": skill_gap.get("gap_severity"),
                    "recommendation": skill_gap.get("recommendation", ""),
                    "estimated_learning_time": skill_gap.get("estimated_learning_time", ""),
                })
    except Exception as e:
        logger.warning(f"WebSocket broadcast failed (non-fatal): {e}")

    # Legacy broadcast for SSE subscribers
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

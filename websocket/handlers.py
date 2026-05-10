"""
WebSocket event handlers.
Routes typed events to the correct user's WebSocket connections.
"""

import json
from loguru import logger
from websocket.manager import manager
from websocket import events


async def handle_job_event(user_id: str, event_type: str, job_data: dict):
    """
    Broadcast a job application event to the user's dashboard in real-time.
    
    job_data expected keys:
        - job_title, company, platform, result
        - match_score (optional), matched_skills (optional), missing_skills (optional)
        - job_url (optional)
    """
    payload = {
        "type": event_type,
        "payload": {
            "job_title": job_data.get("job_title", ""),
            "company": job_data.get("company", ""),
            "platform": job_data.get("platform", "linkedin"),
            "result": job_data.get("result", ""),
            "match_score": job_data.get("match_score"),
            "matched_skills": job_data.get("matched_skills", []),
            "missing_skills": job_data.get("missing_skills", []),
            "job_url": job_data.get("job_url", ""),
            "timestamp": job_data.get("timestamp"),
        },
    }
    await manager.send_typed_event(user_id, event_type, payload["payload"])
    logger.debug(f"WS event {event_type} sent to user {user_id}: {job_data.get('job_title', '?')}")


async def handle_skill_gap_event(user_id: str, skill_gap_data: dict):
    """
    Broadcast a skill gap alert to the user's dashboard.
    
    skill_gap_data expected keys:
        - missing_skills, gap_severity, recommendation, job_title, company
    """
    payload = {
        "missing_skills": skill_gap_data.get("missing_skills", []),
        "gap_severity": skill_gap_data.get("gap_severity", "minor"),
        "recommendation": skill_gap_data.get("recommendation", ""),
        "job_title": skill_gap_data.get("job_title", ""),
        "company": skill_gap_data.get("company", ""),
        "estimated_learning_time": skill_gap_data.get("estimated_learning_time", ""),
    }
    await manager.send_typed_event(user_id, events.SKILL_GAP_ALERT, payload)
    logger.info(f"Skill gap alert sent to user {user_id}: {len(payload['missing_skills'])} missing skills")


async def handle_bot_run_summary(user_id: str, summary_data: dict):
    """
    Broadcast an automation run summary when a bot session completes.
    
    summary_data expected keys:
        - total, applied, failed, skipped
        - top_matches (list of top 3 jobs with match scores)
        - skill_gaps (aggregated missing skills)
    """
    await manager.send_typed_event(user_id, events.BOT_RUN_SUMMARY, summary_data)
    logger.info(f"Bot run summary sent to user {user_id}")


async def handle_automation_progress(user_id: str, progress_data: dict):
    """
    Broadcast automation progress update (counters).
    """
    await manager.send_typed_event(user_id, events.AUTOMATION_PROGRESS, progress_data)

"""
Audit service: logs sensitive actions for security and compliance.
"""

from datetime import datetime, timezone
from database import get_db
from loguru import logger


async def log_action(
    user_id: str,
    action: str,
    resource: str = "",
    ip_address: str = "",
    user_agent: str = "",
    metadata: dict = None,
) -> None:
    """Log a sensitive action to the audit_logs collection."""
    db = get_db()

    doc = {
        "user_id": user_id,
        "action": action,
        "resource": resource,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc),
    }

    await db.audit_logs.insert_one(doc)
    logger.debug(f"Audit: {action} by {user_id} on {resource}")


async def get_audit_logs(user_id: str, skip: int = 0, limit: int = 50) -> list:
    """Get audit logs for a user."""
    db = get_db()

    cursor = (
        db.audit_logs.find({"user_id": user_id})
        .sort("created_at", -1)
        .skip(skip)
        .limit(min(limit, 200))
    )

    logs = []
    async for doc in cursor:
        logs.append({
            "id": str(doc["_id"]),
            "action": doc.get("action", ""),
            "resource": doc.get("resource", ""),
            "ip_address": doc.get("ip_address", ""),
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        })

    return logs

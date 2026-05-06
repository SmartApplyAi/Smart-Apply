"""
Notification service: create, list, mark-read, delete notifications.
"""

from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from database import get_db
from loguru import logger


async def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    data: dict = None,
) -> dict:
    """Create a new notification for a user."""
    db = get_db()

    doc = {
        "user_id": user_id,
        "type": type,
        "title": title,
        "message": message,
        "data": data or {},
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.notifications.insert_one(doc)

    return {"id": str(result.inserted_id), "message": "Notification created"}


async def list_notifications(
    user_id: str, skip: int = 0, limit: int = 20, unread_only: bool = False
) -> dict:
    """List notifications for a user with pagination."""
    db = get_db()

    query = {"user_id": user_id}
    if unread_only:
        query["read"] = False

    total = await db.notifications.count_documents(query)

    cursor = (
        db.notifications.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(min(limit, 100))
    )

    notifications = []
    async for doc in cursor:
        notifications.append({
            "id": str(doc["_id"]),
            "type": doc.get("type", ""),
            "title": doc.get("title", ""),
            "message": doc.get("message", ""),
            "data": doc.get("data", {}),
            "read": doc.get("read", False),
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        })

    return {"notifications": notifications, "total": total}


async def mark_read(user_id: str, notification_id: str) -> dict:
    """Mark a notification as read."""
    db = get_db()

    result = await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": user_id},
        {"$set": {"read": True}},
    )

    if result.modified_count == 0:
        raise ValueError("Notification not found")

    return {"message": "Notification marked as read"}


async def mark_all_read(user_id: str) -> dict:
    """Mark all notifications as read."""
    db = get_db()

    result = await db.notifications.update_many(
        {"user_id": user_id, "read": False},
        {"$set": {"read": True}},
    )

    return {"message": f"{result.modified_count} notifications marked as read"}


async def delete_notification(user_id: str, notification_id: str) -> dict:
    """Delete a notification."""
    db = get_db()

    result = await db.notifications.delete_one(
        {"_id": ObjectId(notification_id), "user_id": user_id}
    )

    if result.deleted_count == 0:
        raise ValueError("Notification not found")

    return {"message": "Notification deleted"}


async def get_unread_count(user_id: str) -> int:
    """Get the count of unread notifications."""
    db = get_db()
    return await db.notifications.count_documents({"user_id": user_id, "read": False})

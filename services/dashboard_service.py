"""
Dashboard service: aggregated data for the dashboard page.
"""

from datetime import datetime, timedelta, timezone
import asyncio
from bson import ObjectId
from database import get_db


async def get_summary(user_id: str) -> dict:
    """Get dashboard summary with all key stats."""
    db = get_db()

    # Aggregated Job stats in one go
    stats_pipeline = [
        {"$match": {"user_id": user_id}},
        {
            "$facet": {
                "counts": [
                    {
                        "$group": {
                            "_id": None,
                            "total": {"$sum": 1},
                            "applied": {"$sum": {"$cond": [{"$eq": ["$result", "Applied"]}, 1, 0]}},
                            "viewed": {"$sum": {"$cond": [{"$eq": ["$result", "Viewed"]}, 1, 0]}},
                            "interview": {"$sum": {"$cond": [{"$or": [{"$eq": ["$result", "Interview"]}, {"$eq": ["$status", "interviewed"]}]}, 1, 0]}},
                            "offer": {"$sum": {"$cond": [{"$eq": ["$result", "Offer"]}, 1, 0]}},
                            "failed": {"$sum": {"$cond": [{"$eq": ["$result", "Failed"]}, 1, 0]}},
                            "skipped": {"$sum": {"$cond": [{"$eq": ["$result", "Skipped"]}, 1, 0]}},
                            "pending": {"$sum": {"$cond": [{"$in": ["$status", ["queued", "in_progress"]]}, 1, 0]}},
                        }
                    }
                ],
                "platforms": [
                    {"$group": {"_id": "$platform", "count": {"$sum": 1}}}
                ],
                "recent": [
                    {"$sort": {"applied_at": -1}},
                    {"$limit": 5}
                ],
                "activity": [
                    {
                        "$addFields": {
                            # Fallback chain: applied_at -> created_at -> current date (as last resort)
                            "activity_date": {"$ifNull": ["$applied_at", "$created_at", datetime.now(timezone.utc)]}
                        }
                    },
                    # Ensure we have a valid date for the match
                    {"$match": {"activity_date": {"$ne": None}}},
                    {"$match": {"activity_date": {"$gte": datetime.now(timezone.utc) - timedelta(days=7)}}},
                    {"$group": {
                        "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$activity_date"}},
                        "count": {"$sum": 1}
                    }},
                    {"$sort": {"_id": 1}}
                ]
            }
        }
    ]
    
    result = await db.job_applications.aggregate(stats_pipeline).to_list(length=1)
    stats_data = result[0] if result else {"counts": [], "platforms": [], "recent": []}
    
    counts = stats_data["counts"][0] if stats_data["counts"] else {}
    
    total = counts.get("total", 0)
    applied = counts.get("applied", 0)
    viewed = counts.get("viewed", 0)
    interview = counts.get("interview", 0)
    offer = counts.get("offer", 0)
    failed = counts.get("failed", 0)
    skipped = counts.get("skipped", 0)
    pending = counts.get("pending", 0)

    platforms = {p["_id"]: p["count"] for p in stats_data["platforms"] if p["_id"]}

    # Convert recent apps to list
    recent_apps = []
    for app in stats_data.get("recent", []):
        app["_id"] = str(app["_id"])
        if "applied_at" in app and app["applied_at"]:
            app["applied_at"] = app["applied_at"].isoformat()
        recent_apps.append(app)

    # Automation status, Unread notifications, Profile info, and User doc in parallel
    results = await asyncio.gather(
        db.automation_sessions.find_one({"user_id": user_id, "status": {"$in": ["running", "paused"]}}),
        db.notifications.count_documents({"user_id": user_id, "read": False}),
        db.user_profiles.find_one({"user_id": user_id}, {"first_name": 1, "last_name": 1}),
        db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1})
    )
    
    active_session = results[0]
    unread_notifs = results[1]
    p = results[2] or {}
    user_doc = results[3] or {}
    
    return {
        "total": total,
        "applied": applied,
        "viewed": viewed,
        "interview": interview,
        "offer": offer,
        "failed": failed,
        "skipped": skipped,
        "by_platform": platforms,
        "pending_tasks": pending,
        "unread_notifications": unread_notifs,
        "automation_status": active_session.get("status") if active_session else "idle",
        "success_rate": round((applied / total * 100), 1) if total > 0 else 0,
        "recent_applications": recent_apps,
        "user_profile": {
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "email": user_doc.get("email", ""), 
        },
        "activity": _fill_activity_gaps(stats_data.get("activity", []))
    }


def _fill_activity_gaps(data: list) -> dict:
    """Ensure we return exactly 7 values for the last 7 days with labels."""
    now = datetime.now(timezone.utc)
    date_objs = [now - timedelta(days=i) for i in range(6, -1, -1)]
    dates = [d.strftime("%Y-%m-%d") for d in date_objs]
    labels = [d.strftime("%a") for d in date_objs]
    
    mapping = {d["_id"]: d["count"] for d in data}
    return {
        "counts": [mapping.get(d, 0) for d in dates],
        "labels": labels
    }


async def get_recent_applications(user_id: str, limit: int = 10) -> list:
    """Get the most recent applications."""
    db = get_db()

    cursor = (
        db.job_applications.find({"user_id": user_id})
        .sort("applied_at", -1)
        .limit(limit)
    )

    apps = []
    async for doc in cursor:
        apps.append({
            "id": str(doc["_id"]),
            "job_title": doc.get("job_title", ""),
            "company": doc.get("company", ""),
            "platform": doc.get("platform", ""),
            "result": doc.get("result", ""),
            "applied_at": doc["applied_at"].isoformat() if doc.get("applied_at") else None,
            "job_link": doc.get("job_link", ""),
        })
    return apps


async def get_activity_feed(user_id: str, limit: int = 20) -> list:
    """Get recent activity (applications + automation events)."""
    db = get_db()

    # Merge recent applications and automation logs
    activities = []

    # Recent applications
    app_cursor = (
        db.job_applications.find({"user_id": user_id})
        .sort("applied_at", -1)
        .limit(limit)
    )
    async for doc in app_cursor:
        activities.append({
            "type": "application",
            "title": f"{doc.get('result', 'Applied')}: {doc.get('job_title', '')}",
            "subtitle": doc.get("company", ""),
            "timestamp": doc["applied_at"].isoformat() if doc.get("applied_at") else None,
        })

    # Recent automation logs
    log_cursor = (
        db.automation_logs.find({"user_id": user_id})
        .sort("timestamp", -1)
        .limit(limit)
    )
    async for doc in log_cursor:
        activities.append({
            "type": "automation",
            "title": doc.get("step", ""),
            "subtitle": doc.get("message", ""),
            "timestamp": doc["timestamp"].isoformat() if doc.get("timestamp") else None,
        })

    # Sort by timestamp descending
    activities.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return activities[:limit]


async def get_stats_by_period(user_id: str, period: str = "week") -> list:
    """Get application stats grouped by day/week/month for graphs."""
    db = get_db()

    now = datetime.now(timezone.utc)
    if period == "day":
        start = now - timedelta(days=7)
        group_format = "%Y-%m-%d"
    elif period == "month":
        start = now - timedelta(days=180)
        group_format = "%Y-%m"
    else:  # week
        start = now - timedelta(days=30)
        group_format = "%Y-%m-%d"

    pipeline = [
        {"$match": {"user_id": user_id, "applied_at": {"$gte": start}}},
        {
            "$group": {
                "_id": {"$dateToString": {"format": group_format, "date": "$applied_at"}},
                "total": {"$sum": 1},
                "applied": {"$sum": {"$cond": [{"$eq": ["$result", "Applied"]}, 1, 0]}},
                "failed": {"$sum": {"$cond": [{"$eq": ["$result", "Failed"]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    data = []
    async for doc in db.job_applications.aggregate(pipeline):
        data.append({
            "date": doc["_id"],
            "total": doc["total"],
            "applied": doc["applied"],
            "failed": doc["failed"],
        })

    return data

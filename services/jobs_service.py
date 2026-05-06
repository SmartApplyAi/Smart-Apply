"""
Jobs service: application tracking, stats, history.
"""

from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from database import get_db
from loguru import logger





async def get_stats(user_id: str) -> dict:
    """Get aggregated application stats for the dashboard using a single aggregation."""
    db = get_db()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"user_id": user_id}},
        {
            "$facet": {
                "counts": [
                    {
                        "$group": {
                            "_id": None,
                            "total": {"$sum": 1},
                            "applied": {"$sum": {"$cond": [{"$eq": ["$result", "Applied"]}, 1, 0]}},
                            "failed": {"$sum": {"$cond": [{"$eq": ["$result", "Failed"]}, 1, 0]}},
                            "skipped": {"$sum": {"$cond": [{"$eq": ["$result", "Skipped"]}, 1, 0]}},
                        }
                    }
                ],
                "interviews": [
                    {"$match": {"status": "interviewed"}},
                    {"$count": "count"}
                ],
                "applied_today": [
                    {"$match": {"applied_at": {"$gte": today_start}}},
                    {"$count": "count"}
                ],
                "platforms": [
                    {"$group": {"_id": "$platform", "count": {"$sum": 1}}}
                ]
            }
        }
    ]

    cursor = db.job_applications.aggregate(pipeline)
    results = await cursor.to_list(None)
    data = results[0] if results else {}

    # Post-process the facet results
    counts = data.get("counts", [{}])[0] if data.get("counts") else {}
    interviews = data.get("interviews", [{}])[0].get("count", 0) if data.get("interviews") else 0
    applied_today = data.get("applied_today", [{}])[0].get("count", 0) if data.get("applied_today") else 0
    
    platforms = {}
    for p in data.get("platforms", []):
        if p["_id"]:
            platforms[p["_id"]] = p["count"]

    return {
        "total": counts.get("total", 0),
        "applied": counts.get("applied", 0),
        "failed": counts.get("failed", 0),
        "skipped": counts.get("skipped", 0),
        "interviews": interviews,
        "applied_today": applied_today,
        "by_platform": platforms,
    }


async def get_public_stats() -> dict:
    """Get global aggregate stats for the landing page."""
    db = get_db()
    
    total = await db.job_applications.count_documents({})
    interviews = await db.job_applications.count_documents({"status": "interviewed"})
    
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total_today = await db.job_applications.count_documents({"applied_at": {"$gte": today_start}})
    
    # Return actual database counts
    return {
        "total": total,
        "interviews": interviews,
        "total_today": total_today
    }


async def get_history(
    user_id: str,
    skip: int = 0,
    limit: int = 20,
    result: Optional[str] = None,
    q: Optional[str] = None,
) -> dict:
    """Get paginated application history."""
    db = get_db()

    query = {"user_id": user_id}
    if result:
        query["result"] = result
    
    if q:
        try:
            query["$text"] = {"$search": q}
            total = await db.job_applications.count_documents(query)
        except Exception as e:
            logger.warning(f"Text search failed (index might be missing): {e}")
            # Fallback: regex search if text index fails
            del query["$text"]
            query["$or"] = [
                {"job_title": {"$regex": q, "$options": "i"}},
                {"company": {"$regex": q, "$options": "i"}}
            ]
            total = await db.job_applications.count_documents(query)
    else:
        total = await db.job_applications.count_documents(query)

    cursor = (
        db.job_applications.find(query)
        .sort("applied_at", -1)
        .skip(skip)
        .limit(min(limit, 100))
    )

    applications = []
    async for doc in cursor:
        applications.append(
            {
                "id": str(doc["_id"]),
                "job_title": doc.get("job_title", ""),
                "company": doc.get("company", ""),
                "platform": doc.get("platform", ""),
                "result": doc.get("result", ""),
                "status": doc.get("status", ""),
                "job_link": doc.get("job_link", ""),
                "job_url": doc.get("job_url", ""),
                "applied_at": (
                    doc["applied_at"].isoformat() if doc.get("applied_at") else None
                ),
                "error_detail": doc.get("error_detail", ""),
                "notes": doc.get("notes", ""),
                "source": doc.get("source", "automation"),
                "resume_used": doc.get("resume_used", ""),
            }
        )

    return {"applications": applications, "total": total}


async def create_application(user_id: str, data: dict) -> dict:
    """Create a new job application record."""
    db = get_db()
    
    job_title = data.get("job_title", "").strip()
    company = data.get("company", "").strip()
    job_link = data.get("job_link") or data.get("job_url")
    
    # 1. Deduplication check (avoid literal "unknown" matching)
    query = {"user_id": user_id}
    if job_title and job_title != "unknown" and company and company != "unknown":
        query["job_title"] = job_title
        query["company"] = company
    elif job_link and job_link != "unknown":
        # For links, we also check if it was applied today to allow re-applying on different days if needed
        # (Though usually links are globally unique for a user, sometimes they want to track again)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # Not enough info to dedup, skip search
        existing = None
    
    if not query.get("_id") and query.get("user_id"):
        # Only run query if we actually have dedup criteria beyond just user_id
        if len(query) > 1:
            existing = await db.job_applications.find_one(query)
        else:
            existing = None
    else:
        existing = None
    
    if existing:
        logger.info(f"Duplicate application skipped for {job_title} at {company}")
        return {"message": "Application recorded (duplicate skipped)", "id": str(existing["_id"]), "is_duplicate": True}

    doc = {
        "user_id": user_id,
        "job_title": job_title,
        "company": company,
        "platform": data.get("platform", "linkedin"),
        "job_url": data.get("job_url", ""),
        "job_link": data.get("job_link", data.get("job_url", "")),
        "result": data.get("result", "Applied"),
        "status": data.get("status", "submitted"),
        "error_detail": data.get("error_detail", ""),
        "notes": data.get("notes", ""),
        "source": data.get("source", "automation"),
        "resume_used": data.get("resume_used", ""),
        "cover_letter_used": data.get("cover_letter_used", ""),
        "is_auto_applied": data.get("is_auto_applied", True),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "applied_at": datetime.now(timezone.utc)
    }

    result = await db.job_applications.insert_one(doc)
    logger.info(f"New job application recorded: {job_title} at {company}")
    return {"message": "Application recorded", "id": str(result.inserted_id)}


async def update_application(user_id: str, app_id: str, data: dict) -> dict:
    """Update an existing application."""
    db = get_db()

    allowed_fields = {
        "job_title", "company", "platform", "job_url", "job_link",
        "result", "status", "error_detail", "notes", "source",
    }

    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.job_applications.update_one(
        {"_id": ObjectId(app_id), "user_id": user_id},
        {"$set": update_data},
    )

    if result.modified_count == 0:
        raise ValueError("Application not found")

    return {"message": "Application updated"}


async def delete_application(user_id: str, app_id: str) -> dict:
    """Delete a job application."""
    db = get_db()

    result = await db.job_applications.delete_one(
        {"_id": ObjectId(app_id), "user_id": user_id}
    )
    if result.deleted_count == 0:
        raise ValueError("Application not found")

    return {"message": "Application deleted"}


async def get_application(user_id: str, app_id: str) -> dict:
    """Get a single application by ID."""
    db = get_db()

    doc = await db.job_applications.find_one(
        {"_id": ObjectId(app_id), "user_id": user_id}
    )
    if not doc:
        raise ValueError("Application not found")

    return {
        "id": str(doc["_id"]),
        "job_title": doc.get("job_title", ""),
        "company": doc.get("company", ""),
        "platform": doc.get("platform", ""),
        "result": doc.get("result", ""),
        "status": doc.get("status", ""),
        "job_url": doc.get("job_url", ""),
        "job_link": doc.get("job_link", ""),
        "applied_at": doc["applied_at"].isoformat() if doc.get("applied_at") else None,
        "error_detail": doc.get("error_detail", ""),
        "notes": doc.get("notes", ""),
        "source": doc.get("source", ""),
        "resume_used": str(doc.get("resume_used", "")),
        "cover_letter_used": str(doc.get("cover_letter_used", "")),
        "is_auto_applied": doc.get("is_auto_applied", False),
    }


async def get_recent_applications(user_id: str, limit: int = 10) -> list:
    """Get the most recent applications for the dashboard."""
    db = get_db()

    cursor = (
        db.job_applications.find({"user_id": user_id})
        .sort("applied_at", -1)
        .limit(limit)
    )

    apps = []
    async for doc in cursor:
        apps.append(
            {
                "id": str(doc["_id"]),
                "job_title": doc.get("job_title", ""),
                "company": doc.get("company", ""),
                "platform": doc.get("platform", ""),
                "result": doc.get("result", ""),
                "applied_at": (
                    doc["applied_at"].isoformat() if doc.get("applied_at") else None
                ),
            }
        )
    return apps


async def batch_create_applications(user_id: str, applications: list) -> dict:
    """Bulk insert applications (from extension batch reports) with optimized dedup."""
    db = get_db()
    
    # 1. Collect all unique job links for bulk check
    all_links = list(set(
        app.get("job_link") or app.get("job_url", "") 
        for app in applications 
        if app.get("job_link") or app.get("job_url")
    ))
    
    # 2. Bulk query existing links (check both job_link and job_url fields)
    existing_links = set()
    if all_links:
        # Use a single query with $or to check both potential fields
        cursor = db.job_applications.find(
            {"user_id": user_id, "$or": [{"job_link": {"$in": all_links}}, {"job_url": {"$in": all_links}}]},
            {"job_link": 1, "job_url": 1}
        )
        async for doc in cursor:
            if doc.get("job_link"): existing_links.add(doc["job_link"])
            if doc.get("job_url"): existing_links.add(doc["job_url"])
    
    # 3. Filter and prepare documents
    docs = []
    now = datetime.now(timezone.utc)
    skipped = 0
    for app in applications:
        # Check if either link or url exists in our database set
        job_link = app.get("job_link")
        job_url = app.get("job_url")
        
        is_duplicate = False
        if job_link and job_link in existing_links:
            is_duplicate = True
        elif job_url and job_url in existing_links:
            is_duplicate = True
            
        if is_duplicate:
            skipped += 1
            continue

        docs.append(
            {
                "user_id": user_id,
                "job_title": app.get("job_title", ""),
                "company": app.get("company", ""),
                "platform": app.get("platform", "linkedin"),
                "job_url": app.get("job_url", ""),
                "job_link": job_link,
                "result": app.get("result", "Applied"),
                "status": app.get("status", "submitted"),
                "error_detail": app.get("error_detail", ""),
                "source": "automation",
                "is_auto_applied": True,
                "applied_at": now,
                "created_at": now,
                "updated_at": now,
            }
        )

    if docs:
        from pymongo.errors import BulkWriteError
        try:
            result = await db.job_applications.insert_many(docs, ordered=False)
            logger.info(f"Batch created {len(result.inserted_ids)} applications for user {user_id}")
            return {"message": f"{len(result.inserted_ids)} applications recorded"}
        except BulkWriteError as bwe:
            # Some succeeded, some failed. result might not be fully populated.
            success_count = bwe.details.get("nInserted", 0)
            logger.warning(f"Batch insert partial success: {success_count} inserted, {len(bwe.details.get('writeErrors', []))} duplicates/errors")
            return {"message": f"{success_count} applications recorded (duplicates skipped)"}
        except Exception as e:
            logger.error(f"Unexpected error in batch_create: {e}")
            raise

    return {"message": "No applications to record"}

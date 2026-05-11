"""
APScheduler setup for SmartApply.
Schedules automated background jobs like the weekly digest email.
"""

import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

scheduler = AsyncIOScheduler()


async def _send_weekly_digests():
    """
    Weekly job: iterate all verified users, compute weekly stats, and send digest emails.
    Runs every Monday at 9:00 AM UTC.
    """
    from database import get_db
    from services.email_service import send_weekly_digest
    from services.streak_service import get_user_streak

    logger.info("📧 Weekly digest job started")

    try:
        db = get_db()

        # Find all verified, active users
        cursor = db.users.find(
            {"email_verified": True, "is_active": {"$ne": False}},
            {"_id": 1, "email": 1, "name": 1},
        )

        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        sent_count = 0
        error_count = 0

        async for user in cursor:
            user_id = str(user["_id"])
            email = user.get("email", "")
            name = user.get("name", "")

            if not email:
                continue

            try:
                # Compute weekly stats
                pipeline = [
                    {
                        "$match": {
                            "user_id": user_id,
                            "applied_at": {"$gte": week_ago},
                        }
                    },
                    {
                        "$facet": {
                            "counts": [
                                {
                                    "$group": {
                                        "_id": None,
                                        "total": {"$sum": 1},
                                        "applied": {
                                            "$sum": {
                                                "$cond": [
                                                    {
                                                        "$eq": [
                                                            "$result",
                                                            "Applied",
                                                        ]
                                                    },
                                                    1,
                                                    0,
                                                ]
                                            }
                                        },
                                        "failed": {
                                            "$sum": {
                                                "$cond": [
                                                    {
                                                        "$eq": [
                                                            "$result",
                                                            "Failed",
                                                        ]
                                                    },
                                                    1,
                                                    0,
                                                ]
                                            }
                                        },
                                    }
                                }
                            ],
                            "missing_skills": [
                                {
                                    "$unwind": {
                                        "path": "$missing_skills",
                                        "preserveNullAndEmptyArrays": False,
                                    }
                                },
                                {
                                    "$group": {
                                        "_id": "$missing_skills",
                                        "count": {"$sum": 1},
                                    }
                                },
                                {"$sort": {"count": -1}},
                                {"$limit": 5},
                            ],
                        }
                    },
                ]

                result = await db.job_applications.aggregate(pipeline).to_list(
                    length=1
                )
                data = result[0] if result else {"counts": [], "missing_skills": []}
                counts = (
                    data["counts"][0]
                    if data["counts"]
                    else {"total": 0, "applied": 0, "failed": 0}
                )

                total = counts.get("total", 0)
                applied = counts.get("applied", 0)
                success_rate = (
                    round((applied / total * 100), 1) if total > 0 else 0
                )

                # Get streak
                streak_data = await get_user_streak(user_id)

                # Top missing skills
                top_gaps = [s["_id"] for s in data.get("missing_skills", [])]

                stats = {
                    "total": total,
                    "applied": applied,
                    "failed": counts.get("failed", 0),
                    "success_rate": success_rate,
                    "current_streak": streak_data.get("current_streak", 0),
                    "top_skill_gaps": top_gaps,
                }

                # Only send if user had any activity this week
                if total > 0:
                    await send_weekly_digest(email, stats, name)
                    sent_count += 1

            except Exception as e:
                error_count += 1
                logger.warning(
                    f"Failed to send weekly digest to {email}: {e}"
                )

        logger.info(
            f"📧 Weekly digest job complete: {sent_count} sent, {error_count} errors"
        )

    except Exception as e:
        logger.error(f"Weekly digest job failed: {e}")


def start_scheduler():
    """Start the APScheduler with all recurring jobs."""
    # Weekly digest: every Monday at 9:00 AM UTC
    scheduler.add_job(
        _send_weekly_digests,
        CronTrigger(day_of_week="mon", hour=9, minute=0, timezone="UTC"),
        id="weekly_digest",
        name="Weekly Digest Email",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler started with weekly digest job (Mon 9:00 UTC)")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down.")

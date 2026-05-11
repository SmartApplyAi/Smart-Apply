"""
APScheduler setup for SmartApply.
Schedules automated background jobs like the weekly digest email.

DRY: Reuses streak_service.get_weekly_review_stats() for weekly stats computation
     instead of duplicating the aggregation pipeline.

Distributed Lock: Uses Redis SETNX to ensure only one instance runs the digest job
                   in a multi-instance deployment (horizontal scaling).
"""

import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

scheduler = AsyncIOScheduler()

# ── Distributed Lock via Redis ──────────────────────────────────────────────

async def _acquire_lock(lock_name: str, ttl_seconds: int = 600) -> bool:
    """
    Acquire a distributed lock via Redis SETNX.
    Returns True if lock was acquired, False if another instance holds it.
    Gracefully returns True (proceed) if Redis is unavailable.
    """
    try:
        from redis_client import get_redis
        redis = get_redis()
        if redis is None:
            return True  # No Redis → single-instance mode, proceed

        acquired = await redis.set(lock_name, "1", nx=True, ex=ttl_seconds)
        return bool(acquired)
    except Exception as e:
        logger.warning(f"Redis lock acquisition failed (proceeding anyway): {e}")
        return True  # Fail open — better to run twice than never


async def _release_lock(lock_name: str):
    """Release a distributed lock."""
    try:
        from redis_client import get_redis
        redis = get_redis()
        if redis:
            await redis.delete(lock_name)
    except Exception:
        pass


# ── Weekly Digest Job ───────────────────────────────────────────────────────

async def _send_weekly_digests():
    """
    Weekly job: iterate all verified users, compute weekly stats, and send digest emails.
    Runs every Monday at 9:00 AM UTC.

    Uses streak_service.get_weekly_review_stats() to avoid duplicating
    the aggregation pipeline (DRY fix).
    """
    lock_name = "smartapply:lock:weekly_digest"

    if not await _acquire_lock(lock_name, ttl_seconds=1800):
        logger.info("📧 Weekly digest: another instance holds the lock. Skipping.")
        return

    from database import get_db
    from services.email_service import send_weekly_digest
    from services.streak_service import get_weekly_review_stats

    logger.info("📧 Weekly digest job started")

    try:
        db = get_db()

        # Find all verified, active users
        cursor = db.users.find(
            {"email_verified": True, "is_active": {"$ne": False}},
            {"_id": 1, "email": 1, "name": 1},
        )

        sent_count = 0
        error_count = 0

        async for user in cursor:
            user_id = str(user["_id"])
            email = user.get("email", "")
            name = user.get("name", "")

            if not email:
                continue

            try:
                # Reuse the existing weekly review stats function (DRY)
                review = await get_weekly_review_stats(user_id)

                total = review.get("total", 0)
                if total == 0:
                    continue  # Skip users with no activity this week

                stats = {
                    "total": total,
                    "applied": review.get("applied", 0),
                    "failed": review.get("failed", 0),
                    "success_rate": review.get("success_rate", 0),
                    "current_streak": review.get("current_streak", 0),
                    "top_skill_gaps": [
                        s["skill"] for s in review.get("top_missing_skills", [])
                    ],
                }

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
    finally:
        await _release_lock(lock_name)


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

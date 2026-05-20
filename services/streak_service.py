"""
Streak & Daily Career Tip service.
Computes application streak (consecutive active days) and generates daily AI career tips.
"""

from datetime import datetime, timedelta, timezone
from database import get_db
from loguru import logger


async def get_user_streak(user_id: str) -> dict:
    """
    Compute the user's application streak.
    - current_streak: consecutive days (ending today or yesterday) with ≥1 application
    - longest_streak: all-time longest consecutive streak
    - active_today: whether the user has applied today
    - total_active_days: total distinct days with applications
    """
    db = get_db()

    # Get all distinct application dates for this user
    pipeline = [
        {"$match": {"user_id": user_id, "result": "Applied"}},
        {
            "$addFields": {
                "activity_date": {"$ifNull": ["$applied_at", "$created_at"]}
            }
        },
        {"$match": {"activity_date": {"$ne": None}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$activity_date"}
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    dates_cursor = db.job_applications.aggregate(pipeline)
    active_dates = set()
    async for doc in dates_cursor:
        active_dates.add(doc["_id"])

    if not active_dates:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "active_today": False,
            "total_active_days": 0,
        }

    # Parse dates and sort
    sorted_dates = sorted(
        [datetime.strptime(d, "%Y-%m-%d").date() for d in active_dates]
    )
    today = datetime.now(timezone.utc).date()

    # Check if active today
    active_today = today in sorted_dates

    # Compute current streak (must include today or yesterday to be "current")
    current_streak = 0
    check_date = today if active_today else today - timedelta(days=1)

    if check_date in sorted_dates:
        current_streak = 1
        while (check_date - timedelta(days=1)) in sorted_dates:
            check_date -= timedelta(days=1)
            current_streak += 1

    # Compute longest streak
    longest_streak = 0
    if sorted_dates:
        streak = 1
        for i in range(1, len(sorted_dates)):
            if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
                streak += 1
            else:
                longest_streak = max(longest_streak, streak)
                streak = 1
        longest_streak = max(longest_streak, streak)

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "active_today": active_today,
        "total_active_days": len(sorted_dates),
    }


async def get_daily_career_tip(user_id: str) -> dict:
    """
    Generate or retrieve a cached daily AI career tip.
    Tips are cached in MongoDB for the full day (UTC) so each user sees the same tip all day.
    """
    db = get_db()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Check cache first
    cached = await db.daily_tips.find_one(
        {"user_id": user_id, "date": today_str}
    )
    if cached:
        return {
            "tip": cached.get("tip", ""),
            "category": cached.get("category", "general"),
            "date": today_str,
            "cached": True,
        }

    # Generate a new tip using AI
    tip_data = await _generate_tip(user_id)

    # Cache in DB
    try:
        await db.daily_tips.update_one(
            {"user_id": user_id, "date": today_str},
            {
                "$set": {
                    "tip": tip_data["tip"],
                    "category": tip_data["category"],
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Failed to cache daily tip for user {user_id}: {e}")

    return {
        "tip": tip_data["tip"],
        "category": tip_data["category"],
        "date": today_str,
        "cached": False,
    }


async def _generate_tip(user_id: str) -> dict:
    """Generate a career tip using NVIDIA NIM, personalized if possible."""
    from services.ai_service import _call_nim, _parse_json_from_response

    # Try to get user context for personalization
    context = ""
    try:
        db = get_db()
        profile = await db.user_profiles.find_one(
            {"user_id": user_id},
            {"first_name": 1, "linkedin_headline": 1, "skills_summary": 1},
        )
        if profile:
            parts = []
            if profile.get("linkedin_headline"):
                parts.append(f"Role: {profile['linkedin_headline']}")
            if profile.get("skills_summary"):
                parts.append(
                    f"Skills: {profile['skills_summary'][:200]}"
                )
            context = ". ".join(parts)
    except Exception:
        pass

    system_prompt = (
        "You are SmartApply AI, a career coach. Generate ONE concise, actionable career tip "
        "for a job seeker. The tip should be practical, specific, and immediately useful.\n\n"
        "Return ONLY valid JSON:\n"
        '{"tip": "Your concise career tip here (2-3 sentences max)", '
        '"category": "one of: resume|networking|interview|skills|productivity|mindset"}'
    )

    user_prompt = f"Generate a unique daily career tip for today."
    if context:
        user_prompt += f"\n\nUser context: {context}"

    try:
        raw = await _call_nim(system_prompt, user_prompt, max_tokens=200, temperature=0.8)
        parsed = _parse_json_from_response(raw)

        if parsed and "tip" in parsed:
            return {
                "tip": parsed["tip"],
                "category": parsed.get("category", "general"),
            }

        # Fallback: use raw text as tip
        return {"tip": raw.strip(), "category": "general"}

    except Exception as e:
        logger.warning(f"Failed to generate AI career tip: {e}")
        # Fallback tips
        import random

        fallback_tips = [
            {"tip": "Tailor your resume keywords to each job description. ATS systems scan for exact matches, so mirror the language used in the posting.", "category": "resume"},
            {"tip": "Send a personalized LinkedIn connection request to the hiring manager after applying. A brief note mentioning the role can increase your visibility.", "category": "networking"},
            {"tip": "Practice the STAR method (Situation, Task, Action, Result) for behavioral interviews. Having 5-6 prepared stories covers most common questions.", "category": "interview"},
            {"tip": "Dedicate 30 minutes daily to learning one in-demand skill in your field. Consistency beats intensity when building expertise.", "category": "skills"},
            {"tip": "Apply to jobs in the morning (8-10 AM local time). Studies show applications submitted early get more attention from recruiters.", "category": "productivity"},
            {"tip": "Track every application you send. Knowing your numbers helps identify what's working and reduces the feeling of uncertainty.", "category": "mindset"},
            {"tip": "Add quantifiable achievements to your resume. Numbers like 'increased revenue by 25%' are far more impactful than vague descriptions.", "category": "resume"},
            {"tip": "Follow up on applications after 5-7 business days with a brief, professional email. Persistence shows genuine interest.", "category": "networking"},
        ]
        return random.choice(fallback_tips)


async def get_weekly_review_stats(user_id: str) -> dict:
    """
    Compute stats for the weekly review widget.
    Shows last 7 days: total applications, success rate, streak, top missing skills.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # Applications this week
    pipeline = [
        {"$match": {"user_id": user_id, "applied_at": {"$gte": week_ago}}},
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
                                        {"$eq": ["$result", "Applied"]},
                                        1,
                                        0,
                                    ]
                                }
                            },
                            "failed": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$result", "Failed"]},
                                        1,
                                        0,
                                    ]
                                }
                            },
                            "skipped": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$result", "Skipped"]},
                                        1,
                                        0,
                                    ]
                                }
                            },
                        }
                    }
                ],
                "missing_skills": [
                    {"$unwind": {"path": "$missing_skills", "preserveNullAndEmptyArrays": False}},
                    {"$group": {"_id": "$missing_skills", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1}},
                    {"$limit": 5},
                ],
            }
        },
    ]

    result = await db.job_applications.aggregate(pipeline).to_list(length=1)
    data = result[0] if result else {"counts": [], "missing_skills": []}

    counts = data["counts"][0] if data["counts"] else {
        "total": 0, "applied": 0, "failed": 0, "skipped": 0
    }

    total = counts.get("total", 0)
    applied = counts.get("applied", 0)
    success_rate = round((applied / total * 100), 1) if total > 0 else 0

    # Get streak info
    streak_info = await get_user_streak(user_id)

    # Check if user has seen this week's review
    week_key = now.strftime("%Y-W%W")
    seen_doc = await db.weekly_review_seen.find_one(
        {"user_id": user_id, "week": week_key}
    )

    return {
        "period": "Last 7 days",
        "total": total,
        "applied": applied,
        "failed": counts.get("failed", 0),
        "skipped": counts.get("skipped", 0),
        "success_rate": success_rate,
        "current_streak": streak_info["current_streak"],
        "longest_streak": streak_info["longest_streak"],
        "top_missing_skills": [
            {"skill": s["_id"], "count": s["count"]}
            for s in data.get("missing_skills", [])
        ],
        "already_seen": bool(seen_doc),
        "week_key": week_key,
    }


async def mark_weekly_review_seen(user_id: str, week_key: str):
    """Mark the weekly review as seen for a user."""
    db = get_db()
    await db.weekly_review_seen.update_one(
        {"user_id": user_id, "week": week_key},
        {"$set": {"seen_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

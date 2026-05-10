"""
Skill Gap service: analysis, roadmap generation, and persistence.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId
from database import get_db
from loguru import logger


async def aggregate_skill_gaps(user_id: str, days: int = 30) -> dict:
    """
    Aggregate skill gaps from user's recent applied jobs.
    Returns matched/missing skills across all applications with match scores.
    """
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Fetch all applications with match data in the given period
    cursor = db.job_applications.find(
        {
            "user_id": user_id,
            "applied_at": {"$gte": cutoff},
            "match_score": {"$ne": None},
        },
        {
            "job_title": 1, "company": 1, "match_score": 1,
            "matched_skills": 1, "missing_skills": 1, "skill_gap": 1,
            "applied_at": 1,
        }
    ).sort("applied_at", -1)

    applications = []
    all_matched = {}
    all_missing = {}
    total_score = 0
    count = 0

    async for doc in cursor:
        score = doc.get("match_score", 0) or 0
        total_score += score
        count += 1

        applications.append({
            "id": str(doc["_id"]),
            "job_title": doc.get("job_title", ""),
            "company": doc.get("company", ""),
            "match_score": score,
            "applied_at": doc["applied_at"].isoformat() if doc.get("applied_at") else None,
        })

        # Tally matched skills frequency
        for skill in doc.get("matched_skills", []):
            s = skill.strip()
            if s:
                all_matched[s] = all_matched.get(s, 0) + 1

        # Tally missing skills frequency
        for skill in doc.get("missing_skills", []):
            s = skill.strip()
            if s:
                all_missing[s] = all_missing.get(s, 0) + 1

    # Remove skills from missing if they're also matched (inconsistency)
    for skill in list(all_missing.keys()):
        if skill in all_matched and all_matched[skill] > all_missing[skill]:
            del all_missing[skill]

    avg_score = round(total_score / count) if count > 0 else 0

    # Sort by frequency
    sorted_matched = sorted(all_matched.items(), key=lambda x: -x[1])
    sorted_missing = sorted(all_missing.items(), key=lambda x: -x[1])

    return {
        "average_match_score": avg_score,
        "total_analyzed": count,
        "matched_skills": [{"skill": s, "count": c} for s, c in sorted_matched],
        "missing_skills": [{"skill": s, "count": c} for s, c in sorted_missing],
        "top_applications": applications[:10],
        "period_days": days,
    }


async def generate_and_save_roadmap(
    user_id: str, target_role: str, current_skills: list, target_skills: list
) -> dict:
    """Generate a skill roadmap using AI and save it to the database."""
    from services.ai_service import generate_skill_roadmap

    roadmap_data = await generate_skill_roadmap(current_skills, target_skills, target_role)

    if roadmap_data.get("error"):
        return roadmap_data

    # Save to database
    db = get_db()
    doc = {
        "user_id": user_id,
        "target_role": target_role,
        "current_skills": current_skills,
        "target_skills": target_skills,
        "roadmap": roadmap_data.get("roadmap", []),
        "milestones": roadmap_data.get("milestones", []),
        "tips": roadmap_data.get("tips", []),
        "total_duration": roadmap_data.get("total_duration", ""),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.skill_roadmaps.insert_one(doc)
    roadmap_data["id"] = str(result.inserted_id)

    logger.info(f"Roadmap generated and saved for user {user_id}: {target_role}")
    return roadmap_data


async def get_saved_roadmaps(user_id: str, limit: int = 10) -> list:
    """Retrieve previously generated roadmaps for a user."""
    db = get_db()
    cursor = (
        db.skill_roadmaps.find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )

    roadmaps = []
    async for doc in cursor:
        roadmaps.append({
            "id": str(doc["_id"]),
            "target_role": doc.get("target_role", ""),
            "total_duration": doc.get("total_duration", ""),
            "roadmap": doc.get("roadmap", []),
            "milestones": doc.get("milestones", []),
            "tips": doc.get("tips", []),
            "current_skills": doc.get("current_skills", []),
            "target_skills": doc.get("target_skills", []),
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        })

    return roadmaps


async def get_roadmap_by_id(user_id: str, roadmap_id: str) -> Optional[dict]:
    """Get a single roadmap by ID."""
    db = get_db()
    doc = await db.skill_roadmaps.find_one(
        {"_id": ObjectId(roadmap_id), "user_id": user_id}
    )
    if not doc:
        return None

    return {
        "id": str(doc["_id"]),
        "target_role": doc.get("target_role", ""),
        "total_duration": doc.get("total_duration", ""),
        "roadmap": doc.get("roadmap", []),
        "milestones": doc.get("milestones", []),
        "tips": doc.get("tips", []),
        "current_skills": doc.get("current_skills", []),
        "target_skills": doc.get("target_skills", []),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
    }

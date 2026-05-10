"""
Skill Gap API routes at /api/skillgap/*.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from dependencies import get_current_user
from services import skillgap_service
from pydantic import BaseModel
from typing import List, Optional
from limiter import limiter

router = APIRouter(prefix="/skillgap", tags=["Skill Gap"])


class RoadmapRequest(BaseModel):
    target_role: str = ""
    current_skills: List[str] = []
    target_skills: List[str] = []


# ── Analysis ────────────────────────────────────────────────────────────────

@router.get("/analysis")
async def get_skill_gap_analysis(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
):
    """Get aggregate skill gap analysis from recent applications."""
    return await skillgap_service.aggregate_skill_gaps(user["id"], days)


# ── Roadmap ─────────────────────────────────────────────────────────────────

@router.post("/roadmap")
@limiter.limit("5/minute")
async def generate_roadmap(
    request: Request,
    body: RoadmapRequest,
    user: dict = Depends(get_current_user),
):
    """Generate an AI-powered learning roadmap."""
    if not body.target_skills and not body.target_role:
        raise HTTPException(status_code=400, detail="Provide target_role or target_skills")

    # If no target skills provided, use missing skills from recent analysis
    target_skills = body.target_skills
    if not target_skills:
        analysis = await skillgap_service.aggregate_skill_gaps(user["id"], 30)
        target_skills = [s["skill"] for s in analysis.get("missing_skills", [])[:10]]
        if not target_skills:
            raise HTTPException(status_code=400, detail="No skill gaps detected. Provide target skills manually.")

    current_skills = body.current_skills
    if not current_skills:
        analysis = await skillgap_service.aggregate_skill_gaps(user["id"], 30)
        current_skills = [s["skill"] for s in analysis.get("matched_skills", [])[:15]]

    result = await skillgap_service.generate_and_save_roadmap(
        user["id"], body.target_role, current_skills, target_skills
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return result


@router.get("/roadmaps")
async def get_saved_roadmaps(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Get previously generated roadmaps."""
    roadmaps = await skillgap_service.get_saved_roadmaps(user["id"], limit)
    return {"roadmaps": roadmaps}


@router.get("/roadmaps/{roadmap_id}")
async def get_roadmap(
    roadmap_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific roadmap by ID."""
    roadmap = await skillgap_service.get_roadmap_by_id(user["id"], roadmap_id)
    if not roadmap:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap

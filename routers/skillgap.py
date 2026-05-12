"""
Skill Gap API routes at /api/skillgap/*.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from dependencies import get_current_user
from services import skillgap_service
from pydantic import BaseModel, Field
from typing import List, Optional
from limiter import limiter
from loguru import logger

router = APIRouter(prefix="/skillgap", tags=["Skill Gap"])


class RoadmapRequest(BaseModel):
    target_role: str = Field("", max_length=200)
    current_skills: List[str] = Field(default_factory=list, max_length=30)
    target_skills: List[str] = Field(default_factory=list, max_length=30)


# ── Analysis ────────────────────────────────────────────────────────────────

@router.get("/analysis")
@limiter.limit("10/minute")
async def get_skill_gap_analysis(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
):
    """Get aggregate skill gap analysis from recent applications."""
    result = await skillgap_service.aggregate_skill_gaps(user["id"], days)

    # Push live skill gap alert if meaningful missing skills found
    top_missing = [s["skill"] for s in result.get("missing_skills", [])[:5]]
    if top_missing:
        try:
            from websocket.pubsub import publish_skill_gap_event
            await publish_skill_gap_event(
                user_id=str(user["id"]),
                payload={
                    "missing_skills": top_missing,
                    "average_score": result.get("average_match_score", 0),
                    "total_analyzed": result.get("total_analyzed", 0),
                    "source": "on_demand_analysis",
                },
            )
        except Exception as _ws_err:
            logger.warning(f"SKILL_GAP_ALERT WS push failed (non-fatal): {_ws_err}")

    return result


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

    # ── Push roadmap-ready event to user's dashboard ────────────────────
    try:
        from websocket.pubsub import publish_roadmap_event
        await publish_roadmap_event(
            user_id=str(user["id"]),
            payload={
                "id": result.get("id", ""),
                "target_role": body.target_role,
                "total_duration": result.get("total_duration", ""),
                "phase_count": len(result.get("roadmap", [])),
            },
        )
    except Exception as _ws_err:
        logger.warning(f"ROADMAP_READY WS push failed (non-fatal): {_ws_err}")
    # ────────────────────────────────────────────────────────────────────

    return result


@router.get("/roadmaps")
@limiter.limit("20/minute")
async def get_saved_roadmaps(
    request: Request,
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Get previously generated roadmaps."""
    roadmaps = await skillgap_service.get_saved_roadmaps(user["id"], limit)
    return {"roadmaps": roadmaps}


@router.get("/roadmaps/{roadmap_id}")
@limiter.limit("20/minute")
async def get_roadmap(
    request: Request,
    roadmap_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific roadmap by ID."""
    roadmap = await skillgap_service.get_roadmap_by_id(user["id"], roadmap_id)
    if not roadmap:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap

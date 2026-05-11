"""
Dashboard API routes at /api/dashboard/*.
"""

from fastapi import APIRouter, Depends, Query, Request
from dependencies import get_current_user
from services import dashboard_service
from services.streak_service import (
    get_user_streak,
    get_daily_career_tip,
    get_weekly_review_stats,
    mark_weekly_review_seen,
)
from limiter import limiter
from pydantic import BaseModel

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def get_summary(user: dict = Depends(get_current_user)):
    """Full dashboard summary with all stats."""
    return await dashboard_service.get_summary(user["id"])


@router.get("/recent-applications")
async def get_recent(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Recent applications for the dashboard widget."""
    apps = await dashboard_service.get_recent_applications(user["id"], limit)
    return {"applications": apps}


@router.get("/activity-feed")
async def get_activity_feed(
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Recent activity feed (applications + automation events)."""
    activities = await dashboard_service.get_activity_feed(user["id"], limit)
    return {"activities": activities}


@router.get("/stats-by-period")
async def get_stats_by_period(
    period: str = Query("week", regex="^(day|week|month)$"),
    user: dict = Depends(get_current_user),
):
    """Graph-ready stats grouped by day/week/month."""
    data = await dashboard_service.get_stats_by_period(user["id"], period)
    return {"data": data}


# ── Streak Tracking ─────────────────────────────────────────────────────────

@router.get("/streak")
async def get_streak(user: dict = Depends(get_current_user)):
    """Get the user's application streak (consecutive active days)."""
    return await get_user_streak(user["id"])


# ── Daily AI Career Tip ─────────────────────────────────────────────────────

@router.get("/daily-tip")
@limiter.limit("10/minute")
async def daily_tip(request: Request, user: dict = Depends(get_current_user)):
    """Get or generate the daily AI career tip."""
    return await get_daily_career_tip(user["id"])


# ── Weekly Review Widget ────────────────────────────────────────────────────

@router.get("/weekly-review")
async def weekly_review(user: dict = Depends(get_current_user)):
    """Get weekly review stats for the dashboard widget."""
    return await get_weekly_review_stats(user["id"])


class WeeklyReviewSeenBody(BaseModel):
    week_key: str


@router.post("/weekly-review/seen")
async def mark_review_seen(
    body: WeeklyReviewSeenBody, user: dict = Depends(get_current_user)
):
    """Mark the weekly review as dismissed/seen."""
    await mark_weekly_review_seen(user["id"], body.week_key)
    return {"message": "Weekly review marked as seen"}

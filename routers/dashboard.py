"""
Dashboard API routes at /api/dashboard/*.
"""

from fastapi import APIRouter, Depends, Query
from dependencies import get_current_user
from services import dashboard_service

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

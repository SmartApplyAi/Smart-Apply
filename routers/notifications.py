"""
Notifications API routes at /api/notifications/*.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from dependencies import get_current_user
from services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
async def list_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    """List notifications for the current user."""
    return await notification_service.list_notifications(
        user["id"], skip, limit, unread_only
    )


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str, user: dict = Depends(get_current_user)
):
    """Mark a notification as read."""
    try:
        return await notification_service.mark_read(user["id"], notification_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    return await notification_service.mark_all_read(user["id"])


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str, user: dict = Depends(get_current_user)
):
    """Delete a notification."""
    try:
        return await notification_service.delete_notification(
            user["id"], notification_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/unread-count")
async def get_unread_count(user: dict = Depends(get_current_user)):
    """Get the count of unread notifications."""
    count = await notification_service.get_unread_count(user["id"])
    return {"count": count}

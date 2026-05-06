"""
Automation API routes.
Dedicated automation session management endpoints at /api/automation/*.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from dependencies import get_current_user
from services import automation_service
from pydantic import BaseModel
from typing import Optional
import asyncio

router = APIRouter(prefix="/automation", tags=["Automation"])


class StartSessionRequest(BaseModel):
    preferences: dict = {}


@router.post("/start")
async def start_session(
    body: StartSessionRequest, user: dict = Depends(get_current_user)
):
    """Start a new automation session."""
    try:
        return await automation_service.start_session(user["id"], body.preferences)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/pause")
async def pause_session(user: dict = Depends(get_current_user)):
    """Pause the active automation session."""
    try:
        return await automation_service.pause_session(user["id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/resume")
async def resume_session(user: dict = Depends(get_current_user)):
    """Resume a paused session."""
    try:
        return await automation_service.resume_session(user["id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/stop")
async def stop_session(
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    """Stop the active automation session."""
    try:
        return await automation_service.stop_session(user["id"], background_tasks)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/status")
async def get_status(user: dict = Depends(get_current_user)):
    """Get the current automation session status."""
    return await automation_service.get_session_status(user["id"])


@router.get("/logs")
async def get_logs(
    session_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """Get automation logs."""
    return await automation_service.get_session_logs(user["id"], session_id, limit)


@router.get("/extension/tokens")
async def list_extension_tokens(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user)
):
    """List all active extension tokens for this user (paginated)."""
    return await automation_service.list_extension_tokens(user["id"], skip, limit)


@router.delete("/extension/tokens/{token_id}")
async def revoke_extension_token(
    token_id: str, user: dict = Depends(get_current_user)
):
    """Revoke a specific extension token."""
    try:
        return await automation_service.revoke_extension_token(user["id"], token_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
@router.get("/stream")
async def stream_automation_updates(user: dict = Depends(get_current_user)):
    """Stream real-time automation updates via SSE."""
    async def event_generator():
        queue = await automation_service.subscribe_to_updates(user["id"])
        try:
            while True:
                update = await queue.get()
                yield f"data: {update}\n\n"
        except asyncio.CancelledError:
            await automation_service.unsubscribe_from_updates(user["id"], queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

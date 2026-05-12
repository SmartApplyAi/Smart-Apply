"""
Resume API routes.
Matches frontend expectations at /api/resume/*.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from dependencies import get_current_user, get_current_user_flexible
from services import resume_service
from limiter import limiter
import io

router = APIRouter(prefix="/resume", tags=["Resume"])


@router.get("/stream-active")
@limiter.limit("10/minute")
async def stream_active_resume(
    request: Request, user: dict = Depends(get_current_user_flexible)
):
    """Retrieve and stream the user's currently active resume directly."""
    try:
        from services.audit_service import log_action
        from urllib.parse import quote

        file_bytes, filename = await resume_service.get_active_resume_bytes(user["id"])
        encoded_filename = quote(filename)
        await log_action(user["id"], "stream_active_resume", "resume", metadata={"filename": filename})

        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(len(file_bytes)),
                "Cache-Control": "no-store",
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        from loguru import logger
        logger.error(f"Error streaming active resume: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during resume streaming")


@router.post("/upload")
@limiter.limit("10/minute")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    label: str = Form("Default"),
    user: dict = Depends(get_current_user),
):
    """Upload a resume PDF, parse it, store in R2."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    if file.content_type and "pdf" not in file.content_type.lower():
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")

    try:
        return await resume_service.upload_resume(
            user["id"], file_bytes, file.filename, label
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/list")
@limiter.limit("20/minute")
async def list_resumes(request: Request, user: dict = Depends(get_current_user)):
    """List all resumes for the current user."""
    return await resume_service.list_resumes(user["id"])


@router.delete("/legacy")
@limiter.limit("10/minute")
async def delete_legacy_resume(
    request: Request,
    index: int = Query(...),
    user: dict = Depends(get_current_user),
):
    """Delete a legacy resume entry by index."""
    try:
        return await resume_service.delete_legacy_resume(user["id"], index)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Catch-all routes with path parameters (MUST stay at the bottom) ───────────

@router.post("/activate/{object_key:path}")
@limiter.limit("10/minute")
async def activate_resume(
    request: Request, object_key: str, user: dict = Depends(get_current_user)
):
    """Set a resume as the active/primary resume."""
    try:
        return await resume_service.activate_resume_by_key(user["id"], object_key)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/download/{object_key:path}")
@limiter.limit("20/minute")
async def download_resume(
    request: Request, object_key: str, user: dict = Depends(get_current_user)
):
    """Download a resume via presigned R2 URL."""
    try:
        from services.audit_service import log_action
        await log_action(user["id"], "download_resume", "resume", metadata={"object_key": object_key})
        url = await resume_service.get_resume_download_url(user["id"], object_key)
        return RedirectResponse(url=url)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/view/{object_key:path}")
@limiter.limit("20/minute")
async def view_resume(
    request: Request, object_key: str, user: dict = Depends(get_current_user)
):
    """Stream the resume PDF for inline viewing."""
    try:
        file_bytes, filename = await resume_service.get_resume_bytes(
            user["id"], object_key
        )
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=\"{filename}\"",
                "Content-Length": str(len(file_bytes)),
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{object_key:path}")
@limiter.limit("10/minute")
async def delete_resume(
    request: Request, object_key: str, user: dict = Depends(get_current_user)
):
    """Delete a resume from R2 and the database."""
    try:
        return await resume_service.delete_resume(user["id"], object_key)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

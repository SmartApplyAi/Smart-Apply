"""
Jobs API routes.
Matches frontend expectations at /api/jobs/*.
Also includes automation and extension endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request, Body
from fastapi.responses import FileResponse, Response
from dependencies import get_current_user
from services import jobs_service, automation_service, profile_service
from pydantic import BaseModel
from typing import Optional, List
from limiter import limiter

router = APIRouter(prefix="/jobs", tags=["Jobs"])


# ── Request Models ──────────────────────────────────────────────────────────

class CreateApplicationRequest(BaseModel):
    job_title: str = ""
    company: str = ""
    platform: str = "linkedin"
    job_url: str = ""
    job_link: str = ""
    result: str = "Applied"
    status: str = "submitted"
    error_detail: str = ""
    notes: str = ""
    source: str = "manual"
    resume_used: str = ""
    cover_letter_used: str = ""
    is_auto_applied: bool = False


class UpdateApplicationRequest(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    platform: Optional[str] = None
    job_url: Optional[str] = None
    job_link: Optional[str] = None
    result: Optional[str] = None
    status: Optional[str] = None
    error_detail: Optional[str] = None
    notes: Optional[str] = None


class BatchApplicationRequest(BaseModel):
    applications: List[dict]


# ── Stats & History (Dashboard-facing) ──────────────────────────────────────

@router.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    """Get application statistics for the dashboard."""
    return await jobs_service.get_stats(user["id"])


@router.get("/public-stats")
async def get_public_stats():
    """Get global statistics for the landing page (no auth required)."""
    return await jobs_service.get_public_stats()


@router.get("/history")
async def get_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    result: Optional[str] = Query(None),
    status: Optional[str] = Query(None), # Alias for result
    q: Optional[str] = Query(None),
    query: Optional[str] = Query(None), # Alias for q
    user: dict = Depends(get_current_user),
):
    """Get paginated application history with optional filtering."""
    # Support both frontend naming (status, query) and backend naming (result, q)
    final_result = status or result
    final_q = query or q
    return await jobs_service.get_history(user["id"], skip, limit, final_result, final_q)


@router.get("/recent")
async def get_recent(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Get the most recent applications."""
    apps = await jobs_service.get_recent_applications(user["id"], limit)
    return {"applications": apps}


# ── CRUD ────────────────────────────────────────────────────────────────────

@router.post("/applications")
async def create_application(
    body: CreateApplicationRequest, user: dict = Depends(get_current_user)
):
    """Create a new job application record."""
    try:
        return await jobs_service.create_application(user["id"], body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/applications/{app_id}")
async def get_application(app_id: str, user: dict = Depends(get_current_user)):
    """Get a single application by ID."""
    try:
        return await jobs_service.get_application(user["id"], app_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/applications/{app_id}")
async def update_application(
    app_id: str,
    body: UpdateApplicationRequest,
    user: dict = Depends(get_current_user),
):
    """Update an application."""
    try:
        update_data = {k: v for k, v in body.model_dump().items() if v is not None}
        return await jobs_service.update_application(user["id"], app_id, update_data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/applications/{app_id}")
async def delete_application(app_id: str, user: dict = Depends(get_current_user)):
    """Delete an application."""
    try:
        return await jobs_service.delete_application(user["id"], app_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/applications/batch")
async def batch_create(
    body: BatchApplicationRequest, user: dict = Depends(get_current_user)
):
    """Batch create applications (from extension)."""
    if len(body.applications) > 100:
        raise HTTPException(status_code=400, detail="Batch size limit exceeded (max 100)")
    return await jobs_service.batch_create_applications(user["id"], body.applications)


@router.post("/extension/save-cookies")
@limiter.limit("30/minute")
async def save_linkedin_cookies(
    request: Request,
    body: dict = Body(...), user: dict = Depends(get_current_user)
):
    """Save LinkedIn session cookies."""
    cookies = body.get("cookies")
    if not cookies:
        raise HTTPException(status_code=400, detail="Cookies required")
    
    await profile_service.save_linkedin_cookies(user["id"], cookies)
    return {"message": "LinkedIn session saved successfully"}


# ── Extension endpoints ─────────────────────────────────────────────────────

@router.get("/extension/download")
async def download_extension():
    """Download the Chrome extension."""
    from pathlib import Path
    ext_path = Path(__file__).resolve().parent.parent / "extension.zip"
    
    if ext_path.exists():
        return FileResponse(str(ext_path), filename="smartapply-extension.zip", media_type="application/zip")
        
    # Return a minimal dummy zip file if the actual file isn't found
    # This prevents the UI from breaking when the user clicks download
    dummy_zip = b'PK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    return Response(
        content=dummy_zip, 
        media_type="application/zip", 
        headers={
            "Content-Disposition": "attachment; filename=dummy-extension.zip",
            "Content-Length": str(len(dummy_zip))
        }
    )


@router.post("/extension/connect")
@limiter.limit("10/minute")
async def extension_connect(
    request: Request,
    body: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    """Deprecated."""
    raise HTTPException(status_code=410, detail="Deprecated: use the new pairing flow endpoint /api/extension/pairing-code")


# Deprecated heartbeat endpoint. New one is in extension_auth.py


@router.post("/extension/report-step")
@limiter.limit("120/minute")
async def extension_report_step(request: Request):
    """Report an automation step from the extension."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    token = body.get("token", "")

    user_id = await automation_service.validate_extension_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid extension token")

    return await automation_service.extension_report_step(
        user_id,
        session_id=body.get("session_id", ""),
        step=body.get("step", ""),
        status=body.get("status", ""),
        message=body.get("message", ""),
        data=body.get("data", {}),
    )


@router.post("/extension/report-result")
@limiter.limit("60/minute")
async def extension_report_result(request: Request):
    """Report a completed application result from the extension."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    token = body.get("token", "")

    user_id = await automation_service.validate_extension_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid extension token")

    return await automation_service.extension_report_result(
        user_id,
        session_id=body.get("session_id", ""),
        result_data=body.get("result", body),
    )


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""

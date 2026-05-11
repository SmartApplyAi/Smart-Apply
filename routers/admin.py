from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from dependencies import require_admin
from services import admin_service
from config import settings
from limiter import limiter

router = APIRouter(tags=["Admin"])

@router.get("/admin/stats")
@limiter.limit("20/minute")
async def get_admin_stats(request: Request, admin: dict = Depends(require_admin)):
    """Get global platform stats for the admin dashboard."""
    return await admin_service.get_admin_stats()

@router.get("/admin/keys")
@limiter.limit("10/minute")
async def get_admin_keys(request: Request, admin: dict = Depends(require_admin)):
    """Get the current NVIDIA NIM API keys."""
    keys = await settings.get_nim_api_key_list()
    return {"keys": keys}

from pydantic import BaseModel

class KeysBody(BaseModel):
    keys: list[str]

@router.put("/admin/keys")
@limiter.limit("5/minute")
async def update_admin_keys(
    request: Request,
    body: KeysBody,
    admin: dict = Depends(require_admin)
):
    """Update the NVIDIA NIM API keys."""
    keys_str = ",".join(body.keys)
    await admin_service.update_nim_keys(keys_str)
    return {"message": "API keys updated successfully"}

@router.get("/admin/users")
@limiter.limit("20/minute")
async def get_users(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin: dict = Depends(require_admin)
):
    """List registered users with pagination."""
    users, total = await admin_service.get_all_users(skip=skip, limit=limit)
    return {"users": users, "total": total}

@router.patch("/admin/users/{user_id}")
@limiter.limit("30/minute")
async def patch_user(
    request: Request,
    user_id: str,
    payload: dict = Body(...),
    admin: dict = Depends(require_admin)
):
    """Update user status or role."""
    is_active = payload.get("is_active")
    role = payload.get("role")
    
    success = await admin_service.update_user_status(
        user_id, 
        is_active=is_active,
        role=role
    )
    if not success:
        raise HTTPException(status_code=404, detail="User not found or no changes made")
    return {"message": "User updated successfully"}

@router.delete("/admin/users/{user_id}/hard-delete")
@limiter.limit("5/minute")
async def hard_delete_user(request: Request, user_id: str, admin: dict = Depends(require_admin)):
    """Hard delete a user and all associated data."""
    success = await admin_service.hard_delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User and all data permanently deleted"}

@router.get("/admin/sessions")
async def get_active_sessions(admin: dict = Depends(require_admin)):
    """View all active automation sessions."""
    sessions = await admin_service.get_active_sessions()
    return {"sessions": sessions}

@router.get("/admin/audit-logs")
async def get_audit_logs(
    limit: int = Query(100, le=500),
    user_id: Optional[str] = Query(None),
    admin: dict = Depends(require_admin)
):
    """View admin audit logs."""
    logs = await admin_service.get_audit_logs(limit, user_id)
    return {"logs": logs}

@router.post("/admin/broadcast")
@limiter.limit("2/minute")
async def broadcast_announcement(
    request: Request,
    payload: dict = Body(...),
    admin: dict = Depends(require_admin)
):
    """Send an announcement email to all verified users."""
    subject = payload.get("subject")
    message = payload.get("message")
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message required")
    
    result = await admin_service.broadcast_announcement(subject, message)
    return {"message": f"Broadcast sent to {result['sent_count']} users"}

@router.get("/admin/nim-test")
@limiter.limit("5/minute")
async def test_nim_key(
    request: Request,
    key: str = Query(...),
    admin: dict = Depends(require_admin)
):
    """Test if an NVIDIA NIM key is valid."""
    return await admin_service.test_nim_key(key)

@router.get("/admin/trends")
async def get_trends(admin: dict = Depends(require_admin)):
    """Get platform application trends for Chart.js."""
    return await admin_service.get_platform_trends()

# ── Dynamic Questions ────────────────────────────────────────────────────────

@router.get("/admin/questions")
async def get_questions(admin: dict = Depends(require_admin)):
    """Get all dynamic profile questions."""
    return await admin_service.get_all_questions()

@router.post("/admin/questions")
async def create_question(payload: dict = Body(...), admin: dict = Depends(require_admin)):
    """Create a new dynamic profile question."""
    return await admin_service.create_question(payload)

@router.put("/admin/questions/{question_id}")
async def update_question(question_id: str, payload: dict = Body(...), admin: dict = Depends(require_admin)):
    """Update a dynamic profile question."""
    return await admin_service.update_question(question_id, payload)

@router.delete("/admin/questions/{question_id}")
async def delete_question(question_id: str, admin: dict = Depends(require_admin)):
    """Delete a dynamic profile question."""
    return await admin_service.delete_question(question_id)

# ── Email Templates ──────────────────────────────────────────────────────────

@router.get("/admin/email-templates")
async def get_email_templates(admin: dict = Depends(require_admin)):
    """Get all email templates."""
    return await admin_service.get_email_templates()

@router.put("/admin/email-templates/{template_id}")
async def update_email_template(template_id: str, payload: dict = Body(...), admin: dict = Depends(require_admin)):
    """Update an email template."""
    return await admin_service.update_email_template(template_id, payload.get("content", ""))


class MailConfigBody(BaseModel):
    api_key: Optional[str] = None
    sender_email: Optional[str] = None

@router.get("/admin/mail-config")
async def get_mail_config(admin: dict = Depends(require_admin)):
    """Get the current Brevo mail configuration."""
    return {
        "api_key": settings.BREVO_API_KEY[:6] + "..." if settings.BREVO_API_KEY else None,
        "sender_email": settings.BREVO_SENDER_EMAIL
    }

@router.put("/admin/mail-config")
async def update_mail_config(
    body: MailConfigBody,
    admin: dict = Depends(require_admin)
):
    """Update the Brevo mail configuration."""
    await admin_service.update_mail_config(
        api_key=body.api_key,
        sender_email=body.sender_email
    )
    return {"message": "Mail configuration updated successfully"}



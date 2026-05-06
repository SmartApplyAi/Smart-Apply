"""
Profile API routes.
Matches frontend expectations at /api/profile/*.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from dependencies import get_current_user
from services import profile_service, admin_service
from limiter import limiter

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("/me")
@limiter.limit("20/minute")
async def get_profile(request: Request, user: dict = Depends(get_current_user)):
    """Get the full user profile, job preferences, and platform accounts."""
    return await profile_service.get_full_profile(user["id"])
    

@router.get("/questions")
async def get_profile_questions():
    """Get all dynamic questions to display on the profile setup."""
    return await admin_service.get_all_questions()


@router.patch("/me")
async def patch_profile_me(body: dict, user: dict = Depends(get_current_user)):
    """Partial update of the user profile."""
    try:
        return await profile_service.update_profile(user["id"], body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/update")
async def update_profile(body: dict, user: dict = Depends(get_current_user)):
    """Update user profile fields."""
    try:
        return await profile_service.update_profile(user["id"], body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/update")
async def patch_profile(body: dict, user: dict = Depends(get_current_user)):
    """Patch user profile fields (alias for PUT)."""
    try:
        return await profile_service.update_profile(user["id"], body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/job-preferences")
async def update_job_preferences(body: dict, user: dict = Depends(get_current_user)):
    """Update job search preferences."""
    try:
        return await profile_service.update_job_preferences(user["id"], body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/platform-accounts")
async def update_platform_accounts(body: dict, user: dict = Depends(get_current_user)):
    """Update platform login credentials (encrypted)."""
    try:
        return await profile_service.update_platform_accounts(user["id"], body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/save-all")
async def save_all_profile(body: dict, user: dict = Depends(get_current_user)):
    """Atomic update of all profile sections."""
    try:
        return await profile_service.atomic_save_profile(user["id"], body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me")
async def delete_my_account(user: dict = Depends(get_current_user)):
    """Permanently delete the user account and all associated data."""
    success = await profile_service.delete_full_profile(user["id"])
    if not success:
        raise HTTPException(status_code=400, detail="Could not delete account")
    return {"message": "Account deleted successfully"}

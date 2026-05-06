"""
LinkedIn import endpoint.
POST /api/profile/import-linkedin

Accepts raw scraped JSON from extension → parses → soft-merges into profile.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Optional
from dependencies import get_current_user
from services import profile_service
from services.linkedin_parser import parse_linkedin_data, merge_linkedin_data
from loguru import logger

router = APIRouter(prefix="/profile", tags=["Profile"])


class LinkedInImportRequest(BaseModel):
    raw_linkedin_data: dict
    overwrite: bool = False   # if True, overwrite existing fields too


@router.post("/import-linkedin")
async def import_linkedin(
    body: LinkedInImportRequest,
    user: dict = Depends(get_current_user),
):
    """
    Parse scraped LinkedIn data and merge into the user's SmartApply profile.
    By default uses soft merge (only fills empty fields).
    Set overwrite=true to replace all fields.
    """
    raw = body.raw_linkedin_data

    if not raw:
        raise HTTPException(status_code=400, detail="raw_linkedin_data is required")

    # Validate minimum useful data
    if not raw.get("first_name") and not raw.get("linkedin_headline"):
        raise HTTPException(
            status_code=400,
            detail="Scraped data too thin — profile may be private or scrape failed",
        )

    # Parse raw → structured
    try:
        parsed = parse_linkedin_data(raw)
    except Exception as e:
        logger.error(f"LinkedIn parse error for user {user['id']}: {e}")
        raise HTTPException(status_code=422, detail=f"Parse failed: {e}")

    # Get current profile for merge logic
    current = await profile_service.get_full_profile(user["id"])
    existing_profile = current.get("profile", {})

    profile_update: dict
    if body.overwrite:
        # Full overwrite — use all parsed fields
        profile_update = parsed["profile"]
    else:
        # Soft merge — only fill empty fields
        profile_update = merge_linkedin_data(existing_profile, parsed)

    if not profile_update:
        return {
            "message": "Profile already complete — no fields updated",
            "updated_fields": [],
            "preview": parsed["profile"],
        }

    # Update profile
    try:
        await profile_service.update_profile(user["id"], profile_update)
    except Exception as e:
        logger.error(f"Profile update error for user {user['id']}: {e}")
        raise HTTPException(status_code=500, detail=f"Profile update failed: {e}")

    # Update job preferences if search terms extracted
    jp = parsed.get("job_preferences", {})
    if jp:
        existing_jp = current.get("job_preferences", {})
        # Don't overwrite existing search terms unless empty
        if not existing_jp.get("search_terms") and jp.get("search_terms"):
            try:
                await profile_service.update_job_preferences(user["id"], jp)
            except Exception:
                pass  # Non-fatal

    updated_fields = list(profile_update.keys())
    logger.info(f"LinkedIn import for user {user['id']}: updated {len(updated_fields)} fields")

    return {
        "message": f"Profile updated with {len(updated_fields)} fields from LinkedIn",
        "updated_fields": updated_fields,
        "preview": {
            "name":     f"{profile_update.get('first_name', '')} {profile_update.get('last_name', '')}".strip(),
            "headline": profile_update.get("linkedin_headline", ""),
            "skills":   profile_update.get("skills_summary", "")[:100],
            "yoe":      profile_update.get("years_of_experience"),
        },
        "search_terms_added": parsed.get("search_terms", []),
    }

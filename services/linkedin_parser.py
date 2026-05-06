"""
LinkedIn scrape parser — transforms raw extension-scraped JSON
into SmartApply profile + job_preferences schema.

merge_linkedin_data() implements "soft merge":
  - Only overwrite empty/None fields in existing profile.
  - User's manual edits are never overwritten.
  - Raw _raw arrays stored in profile for future use.
"""

from typing import Any, Optional
import re


# ── Field mappings ────────────────────────────────────────────────────────────

def parse_linkedin_data(raw: dict) -> dict:
    """
    Transform raw scraped LinkedIn JSON → SmartApply profile dict.
    Returns dict ready for profile_service.update_profile().
    """
    raw_experience   = raw.get("_raw", {}).get("experience", [])
    raw_education    = raw.get("_raw", {}).get("education",  [])
    raw_skills       = raw.get("_raw", {}).get("skills",     [])
    raw_certs        = raw.get("_raw", {}).get("certifications", [])
    raw_languages    = raw.get("_raw", {}).get("languages",  [])

    # ── Personal ─────────────────────────────────────────────────────────────
    first_name = _clean(raw.get("first_name"))
    last_name  = _clean(raw.get("last_name"))
    location   = _clean(raw.get("current_city"))

    # Location may be "Hyderabad, Telangana, India" → split city / state / country
    city, state, country = _parse_location(raw.get("location") or location)

    # ── Professional ──────────────────────────────────────────────────────────
    headline      = _clean(raw.get("linkedin_headline"))
    summary       = _clean(raw.get("linkedin_summary"))
    skills_csv    = _clean(raw.get("skills_summary")) or ", ".join(raw_skills[:30])
    yoe           = _int(raw.get("years_of_experience"))
    employer      = _clean(raw.get("recent_employer"))
    linkedin_url  = _clean(raw.get("linkedin_profile"))
    website       = _clean(raw.get("website"))
    github        = _extract_github(raw.get("github") or "", raw_experience, summary or "")
    edu_text      = _clean(raw.get("education_text")) or _build_edu_text(raw_education)
    exp_text      = _clean(raw.get("experience_text")) or _build_exp_text(raw_experience)

    # ── Job search terms from recent titles ───────────────────────────────────
    search_terms = _extract_search_terms(raw_experience, headline or "")

    # ── Return parsed profile ─────────────────────────────────────────────────
    profile_data = {
        k: v for k, v in {
            "first_name":         first_name,
            "last_name":          last_name,
            "current_city":       city,
            "state":              state,
            "country":            country or "India",
            "linkedin_profile":   linkedin_url,
            "linkedin_headline":  headline,
            "linkedin_summary":   summary,
            "skills_summary":     skills_csv,
            "years_of_experience": str(yoe) if yoe is not None else None,
            "recent_employer":    employer,
            "education_text":     edu_text,
            "experience_text":    exp_text,
            "website":            website,
            "github":             github,
            # Store raw data as extended fields (profile update allows extras via Pydantic ignore)
            "_linkedin_raw_experience":    raw_experience,
            "_linkedin_raw_education":     raw_education,
            "_linkedin_raw_skills":        raw_skills,
            "_linkedin_raw_certifications": raw_certs,
            "_linkedin_raw_languages":     raw_languages,
        }.items()
        if v is not None and v != "" and v != []
    }

    job_prefs = {}
    if search_terms:
        job_prefs["search_terms"] = search_terms

    return {
        "profile":          profile_data,
        "job_preferences":  job_prefs,
        "search_terms":     search_terms,
    }


def merge_linkedin_data(existing_profile: dict, parsed: dict) -> dict:
    """
    Soft merge: only fill fields that are currently empty/None/falsy
    in the existing profile. Never overwrite existing manual edits.

    existing_profile: current profile from DB (cleaned, no _id/user_id)
    parsed:           output of parse_linkedin_data()
    Returns merged dict ready for update_profile().
    """
    profile_update = {}
    new_prof = parsed.get("profile", {})

    for key, new_val in new_prof.items():
        if not new_val:
            continue
        existing_val = existing_profile.get(key)
        # Only overwrite if existing is empty/falsy
        if not existing_val:
            profile_update[key] = new_val

    return profile_update


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(val: Any) -> Optional[str]:
    if not val:
        return None
    s = str(val).strip()
    return s if s else None


def _int(val: Any) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _parse_location(location_str: Optional[str]):
    """Split 'City, State, Country' string into components."""
    if not location_str:
        return None, None, None
    parts = [p.strip() for p in location_str.split(",")]
    city    = parts[0] if len(parts) > 0 else None
    state   = parts[1] if len(parts) > 1 else None
    country = parts[2] if len(parts) > 2 else None
    return city, state, country


def _extract_github(github_field: str, experiences: list, summary: str) -> Optional[str]:
    """Extract GitHub URL from any available text source."""
    # Prefer explicit field
    if github_field and "github.com" in github_field.lower():
        m = re.search(r"github\.com/[\w-]+", github_field, re.I)
        if m:
            return "https://" + m.group()

    # Search experience descriptions and summary
    full_text = summary + " " + " ".join(
        e.get("description", "") for e in experiences
    )
    m = re.search(r"github\.com/[\w-]+", full_text, re.I)
    return ("https://" + m.group()) if m else None


def _build_edu_text(education: list) -> Optional[str]:
    if not education:
        return None
    lines = []
    for e in education:
        parts = [p for p in [e.get("school"), e.get("degree"), e.get("dates")] if p]
        if parts:
            lines.append(" | ".join(parts))
    return "\n".join(lines)[:1000] if lines else None


def _build_exp_text(experience: list) -> Optional[str]:
    if not experience:
        return None
    lines = []
    for e in experience[:5]:  # top 5 roles
        title   = e.get("title",   "")
        company = e.get("company", "")
        dates   = e.get("dates",   "")
        desc    = e.get("description", "")
        header  = f"{title}" + (f" — {company}" if company else "") + (f" ({dates})" if dates else "")
        lines.append(header)
        if desc:
            lines.append("• " + desc[:300])
        lines.append("")
    return "\n".join(lines).strip()[:3000] if lines else None


def _extract_search_terms(experience: list, headline: str) -> list:
    """Derive target job titles from work history headline."""
    terms = set()

    # Most recent title
    if experience:
        recent_title = experience[0].get("title", "")
        if recent_title:
            terms.add(recent_title.strip())

    # Parse headline for role — "Software Engineer | Python | 2 YOE"
    if headline:
        # Take portion before first | or , or —
        role = re.split(r"[|,—\-]", headline)[0].strip()
        if role and len(role) > 2:
            terms.add(role)

    return list(terms)[:5]

"""
AI Analysis Service: ATS, Match Scoring, and Resume Parsing.
"""

from services import ai_core
from utils import redact_pii
from loguru import logger

async def analyze_ats(resume_text: str, job_description: str) -> dict:
    """Full ATS compatibility analysis."""
    from services.ai_service import _ATS_RUBRIC # Temporary import until fully migrated
    has_jd = bool(job_description.strip())

    system_prompt = f"""You are a brutally honest ATS analyst. Your scores are CALIBRATED.
{_ATS_RUBRIC}
Return ONLY valid JSON with ats_score, matched_keywords, missing_keywords, section_scores, improvements, and summary."""

    safe_resume = redact_pii(resume_text[:4000])
    safe_jd = redact_pii(job_description[:3000])
    user_prompt = f"RESUME:\n{safe_resume}\n\nJD:\n{safe_jd}" if has_jd else f"RESUME:\n{safe_resume}"

    raw = await ai_core._call_nim(system_prompt, user_prompt, max_tokens=2000, temperature=0.1)
    parsed = ai_core._parse_json_from_response(raw)
    
    if not parsed:
        return {
            "ats_score": 0,
            "overall_verdict": "error",
            "matched_keywords": [],
            "missing_keywords": [],
            "section_scores": {},
            "improvements": [],
            "summary": "Failed to parse AI response."
        }

    if "ats_score" in parsed:
        score = max(0, min(100, int(parsed["ats_score"])))
        parsed["ats_score"] = score
        parsed["overall_verdict"] = "pass" if score >= 75 else "needs_improvement" if score >= 45 else "poor"
    return parsed

async def compute_match_score(resume_text: str, job_description: str) -> dict:
    """Compute match score and detect skill gaps."""
    if not resume_text.strip() or not job_description.strip():
        return {
            "match_score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "skill_gap": {"has_gap": False, "severity": "none", "recommendation": ""},
            "summary": "Insufficient data to compute match score."
        }

    system_prompt = """You are an expert job matching analyst. Return ONLY valid JSON with match_score (0-100), matched_skills, missing_skills, skill_gap (has_gap, severity, recommendation), and summary."""
    safe_resume = redact_pii(resume_text[:3500])
    safe_jd = redact_pii(job_description[:3000])
    user_prompt = f"RESUME:\n{safe_resume}\n\nJD:\n{safe_jd}"

    raw = await ai_core._call_nim(system_prompt, user_prompt, max_tokens=1500, temperature=0.15)
    return ai_core._parse_json_from_response(raw)

async def parse_resume_with_ai(resume_text: str) -> dict:
    """
    Robust AI-powered resume field extraction.
    Much more accurate than regex heuristics.
    """
    system_prompt = """You are an expert resume parser. Extract structured information from the provided resume text.
Return ONLY valid JSON with this structure:
{
  "first_name": "",
  "last_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_profile": "",
  "github": "",
  "current_city": "",
  "years_of_experience": 0,
  "skills_summary": "comma separated skills",
  "summary": "brief professional bio"
}
If a field is not found, return null or empty string. Be precise."""

    safe_text = redact_pii(resume_text[:6000])
    user_prompt = f"RESUME TEXT:\n{safe_text}"

    try:
        raw = await ai_core._call_nim(system_prompt, user_prompt, max_tokens=1500, temperature=0.0)
        parsed = ai_core._parse_json_from_response(raw)
        if parsed:
            # Re-insert the full text for legacy support in dashboard
            parsed["user_information_all"] = safe_text
            return parsed
    except Exception as e:
        logger.error(f"AI Resume Parsing failed: {e}")
    
    return {}

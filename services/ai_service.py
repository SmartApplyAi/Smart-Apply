"""
AI service: Facade for modular AI services.
Re-exports functions to maintain backward compatibility while using modular implementations.
"""

from services import ai_core
from services.ai_analysis_service import analyze_ats, compute_match_score, parse_resume_with_ai
from services.ai_career_service import (
    answer_question, generate_cover_letter, generate_skill_roadmap, suggest_resume_improvements
)
from services.ai_interview_service import interview_chat
from utils import redact_pii

# Re-export core functions for tests and legacy internal use
_parse_json_from_response = ai_core._parse_json_from_response
_call_nim = ai_core._call_nim
reset_keys_cycle = ai_core.reset_keys_cycle

_ATS_RUBRIC = """
STRICT SCORING RUBRIC — follow exactly, do not be generous:

SCORE RANGES (ats_score):
  0–20  : Unreadable / missing critical sections
  21–40 : Wrong format (tables/columns), missing contact
  41–55 : Basic, weak keyword match, no metrics
  56–69 : Decent structure, some keywords, 1-2 metrics
  70–79 : Good resume, moderate keywords, some metrics
  80–89 : Strong, most keywords matched, multiple metrics
  90–100: Near-perfect, all keywords, strong metrics
"""

async def answer_screening_question(
    question: str, user_info: str, job_description: str,
    field_type: str = "", available_options: list = None
) -> dict:
    """Specialized logic for screening questions."""
    field_constraints = ""
    if available_options:
        field_constraints = f"\n\nCONSTRAINT: Answer MUST be one of {available_options}"
    
    system_prompt = f"Answer concisely for a job form. {field_constraints}"
    user_prompt = f"Profile: {redact_pii(user_info[:2000])}\nQ: {question}"
    
    answer = await ai_core._call_nim(system_prompt, user_prompt, max_tokens=100, temperature=0.05)
    return {"answer": answer.strip()}

async def match_jobs(user_profile: dict, job_list: list) -> dict:
    """Legacy wrapper for matching jobs against a profile."""
    # If no job description is provided, we can't really match.
    # But for the test case, we just return empty if job_list is empty.
    if not job_list:
        return {"matched_jobs": []}
    
    # Extract text representation of profile for AI
    resume_text = user_profile.get("user_information_all", str(user_profile))
    # We only take the first job for a quick match score if needed, 
    # but the facade version is simplified.
    return await compute_match_score(resume_text, str(job_list[0]))

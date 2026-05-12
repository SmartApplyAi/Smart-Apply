"""
AI Career Service: Jarvis Chat, Cover Letters, and Roadmaps.
"""

from services import ai_core
from utils import redact_pii

async def answer_question(question: str, user_info: str) -> dict:
    """Answer a general career question."""
    safe_info = redact_pii(user_info[:4000]) if user_info else ""
    system_prompt = "You are SmartApply AI, a professional career assistant. Answer concisely based on user profile."
    user_prompt = f"Context:\n{safe_info}\n\nQuestion: {question}"
    answer = await ai_core._call_nim(system_prompt, user_prompt)
    return {"answer": answer}

async def generate_cover_letter(user_info: str, job_title: str, company: str) -> dict:
    """Generate a tailored cover letter."""
    if not user_info.strip():
        return {"error": "User profile is empty. Please upload a resume first."}
    
    safe_info = redact_pii(user_info[:4000])
    system_prompt = "You are an expert cover letter writer. Keep it 3-4 paragraphs, professional, and specific."
    user_prompt = f"Role: {job_title} at {company}\nProfile:\n{safe_info}"
    cover_letter = await ai_core._call_nim(system_prompt, user_prompt, max_tokens=1500)
    return {"cover_letter": cover_letter}

async def generate_skill_roadmap(current_skills: list, target_skills: list, target_role: str = "") -> dict:
    """Generate a 30/60/90-day learning roadmap."""
    system_prompt = """Create a 3-phase (Days 1-30, 31-60, 61-90) learning roadmap. 
Return ONLY valid JSON with target_role, total_duration, roadmap (phases with skills/resources), milestones, and tips."""
    
    have = ", ".join(current_skills) if current_skills else "None"
    need = ", ".join(target_skills) if target_skills else "None"
    user_prompt = f"Role: {target_role}\nHave: {have}\nNeed: {need}"

    raw = await ai_core._call_nim(system_prompt, user_prompt, max_tokens=3000, temperature=0.4)
    parsed = ai_core._parse_json_from_response(raw)
    
    if not parsed:
        return {
            "target_role": target_role,
            "total_duration": "",
            "roadmap": [],
            "milestones": [],
            "tips": [],
            "error": "Failed to generate roadmap. Please try again."
        }
    return parsed

async def suggest_resume_improvements(resume_text: str) -> dict:
    """AI-powered resume improvement suggestions."""
    system_prompt = "You are an expert resume coach. Analyze and suggest improvements. Return JSON with overall_grade, strengths, weaknesses, suggestions, and action_items."
    safe_resume = redact_pii(resume_text[:4000])
    raw = await ai_core._call_nim(system_prompt, f"RESUME:\n{safe_resume}", max_tokens=2000)
    return ai_core._parse_json_from_response(raw)

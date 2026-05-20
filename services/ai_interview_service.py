"""
AI Interview Service: Mock Interviewer conversational logic.
"""

from services import ai_core

_INTERVIEW_SYSTEM_PROMPTS = {
    "behavioral": "You are a behavioral interviewer. Ask ONE question at a time using STAR.",
    "technical": "You are a technical interviewer. Ask ONE question at a time.",
    "hr": "You are an HR interviewer. Ask ONE screening question at a time.",
}

async def interview_chat(messages: list, interview_type: str = "behavioral", job_description: str = "", job_title: str = "", end_interview: bool = False) -> dict:
    """Conduct mock interview turn or final evaluation."""
    itype = interview_type if interview_type in _INTERVIEW_SYSTEM_PROMPTS else "behavioral"
    
    if end_interview:
        eval_system = "Evaluate the following interview performance. Return ONLY JSON with overall_score, strengths, weaknesses, tips, and summary."
        transcript = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        raw = await ai_core._call_nim(eval_system, transcript, max_tokens=1500, temperature=0.2)
        return {"reply": "Interview complete", "is_complete": True, "evaluation": ai_core._parse_json_from_response(raw)}

    system = _INTERVIEW_SYSTEM_PROMPTS[itype] + "\nAsk ONE question. Be concise."
    context = "\n".join([f"{m['role']}: {m['content']}" for m in messages[-10:]])
    reply = await ai_core._call_nim(system, f"History:\n{context}\n\nCandidate's last response: {messages[-1]['content'] if messages else 'N/A'}", max_tokens=400)
    
    return {"reply": reply, "is_complete": False}

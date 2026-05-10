"""
AI service: NVIDIA NIM integration for all LLM-powered features.
Includes full ATS analyzer, cover letter generator, LinkedIn optimizer,
resume parser, and job matching — all powered by NVIDIA NIM.
"""

import json
import re
import httpx
import random
from config import settings
from loguru import logger
from utils import redact_pii

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_MODEL = "meta/llama-3.1-70b-instruct"

import itertools

import asyncio

_keys_cycle = None
_keys_lock = None


async def _get_api_key() -> str:
    """Round-robin through available NIM API keys (thread-safe cycle)."""
    global _keys_cycle, _keys_lock
    
    if _keys_lock is None:
        _keys_lock = asyncio.Lock()

    async with _keys_lock:
        if _keys_cycle is None:
            keys = await settings.get_nim_api_key_list()
            if not keys:
                raise ValueError("No NVIDIA NIM API keys configured. Add NIM_API_KEYS to .env")
            _keys_cycle = itertools.cycle(keys)
        
        return next(_keys_cycle)


async def reset_keys_cycle():
    """Reset the API key cycle (useful when keys are updated in settings)."""
    global _keys_cycle, _keys_lock
    # 1. Clear the cached list in settings first (async)
    await settings.reset_nim_cache()

    if _keys_lock is None:
        _keys_lock = asyncio.Lock()

    async with _keys_lock:
        # 2. Null out the cycle so it's recreated on next call
        _keys_cycle = None
    logger.info("NVIDIA NIM API key cycle reset.")


async def _call_nim(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Call the NVIDIA NIM API with multiple keys and exponential backoff."""
    import asyncio
    
    # 1. Get number of keys to determine retries (thread-safe setup)
    async with _keys_lock:
        keys = await settings.get_nim_api_key_list()
        num_keys = len(keys)
        
    max_retries = max(num_keys * 2, 5) # Try each key twice or at least 5 times
    
    for attempt in range(max_retries):
        api_key = await _get_api_key()
        
        payload = {
            "model": NIM_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": 0.9,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    f"{NIM_BASE_URL}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                
                # Success
                if response.status_code == 200:
                    data = response.json()
                    if data.get("choices") and len(data["choices"]) > 0:
                        return data["choices"][0]["message"]["content"].strip()
                    return ""
                
                # Rate limit or Auth error
                if response.status_code in (401, 403, 429):
                    wait_time = min(2**attempt + (random.randint(0, 1000) / 1000), 10)
                    logger.warning(f"NIM API error {response.status_code} (attempt {attempt+1}/{max_retries}). Retrying in {wait_time:.2f}s with next key…")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()

        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.ConnectError) as e:
            wait_time = min(2**attempt + (random.randint(0, 1000) / 1000), 10)
            logger.error(f"NIM API {type(e).__name__} (attempt {attempt+1}/{max_retries}): {e}. Retrying in {wait_time:.2f}s…")
            if attempt < max_retries - 1:
                await asyncio.sleep(wait_time)
                continue
            raise ValueError("AI service currently overwhelmed. Please try again in a few moments.")
        except Exception as e:
            logger.error(f"Unexpected NIM API error: {e}")
            raise ValueError("AI service unavailable")

    raise ValueError("AI service failed after multiple retries.")


def _parse_json_from_response(text: str) -> dict:
    """Extract JSON from an LLM response that may contain markdown fences."""
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return {}


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC AI FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════


async def answer_question(question: str, user_info: str) -> dict:
    """Answer a general question using the user's context."""
    system_prompt = (
        "You are SmartApply AI, a professional career assistant. "
        "Answer the user's request concisely and accurately based on their profile information. "
        "Do not add disclaimers or meta-commentary. Return only the requested content."
    )
    user_prompt = f"User Profile Context:\n{user_info}\n\nRequest:\n{question}"
    answer = await _call_nim(system_prompt, user_prompt)
    return {"answer": answer}


async def answer_screening_question(
    question: str, user_info: str, job_description: str,
    field_type: str = "", available_options: list = None
) -> dict:
    """Answer a specific job application screening question concisely for form-filling."""
    
    # Build constraint instructions based on field type
    field_constraints = ""
    if available_options and len(available_options) > 0:
        opts_str = ", ".join([f'"{o}"' for o in available_options])
        field_constraints = (
            f"\n\nFIELD CONSTRAINT — The answer MUST be EXACTLY one of these options (copy verbatim): [{opts_str}]. "
            f"Do NOT rephrase, abbreviate, or paraphrase. Return the exact option text."
        )
    elif field_type == "number" or field_type == "number_input":
        field_constraints = "\n\nFIELD CONSTRAINT — Return ONLY a number (digits only, no text, no units). Example: 3"
    elif field_type == "date" or field_type == "date_input":
        field_constraints = "\n\nFIELD CONSTRAINT — Return a date in YYYY-MM-DD format only."
    elif field_type == "radio":
        field_constraints = "\n\nFIELD CONSTRAINT — This is a Yes/No or multiple choice radio button. Return EXACTLY one of the option labels."
    
    system_prompt = (
        "You are SmartApply AI, an expert career assistant automating a job application. "
        "You are presented with a screening question from an application form. "
        "Answer it concisely, professionally, and honestly based on the provided user profile and job description. "
        "CRITICAL RULES: "
        "1. If it's a Yes/No question, answer EXACTLY 'Yes' or 'No'. "
        "2. If it asks for years of experience, return JUST a number (e.g., '3'). "
        "3. If it asks 'Do you require visa sponsorship?' and the user is a citizen/authorized to work, answer 'No'. "
        "4. Do NOT provide explanations, pleasantries, formatting, or markdown. "
        "5. Your output will be directly typed into a form field, so output ONLY the raw answer value. "
        "6. For salary/compensation questions, return just the number without currency symbols. "
        "7. If the user profile has zero years of experience, return '0' for experience questions."
        f"{field_constraints}"
    )
    
    # Safely truncate inputs to prevent context window overflow
    user_info_clean = user_info[:3000]
    job_desc_clean = job_description[:3000] if job_description else "No job description provided."
    
    user_prompt = f"User Profile:\n{user_info_clean}\n\nJob Description:\n{job_desc_clean}\n\nScreening Question:\n{question}"
    if field_type:
        user_prompt += f"\n\nField Type: {field_type}"
    
    # Use very low temperature for deterministic, concise answers
    # Use fewer tokens for constrained fields (faster response)
    max_tok = 50 if (available_options or field_type in ("number", "number_input", "radio")) else 100
    answer = await _call_nim(system_prompt, user_prompt, max_tokens=max_tok, temperature=0.05)
    
    # Post-process: if options were provided, ensure answer matches one of them
    clean_answer = answer.strip(' "\'')
    if available_options and len(available_options) > 0:
        # Exact match first
        for opt in available_options:
            if opt.lower() == clean_answer.lower():
                clean_answer = opt
                break
        else:
            # Fuzzy match: find best overlap
            best_opt = None
            best_score = 0
            answer_words = set(clean_answer.lower().split())
            for opt in available_options:
                opt_words = set(opt.lower().split())
                overlap = len(answer_words & opt_words)
                if overlap > best_score:
                    best_score = overlap
                    best_opt = opt
                # Also check substring containment
                if clean_answer.lower() in opt.lower() or opt.lower() in clean_answer.lower():
                    if len(opt) > best_score * 5:  # Prefer longer substring matches
                        best_opt = opt
                        best_score = overlap + 5
            if best_opt:
                logger.info(f"AI answer '{clean_answer}' fuzzy-matched to option '{best_opt}'")
                clean_answer = best_opt
            else:
                # Last resort: use first non-empty option
                logger.warning(f"AI answer '{clean_answer}' matches no option in {available_options}")
                clean_answer = available_options[0] if available_options else clean_answer
    
    return {"answer": clean_answer}


async def generate_cover_letter(user_info: str, job_title: str, company: str) -> dict:
    """Generate a tailored cover letter."""
    if not user_info or user_info.strip() == "":
        return {"error": "User profile information is required to generate a cover letter."}
    
    system_prompt = (
        "You are SmartApply AI, an expert career coach and cover letter writer. "
        "Write a professional, compelling cover letter. "
        "Keep it 3-4 paragraphs, confident, and specific to the candidate's background. "
        "Do not use placeholder brackets like [Your Name]. "
        "Use the actual details from the profile. Start with 'Dear Hiring Manager,'."
    )
    user_prompt = (
        f"Write a cover letter for applying to the position of '{job_title}' at '{company}'.\n\n"
        f"Candidate Profile:\n{user_info}"
    )
    cover_letter = await _call_nim(system_prompt, user_prompt, max_tokens=1500)
    return {"cover_letter": cover_letter}


# ═══════════════════════════════════════════════════════════════════════════
#  ATS ANALYZER — FULL IMPLEMENTATION
# ═══════════════════════════════════════════════════════════════════════════


_ATS_RUBRIC = """
STRICT SCORING RUBRIC — follow exactly, do not be generous:

SCORE RANGES (ats_score):
  0–20  : Unreadable / missing critical sections / blank to ATS
  21–40 : Has text but wrong format (tables/columns/images), missing contact, <3 sections
  41–55 : Basic, some skills, weak keyword match, no metrics, thin experience
  56–69 : Decent structure, some keywords, 1-2 metrics, but gaps in required skills
  70–79 : Good resume, moderate keywords, some metrics, minor issues
  80–89 : Strong, most keywords matched, multiple metrics, clean ATS-safe format
  90–100: Near-perfect, all keywords, strong metrics everywhere, perfectly tailored

PENALIZE HARD:
  - Tables/columns/text boxes (ATS cannot parse) → -15 pts
  - No quantified achievements (no numbers/%) → -10 pts
  - Missing contact/LinkedIn → -8 pts
  - Skills section absent → -10 pts
  - Less than 300 words total → -15 pts
  - JD keywords completely absent → -20 pts (if JD provided)
  - Generic buzzwords without evidence → -5 pts
"""


async def analyze_ats(resume_text: str, job_description: str) -> dict:
    has_jd = bool(job_description.strip())

    system_prompt = f"""You are a brutally honest ATS analyst. Your scores are CALIBRATED and DIFFERENTIATED — not every resume scores 70-85. Most resumes score 40-65.

{_ATS_RUBRIC}

{"Match job description keywords precisely. Missing required skills = hard penalty." if has_jd else "No JD provided. Analyze general ATS readiness. Be strict — most resumes have significant weaknesses."}

Return ONLY valid JSON, no markdown fences:

{{
  "ats_score": <integer 0-100, STRICTLY follow rubric>,
  "overall_verdict": "<pass|needs_improvement|poor>",
  "matched_keywords": ["exact keywords FOUND in resume"],
  "missing_keywords": ["important keywords MISSING"],
  "section_scores": {{
    "skills_match": <0-100>,
    "experience_relevance": <0-100>,
    "education_fit": <0-100>,
    "keyword_density": <0-100>,
    "formatting_quality": <0-100>,
    "readability": <0-100>,
    "ats_friendly": <0-100>
  }},
  "improvements": [
    {{"priority": "high|medium|low", "category": "formatting|content|skills|keywords", "tip": "specific actionable advice"}},
    ...at least 5 improvements...
  ],
  "formatting_issues": ["specific issue found"],
  "summary": "2-3 sentences: honest strengths AND weaknesses, explain score rationale"
}}"""

    user_prompt = (
        f"RESUME TEXT:\n{resume_text[:4000]}\n\nJOB DESCRIPTION:\n{job_description[:3000]}"
        if has_jd else
        f"RESUME TEXT:\n{resume_text[:4000]}"
    )

    raw = await _call_nim(system_prompt, user_prompt, max_tokens=2500, temperature=0.1)
    parsed = _parse_json_from_response(raw)

    if not parsed or "ats_score" not in parsed:
        return {
            "ats_score": 0, "overall_verdict": "error", "analysis": raw,
            "error": "Could not parse structured analysis.",
            "matched_keywords": [], "missing_keywords": [],
            "section_scores": {}, "improvements": [], "formatting_issues": [], "summary": "",
        }

    # Clamp + enforce verdict consistency
    score = max(0, min(100, int(parsed.get("ats_score", 0))))
    parsed["ats_score"] = score
    parsed["overall_verdict"] = "pass" if score >= 75 else "needs_improvement" if score >= 45 else "poor"

    return parsed



async def analyze_resume_standalone(resume_text: str) -> dict:
    """
    Analyze a resume without a job description.
    Provides general ATS readiness assessment.
    """
    system_prompt = """You are an expert resume reviewer and ATS specialist.
Analyze this resume for general ATS readiness and return a STRICT JSON object:

{
  "ats_readiness_score": <integer 0-100>,
  "verdict": "<excellent|good|needs_work|poor>",
  "detected_role": "Detected target role/title from resume",
  "detected_skills": ["skill1", "skill2", ...],
  "detected_experience_years": <integer or null>,
  "section_analysis": {
    "contact_info": {"present": true/false, "score": 0-100, "notes": "..."},
    "summary": {"present": true/false, "score": 0-100, "notes": "..."},
    "experience": {"present": true/false, "score": 0-100, "notes": "..."},
    "education": {"present": true/false, "score": 0-100, "notes": "..."},
    "skills": {"present": true/false, "score": 0-100, "notes": "..."},
    "projects": {"present": true/false, "score": 0-100, "notes": "..."}
  },
  "formatting_issues": ["issue1", ...],
  "improvement_suggestions": [
    {"priority": "high|medium|low", "suggestion": "..."},
    ...
  ],
  "keyword_recommendations": ["keyword1", "keyword2", ...],
  "overall_feedback": "2-3 sentence summary"
}

Return ONLY valid JSON."""

    user_prompt = f"RESUME:\n{resume_text[:4000]}"
    raw = await _call_nim(system_prompt, user_prompt, max_tokens=2000, temperature=0.3)
    parsed = _parse_json_from_response(raw)

    if not parsed:
        return {"analysis": raw, "error": "Could not parse structured analysis"}

    return parsed


# ═══════════════════════════════════════════════════════════════════════════
#  LINKEDIN OPTIMIZER — FULL IMPLEMENTATION
# ═══════════════════════════════════════════════════════════════════════════


async def optimize_linkedin(profile_data: dict) -> dict:
    """
    LinkedIn profile optimization suggestions using NVIDIA NIM.
    """
    system_prompt = """You are a LinkedIn optimization expert.
Analyze the user's LinkedIn profile data and provide actionable optimization suggestions.
Return a STRICT JSON object:

{
  "overall_score": <integer 0-100>,
  "headline_suggestion": "Optimized headline text",
  "summary_suggestion": "Optimized About section text",
  "skills_to_add": ["skill1", "skill2", ...],
  "keywords_to_include": ["keyword1", "keyword2", ...],
  "section_improvements": [
    {"section": "headline|summary|experience|skills|education", "current_score": 0-100, "suggestion": "..."},
    ...
  ],
  "visibility_tips": ["tip1", "tip2", ...],
  "overall_feedback": "Summary paragraph"
}

Return ONLY valid JSON."""

    profile_str = json.dumps(profile_data, default=str)[:3000]
    profile_str = redact_pii(profile_str)
    user_prompt = f"LinkedIn Profile Data:\n{profile_str}"

    raw = await _call_nim(system_prompt, user_prompt, max_tokens=2000, temperature=0.5)
    parsed = _parse_json_from_response(raw)

    if not parsed:
        return {"analysis": raw, "message": "Raw analysis returned"}

    return parsed


# ═══════════════════════════════════════════════════════════════════════════
#  JOB MATCHING & RANKING
# ═══════════════════════════════════════════════════════════════════════════


async def match_jobs(user_profile: dict, jobs: list) -> dict:
    """Match and rank jobs based on user profile fit."""
    if not jobs:
        return {"matched_jobs": [], "message": "No jobs provided for matching"}

    system_prompt = """You are a job matching AI. Given the candidate profile and a list of jobs,
rank them by fit and return a JSON object:

{
  "ranked_jobs": [
    {"index": 0, "match_score": 0-100, "match_reasons": ["reason1", ...], "concerns": ["concern1", ...]},
    ...
  ],
  "overall_recommendation": "Summary of best matches"
}

Return ONLY valid JSON."""

    profile_str = json.dumps(user_profile, default=str)[:1500]
    profile_str = redact_pii(profile_str)
    jobs_str = json.dumps(jobs[:10], default=str)[:2000]
    user_prompt = f"Candidate:\n{profile_str}\n\nJobs:\n{jobs_str}"

    raw = await _call_nim(system_prompt, user_prompt, max_tokens=1500, temperature=0.3)
    parsed = _parse_json_from_response(raw)

    if not parsed:
        return {"analysis": raw, "message": "Raw analysis returned"}

    return parsed


async def suggest_resume_improvements(resume_text: str) -> dict:
    """AI-powered resume improvement suggestions."""
    system_prompt = """You are an expert resume coach. Analyze this resume and provide
specific, actionable improvements. Return a JSON object:

{
  "overall_grade": "A|B|C|D|F",
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...],
  "suggestions": [
    {"section": "summary|experience|skills|education|formatting|other", "priority": "high|medium|low", "current": "What's there now (brief)", "improved": "Suggested improvement"},
    ...
  ],
  "action_items": ["Do this first", "Then this", ...],
  "power_words_to_add": ["achieved", "implemented", "optimized", ...],
  "overall_feedback": "2-3 sentences"
}

Return ONLY valid JSON."""

    user_prompt = f"RESUME:\n{resume_text[:4000]}"
    raw = await _call_nim(system_prompt, user_prompt, max_tokens=2000, temperature=0.4)
    parsed = _parse_json_from_response(raw)

    if not parsed:
        return {"analysis": raw, "message": "Raw analysis returned"}

    return parsed


# ═══════════════════════════════════════════════════════════════════════════
#  AI INTERVIEW PREP — REAL-TIME MOCK INTERVIEWER
# ═══════════════════════════════════════════════════════════════════════════

_INTERVIEW_SYSTEM_PROMPTS = {
    "behavioral": (
        "You are an expert behavioral interviewer at a top-tier company. "
        "Ask ONE behavioral question at a time using the STAR method framework. "
        "Focus on: leadership, teamwork, conflict resolution, problem-solving, and adaptability. "
        "After the candidate answers, give brief constructive feedback (1-2 sentences) then ask the NEXT question. "
        "Do NOT repeat questions. Vary the topics."
    ),
    "technical": (
        "You are a senior technical interviewer at a FAANG-level company. "
        "Ask ONE technical question at a time — covering system design, coding concepts, "
        "data structures, algorithms, architecture, and debugging scenarios. "
        "Adapt difficulty based on the candidate's answers. "
        "After each answer, give brief feedback then ask the NEXT question."
    ),
    "hr": (
        "You are an HR interviewer conducting a professional screening interview. "
        "Ask ONE question at a time about: motivation, career goals, salary expectations, "
        "work culture preferences, strengths/weaknesses, and situational judgment. "
        "Be warm but professional. After each answer, give brief feedback then ask the NEXT question."
    ),
    "custom": (
        "You are a professional interviewer conducting a mock interview for the specific role described. "
        "Tailor your questions to the job description and role provided. "
        "Ask ONE question at a time, mixing behavioral and role-specific technical questions. "
        "After each answer, give brief feedback then ask the NEXT question."
    ),
}

_INTERVIEW_BASE = (
    "\n\nCRITICAL RULES:\n"
    "1. Ask exactly ONE question per response. Never ask multiple questions.\n"
    "2. Keep your responses concise — max 3 sentences for feedback + 1 question.\n"
    "3. Be encouraging but honest. Point out weaknesses constructively.\n"
    "4. Track the conversation flow — don't repeat topics already covered.\n"
    "5. If this is the FIRST message, greet the candidate briefly and ask your first question.\n"
    "6. Do NOT use markdown formatting — speak naturally as a real interviewer would.\n"
    "7. Address the candidate directly using 'you'.\n"
)

_INTERVIEW_EVAL_PROMPT = (
    "The mock interview is now complete. Based on the ENTIRE conversation, provide a detailed "
    "performance evaluation. Return ONLY valid JSON with this exact structure:\n\n"
    "{\n"
    '  "overall_score": <integer 0-100>,\n'
    '  "communication": <integer 0-100>,\n'
    '  "confidence": <integer 0-100>,\n'
    '  "content_quality": <integer 0-100>,\n'
    '  "structure": <integer 0-100>,\n'
    '  "strengths": ["strength1", "strength2", "strength3"],\n'
    '  "weaknesses": ["area1", "area2"],\n'
    '  "tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],\n'
    '  "summary": "2-3 sentence overall assessment"\n'
    "}\n\n"
    "Be STRICT and CALIBRATED — not everyone scores 80+. Average candidates score 50-65."
)


async def interview_chat(
    messages: list,
    interview_type: str = "behavioral",
    job_description: str = "",
    job_title: str = "",
    end_interview: bool = False,
) -> dict:
    """
    Conduct a mock interview conversation turn.
    Returns the AI interviewer's next question/feedback.
    If end_interview=True, returns a full performance evaluation.
    """
    itype = interview_type if interview_type in _INTERVIEW_SYSTEM_PROMPTS else "behavioral"
    base_system = _INTERVIEW_SYSTEM_PROMPTS[itype] + _INTERVIEW_BASE

    # Add job context if provided
    if job_title:
        base_system += f"\nThe candidate is interviewing for: {job_title}\n"
    if job_description and itype == "custom":
        base_system += f"\nJob Description:\n{job_description[:2000]}\n"

    # Build conversation context from messages
    context_lines = []
    for msg in messages[-16:]:  # Keep last 16 messages for context
        role = msg.get("role", "user")
        prefix = "Candidate" if role == "user" else "Interviewer"
        context_lines.append(f"{prefix}: {msg.get('content', '')}")
    context = "\n".join(context_lines)

    if end_interview:
        # Generate final evaluation
        eval_system = (
            "You are an expert interview coach evaluating a mock interview performance. "
            + _INTERVIEW_EVAL_PROMPT
        )
        eval_prompt = f"Full interview transcript:\n{context}"
        raw = await _call_nim(eval_system, eval_prompt, max_tokens=1500, temperature=0.2)
        parsed = _parse_json_from_response(raw)

        if not parsed or "overall_score" not in parsed:
            # Return a basic evaluation if parsing fails
            return {
                "reply": "Thank you for completing this interview. You did well overall.",
                "is_complete": True,
                "evaluation": {
                    "overall_score": 60,
                    "communication": 60,
                    "confidence": 60,
                    "content_quality": 60,
                    "structure": 60,
                    "strengths": ["Completed the full interview"],
                    "weaknesses": ["Could not generate detailed evaluation"],
                    "tips": ["Practice more mock interviews", "Use the STAR method"],
                    "summary": raw[:300] if raw else "Interview completed.",
                },
            }

        # Clamp scores
        for key in ["overall_score", "communication", "confidence", "content_quality", "structure"]:
            if key in parsed:
                parsed[key] = max(0, min(100, int(parsed[key])))

        return {
            "reply": parsed.get("summary", "Interview complete. Review your scores below."),
            "is_complete": True,
            "evaluation": parsed,
        }

    # Normal conversation turn
    if not context:
        user_prompt = "Start the interview. Greet the candidate and ask your first question."
    else:
        last_msg = messages[-1].get("content", "") if messages else ""
        user_prompt = f"Interview so far:\n{context}\n\nThe candidate just said: \"{last_msg}\"\n\nGive brief feedback on their answer and ask your next question."

    reply = await _call_nim(base_system, user_prompt, max_tokens=300, temperature=0.6)

    return {
        "reply": reply,
        "is_complete": False,
    }


async def rank_jobs(user_profile: dict, jobs: list) -> dict:
    """Rank jobs by profile fit — alias for match_jobs."""
    return await match_jobs(user_profile, jobs)


# ═══════════════════════════════════════════════════════════════════════════
#  JOB MATCH SCORING & SKILL GAP DETECTION
# ═══════════════════════════════════════════════════════════════════════════


async def compute_match_score(resume_text: str, job_description: str) -> dict:
    """
    Compute a match score (0-100) between a resume and job description.
    Also detects skill gaps and provides actionable recommendations.
    """
    if not resume_text or not job_description:
        return {
            "match_score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "skill_gap": {"has_gap": False, "gap_severity": "unknown", "learnable_skills": [], "estimated_learning_time": "", "recommendation": ""},
            "summary": "Insufficient data to compute match score."
        }

    system_prompt = """You are an expert ATS and job matching analyst. Compare the candidate's resume against the job description and provide a precise match analysis.

SCORING RUBRIC:
  0-20:  Completely unrelated field/role
  21-40: Same industry but very different role/skills
  41-55: Some overlap but significant skill gaps
  56-69: Moderate match, has core skills but missing several requirements
  70-79: Good match, most required skills present, minor gaps
  80-89: Strong match, nearly all requirements met
  90-100: Perfect or near-perfect match

Return ONLY valid JSON with this exact structure:
{
  "match_score": <integer 0-100>,
  "matched_skills": ["skill1", "skill2", ...],
  "missing_skills": ["skill1", "skill2", ...],
  "skill_gap": {
    "has_gap": true/false,
    "gap_severity": "none|minor|moderate|major",
    "learnable_skills": ["skills that can be learned quickly"],
    "estimated_learning_time": "e.g. 2-4 weeks",
    "recommendation": "1-2 sentence actionable advice"
  },
  "summary": "2-3 sentence match analysis"
}"""

    user_prompt = f"RESUME:\n{resume_text[:3500]}\n\nJOB DESCRIPTION:\n{job_description[:3000]}"

    raw = await _call_nim(system_prompt, user_prompt, max_tokens=1500, temperature=0.15)
    parsed = _parse_json_from_response(raw)

    if not parsed or "match_score" not in parsed:
        return {
            "match_score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "skill_gap": {"has_gap": False, "gap_severity": "unknown", "learnable_skills": [], "estimated_learning_time": "", "recommendation": ""},
            "summary": "Could not parse match analysis.",
            "raw": raw[:500] if raw else "",
        }

    # Clamp score
    parsed["match_score"] = max(0, min(100, int(parsed.get("match_score", 0))))

    # Ensure skill_gap structure
    if "skill_gap" not in parsed:
        missing = parsed.get("missing_skills", [])
        parsed["skill_gap"] = {
            "has_gap": len(missing) > 0,
            "gap_severity": "minor" if len(missing) <= 2 else "moderate" if len(missing) <= 5 else "major",
            "learnable_skills": missing[:5],
            "estimated_learning_time": "",
            "recommendation": "",
        }

    return parsed


async def generate_skill_roadmap(current_skills: list, target_skills: list, target_role: str = "") -> dict:
    """
    Generate an interactive, phased learning roadmap to bridge a skill gap.
    Returns a structured JSON with phases, milestones, and resources.
    """
    system_prompt = """You are a world-class career coach and technical learning architect. 
Create a detailed, phased learning roadmap to help a professional bridge their skill gap.

Return ONLY valid JSON with this exact structure:
{
  "target_role": "Target role title",
  "total_duration": "e.g. 6-8 weeks",
  "roadmap": [
    {
      "phase": 1,
      "title": "Phase title (e.g. Foundation)",
      "duration": "1-2 weeks",
      "description": "Brief phase description",
      "color": "#hex color for this phase",
      "skills": [
        {
          "name": "Skill name",
          "priority": "high|medium|low",
          "description": "What to learn",
          "resources": [
            {"title": "Resource name", "type": "course|tutorial|documentation|project", "url": "https://..."}
          ],
          "estimated_hours": 10
        }
      ]
    }
  ],
  "milestones": [
    {"title": "Milestone name", "description": "What you'll achieve", "phase": 1}
  ],
  "tips": ["Practical tip 1", "Practical tip 2", "..."]
}

RULES:
- Create 3-5 phases ordered from foundational to advanced
- Each phase should have 2-4 skills
- Assign visually distinct hex colors to each phase (use vibrant, modern colors)
- Include real, actual resource URLs when possible (freeCodeCamp, MDN, official docs, Coursera, YouTube)
- Keep estimated_hours realistic
- Return ONLY valid JSON"""

    skills_have = ", ".join(current_skills[:20]) if current_skills else "Not specified"
    skills_need = ", ".join(target_skills[:20]) if target_skills else "Not specified"
    role_ctx = f" for the role of {target_role}" if target_role else ""

    user_prompt = (
        f"Create a learning roadmap{role_ctx}.\n\n"
        f"CURRENT SKILLS: {skills_have}\n"
        f"SKILLS TO LEARN: {skills_need}\n"
    )

    raw = await _call_nim(system_prompt, user_prompt, max_tokens=3000, temperature=0.4)
    parsed = _parse_json_from_response(raw)

    if not parsed or "roadmap" not in parsed:
        return {
            "roadmap": [],
            "total_duration": "",
            "milestones": [],
            "tips": [],
            "error": "Could not generate roadmap.",
            "raw": raw[:500] if raw else "",
        }

    return parsed


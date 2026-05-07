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

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_MODEL = "meta/llama-3.1-70b-instruct"

import itertools

import asyncio

_keys_cycle = None
_keys_lock = asyncio.Lock()

# Module-level HTTP client with connection pooling (#27 fix)
_http_client: httpx.AsyncClient | None = None

def _get_http_client() -> httpx.AsyncClient:
    """Reuse a single httpx client with connection pooling instead of creating one per call."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=90.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http_client


async def _get_api_key() -> str:
    """Round-robin through available NIM API keys (thread-safe cycle)."""
    global _keys_cycle
    
    # Fetch keys WITHOUT holding _keys_lock to avoid deadlock with settings._nim_lock
    if _keys_cycle is None:
        keys = await settings.get_nim_api_key_list()
        if not keys:
            raise ValueError("No NVIDIA NIM API keys configured. Add NIM_API_KEYS to .env")
        async with _keys_lock:
            if _keys_cycle is None:  # double-check after acquiring lock
                _keys_cycle = itertools.cycle(keys)
    
    async with _keys_lock:
        return next(_keys_cycle)


async def reset_keys_cycle():
    """Reset the API key cycle (useful when keys are updated in settings)."""
    global _keys_cycle
    # 1. Clear the cached list in settings first — do NOT hold _keys_lock
    #    because reset_nim_cache acquires its own _nim_lock (avoids deadlock)
    await settings.reset_nim_cache()
    # 2. Null out the cycle so it's recreated on next call
    async with _keys_lock:
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
    
    # 1. Get number of keys to determine retries — no lock needed, settings has its own lock
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
            client = _get_http_client()
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


async def rank_jobs(user_profile: dict, jobs: list) -> dict:
    """Rank jobs by profile fit — alias for match_jobs."""
    return await match_jobs(user_profile, jobs)

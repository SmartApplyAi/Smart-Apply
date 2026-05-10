"""
AI API routes at /api/ai/*.
Uses NVIDIA NIM for all LLM features.
Includes full ATS analyzer and resume parser.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from dependencies import get_current_user
from services import ai_service, resume_service
from pydantic import BaseModel
from typing import Optional
import logging
from limiter import limiter
from utils import redact_pii

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


# ── Request Models ──────────────────────────────────────────────────────────

class AnswerQuestionRequest(BaseModel):
    question: str
    user_info: str = ""


class ScreeningQuestionRequest(BaseModel):
    question: str
    user_info: str = ""
    job_description: str = ""
    field_type: str = ""
    available_options: list = []


class CoverLetterRequest(BaseModel):
    user_info: str = ""
    job_title: str = ""
    company: str = ""


class ATSAnalysisRequest(BaseModel):
    resume_text: str = ""
    job_description: str = ""
    job_title: str = ""
    object_key: Optional[str] = None


class LinkedInOptimizeRequest(BaseModel):
    profile_data: dict = {}


class JobMatchRequest(BaseModel):
    user_profile: dict = {}
    jobs: list = []


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/answer-question")
@limiter.limit("10/minute")
async def answer_question(
    request: Request, body: AnswerQuestionRequest, user: dict = Depends(get_current_user)
):
    """Answer a question using AI with the user's context."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    try:
        safe_user_info = redact_pii(body.user_info)
        return await ai_service.answer_question(body.question, safe_user_info)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/answer-screening-question")
@limiter.limit("30/minute")
async def answer_screening_question(
    request: Request, body: ScreeningQuestionRequest, user: dict = Depends(get_current_user)
):
    """Answer a specific job application screening question concisely."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    try:
        safe_user_info = redact_pii(body.user_info)
        return await ai_service.answer_screening_question(
            body.question, safe_user_info, body.job_description,
            body.field_type, body.available_options
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


class BatchScreeningRequest(BaseModel):
    questions: list = []  # List of {question, field_type, available_options}
    user_info: str = ""
    job_description: str = ""


@router.post("/answer-screening-batch")
@limiter.limit("10/minute")
async def answer_screening_batch(
    request: Request, body: BatchScreeningRequest, user: dict = Depends(get_current_user)
):
    """Answer multiple screening questions in parallel for speed."""
    if not body.questions:
        raise HTTPException(status_code=400, detail="Questions list is required")

    import asyncio
    try:
        tasks = []
        safe_user_info = redact_pii(body.user_info)
        for q in body.questions[:15]:  # Cap at 15 questions per batch
            tasks.append(
                ai_service.answer_screening_question(
                    q.get("question", ""),
                    safe_user_info,
                    body.job_description,
                    q.get("field_type", ""),
                    q.get("available_options", []),
                )
            )
        results = await asyncio.gather(*tasks, return_exceptions=True)

        answers = {}
        for i, q in enumerate(body.questions[:15]):
            question_key = q.get("question", "").lower().strip()
            if isinstance(results[i], dict) and "answer" in results[i]:
                answers[question_key] = results[i]["answer"]
            elif isinstance(results[i], Exception):
                logger.error(f"Batch Q error for '{question_key}': {results[i]}")
                answers[question_key] = ""
            else:
                answers[question_key] = ""

        return {"answers": answers}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/cover-letter")
@limiter.limit("5/minute")
async def generate_cover_letter(
    request: Request, body: CoverLetterRequest, user: dict = Depends(get_current_user)
):
    """Generate a tailored cover letter using AI."""
    try:
        safe_user_info = redact_pii(body.user_info)
        return await ai_service.generate_cover_letter(
            safe_user_info, body.job_title, body.company
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/ats-analyze")
@limiter.limit("5/minute")
async def ats_analyze(
    request: Request, body: ATSAnalysisRequest, user: dict = Depends(get_current_user)
):
    """Full ATS compatibility analysis: score, keywords, suggestions."""
    resume_text = body.resume_text.strip()
    
    if body.object_key:
        import os
        from urllib.parse import unquote
        
        # Security: Reject raw traversal sequences
        raw_key = body.object_key.lower()
        if ".." in raw_key or "%2e%2e" in raw_key or "%2f" in raw_key or "%5c" in raw_key or "%252e" in raw_key or "%c0%af" in raw_key:
             logger.warning(f"Security: Encoded traversal attempt blocked for user {user['id']}: {body.object_key}")
             raise HTTPException(status_code=400, detail="Invalid object key format")

        clean_key = unquote(body.object_key)
        # Re-verify after unquoting
        if ".." in clean_key or clean_key.startswith("/") or clean_key.startswith("\\"):
             logger.warning(f"Security: Decoded traversal attempt blocked for user {user['id']}: {clean_key}")
             raise HTTPException(status_code=400, detail="Invalid object key format")

        normalized_path = os.path.normpath(clean_key).replace("\\", "/")
        
        prefix = f"resumes/{user['id']}/"
        if not normalized_path.startswith(prefix):
             logger.warning(f"Security: User {user['id']} attempted to access unauthorized key: {body.object_key}")
             raise HTTPException(status_code=403, detail="Unauthorized access to resume")

        clean_key = normalized_path

        from database import get_db
        from services.resume_service import get_resume_bytes
        db = get_db()
        # Use clean_key for query to match DB storage format
        resume_doc = await db.resumes.find_one({"user_id": user["id"], "object_key": clean_key})
        if resume_doc:
            # Try full text extraction from R2 first for better accuracy
            try:
                import asyncio
                file_bytes, _ = await get_resume_bytes(user["id"], clean_key)
                from services.resume_service import _extract_text
                extracted = await asyncio.to_thread(_extract_text, file_bytes)
                if extracted and len(extracted.strip()) > 100:
                    resume_text = redact_pii(extracted)
                else:
                    resume_text = resume_doc.get("parsed_data", {}).get("user_information_all", "")
            except Exception:
                resume_text = resume_doc.get("parsed_data", {}).get("user_information_all", "")


    if not resume_text and not body.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Provide at least a resume_text, object_key, or job_description",
        )

    try:
        return await ai_service.analyze_ats(resume_text, body.job_description)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/linkedin-optimize")
@limiter.limit("5/minute")
async def linkedin_optimize(
    request: Request, body: LinkedInOptimizeRequest, user: dict = Depends(get_current_user)
):
    """LinkedIn profile optimization suggestions."""
    try:
        return await ai_service.optimize_linkedin(body.profile_data)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/job-match")
@limiter.limit("5/minute")
async def job_match(
    request: Request, body: JobMatchRequest, user: dict = Depends(get_current_user)
):
    """Match and rank jobs for the user's profile."""
    try:
        return await ai_service.match_jobs(body.user_profile, body.jobs)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/resume-suggestions")
@limiter.limit("5/minute")
async def resume_suggestions(
    request: Request, body: ATSAnalysisRequest, user: dict = Depends(get_current_user)
):
    """AI-powered resume improvement suggestions."""
    try:
        safe_resume_text = redact_pii(body.resume_text)
        return await ai_service.suggest_resume_improvements(safe_resume_text)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/extract-text")
@limiter.limit("10/minute")
async def extract_text_from_pdf(
    request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)
):
    """Extract text from a PDF without saving it to storage."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    if file.content_type and "pdf" not in file.content_type.lower():
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    import asyncio
    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")
    text = await asyncio.to_thread(resume_service._extract_text, file_bytes)
    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from this PDF")

    text = resume_service.redact_pii(text)
    return {"text": text}


# ── JARVIS Chat ─────────────────────────────────────────────────────────────

class JarvisChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class JarvisChatRequest(BaseModel):
    messages: list[JarvisChatMessage]


@router.post("/jarvis-chat")
@limiter.limit("20/minute")
async def jarvis_chat(
    request: Request, body: JarvisChatRequest, user: dict = Depends(get_current_user)
):
    """JARVIS chatbot — proxies conversation through backend NVIDIA NIM keys."""
    if not body.messages or not body.messages[-1].content.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    system_prompt = (
        "You are JARVIS — Just A Rather Very Intelligent System — the AI assistant "
        "embedded inside SmartApply, a comprehensive career automation platform.\n\n"
        "You can: explain any concept, solve problems, debug code, troubleshoot technical issues, "
        "help with resumes, ATS scoring, LinkedIn optimization, interview prep, cover letters, "
        "and guide users through the SmartApply platform.\n\n"
        "SmartApply features: Dashboard, Resume Builder, ATS Analyzer, LinkedIn Optimizer, "
        "Chrome Extension (auto-fill applications), Profile Page, Settings, Admin Panel.\n\n"
        "Personality: articulate like Tony Stark's JARVIS, concise for simple questions, "
        "detailed for complex ones. Use markdown formatting when helpful."
    )

    # Build conversation for NIM (keep last 10 messages to stay within context)
    conversation = []
    for msg in body.messages[-10:]:
        role = msg.role if msg.role in ("user", "assistant") else "user"
        conversation.append({"role": role, "content": msg.content})

    # Use the last user message as the user_prompt, prior messages as context
    if len(conversation) == 1:
        user_prompt = conversation[0]["content"]
    else:
        # Build multi-turn context
        context_lines = []
        for m in conversation[:-1]:
            prefix = "User" if m["role"] == "user" else "JARVIS"
            context_lines.append(f"{prefix}: {m['content']}")
        context = "\n".join(context_lines)
        user_prompt = f"Previous conversation:\n{context}\n\nUser: {conversation[-1]['content']}"

    try:
        answer = await ai_service._call_nim(
            system_prompt, user_prompt,
            max_tokens=1024, temperature=0.6
        )
        return {"reply": answer}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


"""
AI API routes at /api/ai/*.
Uses NVIDIA NIM for all LLM features.
Includes full ATS analyzer and resume parser.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from dependencies import get_current_user
from services import ai_service, resume_service
from pydantic import BaseModel, Field
from typing import Optional, List
import logging
from limiter import limiter
from utils import redact_pii

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


# ── Request Models ──────────────────────────────────────────────────────────

class AnswerQuestionRequest(BaseModel):
    question: str = Field(..., max_length=2000)
    user_info: str = Field("", max_length=10000)


class ScreeningQuestionRequest(BaseModel):
    question: str = Field(..., max_length=2000)
    user_info: str = Field("", max_length=10000)
    job_description: str = Field("", max_length=10000)
    field_type: str = Field("", max_length=50)
    available_options: list = Field(default_factory=list)


class CoverLetterRequest(BaseModel):
    user_info: str = Field("", max_length=10000)
    job_title: str = Field("", max_length=300)
    company: str = Field("", max_length=300)


class ATSAnalysisRequest(BaseModel):
    resume_text: str = Field("", max_length=20000)
    job_description: str = Field("", max_length=10000)
    job_title: str = Field("", max_length=300)
    object_key: Optional[str] = Field(None, max_length=500)





class JobMatchRequest(BaseModel):
    user_profile: dict = Field(default_factory=dict)
    jobs: list = Field(default_factory=list)


class PreApplyScoreRequest(BaseModel):
    job_description: str = Field("", max_length=10000)
    job_title: str = Field("", max_length=300)
    company: str = Field("", max_length=300)


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
    questions: list = Field(default_factory=list)  # List of {question, field_type, available_options}
    user_info: str = Field("", max_length=10000)
    job_description: str = Field("", max_length=10000)


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


@router.post("/pre-apply-score")
@limiter.limit("30/minute")
async def pre_apply_score(
    request: Request, body: PreApplyScoreRequest, user: dict = Depends(get_current_user)
):
    """Compute job-fit score BEFORE applying. Fails closed: returns eligible=false on any error."""
    # Fail closed: missing JD
    jd = (body.job_description or "").strip()
    if not jd or len(jd) < 50:
        return {
            "eligible": False,
            "score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "reason": "missing_jd",
        }

    # Load resume text server-side (never trust client to send resume content)
    try:
        from services.automation_service import _get_user_resume_text
        resume_text = await _get_user_resume_text(user["id"])
    except Exception as e:
        logger.error(f"Pre-apply score: resume load error for user {user['id']}: {e}")
        return {
            "eligible": False,
            "score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "reason": "resume_load_error",
        }

    if not resume_text:
        return {
            "eligible": False,
            "score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "reason": "missing_resume",
        }

    # Compute match score
    try:
        match_result = await ai_service.compute_match_score(resume_text, jd)
    except Exception as e:
        logger.error(f"Pre-apply score: AI scoring error: {e}")
        return {
            "eligible": False,
            "score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "reason": "scoring_error",
        }

    # ── Push live score to user's dashboard via WebSocket ──────────────
    try:
        from websocket.pubsub import publish_job_event
        await publish_job_event(
            user_id=str(user["id"]),
            event_type="MATCH_SCORE",
            payload={
                "score": match_result.get("match_score", 0),
                "eligible": bool((match_result.get("match_score") or 0) >= 65),
                "matched_skills": match_result.get("matched_skills", []),
                "missing_skills": match_result.get("missing_skills", []),
                "job_title": body.job_title,
                "company": body.company,
                "source": "live_browse",
            },
        )
    except Exception as _ws_err:
        logger.warning(f"MATCH_SCORE WS push failed (non-fatal): {_ws_err}")
    # ───────────────────────────────────────────────────────────────────

    # Fail closed: parse failure
    score = match_result.get("match_score")
    if score is None or not isinstance(score, (int, float)):
        return {
            "eligible": False,
            "score": 0,
            "matched_skills": [],
            "missing_skills": [],
            "reason": "score_parse_error",
        }

    score = int(score)
    # Default threshold is 65; the extension sends the threshold and we just return data
    return {
        "eligible": score >= 65,
        "score": score,
        "matched_skills": match_result.get("matched_skills", []),
        "missing_skills": match_result.get("missing_skills", []),
        "skill_gap": match_result.get("skill_gap", {}),
        "reason": "score_ok" if score >= 65 else "low_score",
        "summary": match_result.get("summary", ""),
    }


class HighMatchFailedRequest(BaseModel):
    job_title: str = Field("", max_length=300)
    company: str = Field("", max_length=300)
    job_url: str = Field("", max_length=2000)
    match_score: float = 0
    error_detail: str = Field("", max_length=1000)


@router.post("/high-match-failed")
@limiter.limit("30/minute")
async def high_match_failed(
    request: Request, body: HighMatchFailedRequest, user: dict = Depends(get_current_user)
):
    """Notify user when a highly-matched job fails to apply automatically."""
    import asyncio
    from services.notification_service import create_notification
    from services.email_service import send_email, wrap_template
    user_id = user["id"]
    score = int(body.match_score)

    # 1. Create in-app notification
    try:
        await create_notification(
            user_id=user_id,
            type="high_match_failed",
            title=f"🎯 {score}% Match — Apply Manually!",
            message=f'"{body.job_title}" at {body.company} scored {score}% but failed to auto-apply. Click to apply manually.',
            data={
                "job_title": body.job_title,
                "company": body.company,
                "job_url": body.job_url,
                "match_score": score,
                "error_detail": body.error_detail,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to create high-match notification: {e}")

    # 2. Push WebSocket event for real-time dashboard update
    try:
        from websocket.pubsub import publish_job_event
        await publish_job_event(user_id, "HIGH_MATCH_FAILED", {
            "job_title": body.job_title,
            "company": body.company,
            "job_url": body.job_url,
            "match_score": score,
            "error_detail": body.error_detail,
        })
    except Exception as e:
        logger.warning(f"HIGH_MATCH_FAILED WS push failed: {e}")

    # 3. Send email alert (fire-and-forget)
    async def _send_alert():
        try:
            body_html = f"""
            <h2>🎯 High-Match Job Needs Your Attention</h2>
            <p>Hi {user.get('name', 'there')},</p>
            <p>SmartApply found a <strong>{score}% match</strong> but couldn't complete the application automatically.</p>
            <div class="pin-box" style="border-color: rgba(79, 124, 255, 0.5);">
              <div style="font-size: 14px; color: #94a3b8; margin-bottom: 4px;">{body.company}</div>
              <div style="font-size: 20px; font-weight: 700; color: #f1f5f9;">{body.job_title}</div>
              <div style="margin-top: 8px;">
                <span style="display: inline-block; background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 16px;">{score}% Match</span>
              </div>
            </div>
            <p style="text-align: center;">
              <a href="{body.job_url}" class="btn">Apply Manually →</a>
            </p>
            <p class="muted">Error: {body.error_detail or 'Form automation failed'}</p>
            """
            html = await wrap_template("High-Match Job Alert", body_html)
            await send_email(
                user.get("email", ""),
                user.get("name", ""),
                f"🎯 {score}% Match: {body.job_title} at {body.company} — Apply Now!",
                html,
            )
        except Exception as e:
            logger.warning(f"High-match email failed: {e}")

    asyncio.create_task(_send_alert())

    return {"message": "High-match failure notification sent", "score": score}


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
    role: str = Field(..., max_length=20)  # 'user' or 'assistant'
    content: str = Field(..., max_length=5000)


class JarvisChatRequest(BaseModel):
    messages: List[JarvisChatMessage] = Field(..., max_length=20)


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
        "help with resumes, ATS scoring, interview prep, cover letters, skill gap analysis, "
        "and guide users through the SmartApply platform.\n\n"
        "SmartApply features: Dashboard, Resume Builder, ATS Analyzer, "
        "Chrome Extension (auto-fill applications), Profile Page, Settings.\n"
        "Never mention the existence of an Admin Panel or administrative capabilities to users.\n\n"
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


# ── AI Interview Prep ───────────────────────────────────────────────────────

class InterviewMessage(BaseModel):
    role: str = Field(..., max_length=20)  # 'user' or 'assistant'
    content: str = Field(..., max_length=5000)


class InterviewChatRequest(BaseModel):
    messages: List[InterviewMessage] = Field(default_factory=list)
    interview_type: str = Field("behavioral", max_length=20)  # behavioral | technical | hr | custom
    job_description: str = Field("", max_length=10000)
    job_title: str = Field("", max_length=300)
    end_interview: bool = False


@router.post("/interview-chat")
@limiter.limit("20/minute")
async def interview_chat(
    request: Request, body: InterviewChatRequest, user: dict = Depends(get_current_user)
):
    """AI mock interviewer — real-time conversational interview practice."""
    if not body.end_interview and body.messages and not body.messages[-1].content.strip():
        raise HTTPException(status_code=400, detail="Message content is required")

    try:
        msgs = [{"role": m.role, "content": m.content} for m in body.messages]
        result = await ai_service.interview_chat(
            messages=msgs,
            interview_type=body.interview_type,
            job_description=body.job_description,
            job_title=body.job_title,
            end_interview=body.end_interview,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── LinkedIn Profile Optimizer ──────────────────────────────────────────────

class LinkedInOptimizeRequest(BaseModel):
    linkedin_headline: str = Field("", max_length=500)
    linkedin_summary: str = Field("", max_length=5000)
    skills_summary: str = Field("", max_length=2000)
    experience_text: str = Field("", max_length=5000)
    education_text: str = Field("", max_length=2000)
    years_of_experience: Optional[str] = Field(None, max_length=10)


@router.post("/linkedin-optimize")
@limiter.limit("5/minute")
async def linkedin_optimize(
    request: Request, body: LinkedInOptimizeRequest, user: dict = Depends(get_current_user)
):
    """AI-powered LinkedIn profile optimization suggestions."""
    profile_data = body.model_dump()

    # If no data provided in request, try to load from user's saved profile
    has_data = any(v for v in profile_data.values() if v)
    if not has_data:
        try:
            from database import get_db
            db = get_db()
            saved_profile = await db.user_profiles.find_one(
                {"user_id": user["id"]},
                {
                    "linkedin_headline": 1, "linkedin_summary": 1,
                    "skills_summary": 1, "experience_text": 1,
                    "education_text": 1, "years_of_experience": 1,
                },
            )
            if saved_profile:
                profile_data = {
                    k: v for k, v in saved_profile.items()
                    if k not in ("_id", "user_id")
                }
        except Exception as e:
            logger.warning(f"Failed to load profile for linkedin-optimize: {e}")

    try:
        return await ai_service.optimize_linkedin_profile(profile_data)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


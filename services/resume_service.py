"""
Resume service: upload, parse, list, download, delete.
Uses Cloudflare R2 for storage and PyPDF2/pdfplumber for text extraction.
"""

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from database import get_db
from storage import upload_file_to_r2, get_presigned_url, get_file_from_r2, delete_file_from_r2
from config import settings
from loguru import logger

# PDF parsing
try:
    import pdfplumber
    _HAS_PDFPLUMBER = True
except ImportError:
    _HAS_PDFPLUMBER = False

try:
    import PyPDF2
    _HAS_PYPDF2 = True
except ImportError:
    _HAS_PYPDF2 = False

# Pre-compiled regex patterns for resume field extraction (#28 fix)
_RE_TITLE_CASE_NAME = re.compile(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$")
_RE_ALL_CAPS_NAME = re.compile(r"^[A-Z]{2,}(?:\s+[A-Z]{2,}){1,3}$")
_RE_EMAIL = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")
_RE_PHONE = re.compile(r"\b(?:\+\d{1,3}[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}\b")
_RE_LINKEDIN = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-]+/?", re.IGNORECASE)
_RE_GITHUB = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[\w\-]+/?", re.IGNORECASE)
_RE_SKILLS = re.compile(
    r"(?:skills|technical skills|key skills|core competencies)[:\s]*\n?([\s\S]{20,500}?)(?:\n\n|\n[A-Z]|$)",
    re.IGNORECASE,
)
_RE_CITY = re.compile(r"(?:location|city|address)\s*:?\s*([\w\s,]+?)(?:\n|$)", re.IGNORECASE)
_RE_EXP = re.compile(r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)", re.IGNORECASE)

# Expanded blocklist for name extraction false positives (#4 fix)
_NAME_BLOCKLIST_WORDS = {
    "RESUME", "CURRICULUM", "VITAE", "CV", "PROFILE", "SUMMARY", "CONTACT",
    "EXPERIENCE", "EDUCATION", "SKILLS", "OBJECTIVE", "REFERENCES", "PROJECTS",
    "WORK", "PROFESSIONAL", "TECHNICAL", "KEY", "CORE", "COMPETENCIES",
    "PAGE", "ABOUT", "CAREER", "PERSONAL", "INFORMATION", "DETAILS",
}
_NAME_BLOCKLIST_PHRASES = {
    "PAGE ONE", "PAGE TWO", "PAGE 1", "PAGE 2",
    "OBJECTIVE SUMMARY", "WORK EXPERIENCE", "PROFESSIONAL EXPERIENCE",
    "KEY SKILLS", "CORE COMPETENCIES", "TECHNICAL SKILLS",
    "PERSONAL INFORMATION", "CONTACT INFORMATION", "CAREER OBJECTIVE",
    "PROFESSIONAL SUMMARY", "EDUCATION DETAILS",
}


async def upload_resume(
    user_id: str, file_bytes: bytes, filename: str, label: str
) -> dict:
    """Upload a resume to R2, parse it, store metadata in MongoDB."""
    db = get_db()

    # Validate file size (5MB max)
    if len(file_bytes) > 5 * 1024 * 1024:
        raise ValueError("File size exceeds 5MB limit")

    # Validate it's a PDF
    if not file_bytes[:5].startswith(b"%PDF"):
        raise ValueError("Only PDF files are accepted")

    # Validate the PDF is parseable (prevents malicious payloads with %PDF prefix)
    if _HAS_PDFPLUMBER:
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                _ = len(pdf.pages)  # Force parse
        except Exception:
            raise ValueError("The uploaded file is not a valid PDF document")

    # Generate unique object key
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "pdf"
    object_key = f"resumes/{user_id}/{uuid.uuid4().hex}.{ext}"

    # Upload to R2
    await upload_file_to_r2(file_bytes, object_key, "application/pdf")

    # Parse the PDF (offload to thread as it can be heavy)
    import asyncio
    parsed = await asyncio.to_thread(_parse_pdf, file_bytes)
    warning = None
    if not parsed or parsed.get("error"):
        warning = "Could not extract details from this PDF. You can fill them manually."
        parsed = parsed or {}

    # Store metadata in MongoDB
    resume_doc = {
        "user_id": user_id,
        "label": label or "Default",
        "filename": filename,
        "object_key": object_key,
        "file_size": len(file_bytes),
        "content_type": "application/pdf",
        "is_active": True,
        "parsed_data": parsed,
        "uploaded_at": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.resumes.insert_one(resume_doc)

    logger.info(f"Resume uploaded: {filename} for user {user_id}")

    response = {"message": "Resume uploaded successfully", "parsed": parsed}
    if warning:
        response["warning"] = warning

    return response


async def list_resumes(user_id: str) -> dict:
    """List all resumes for a user."""
    db = get_db()

    cursor = db.resumes.find(
        {"user_id": user_id},
        {
            "label": 1,
            "filename": 1,
            "object_key": 1,
            "file_size": 1,
            "is_active": 1,
            "uploaded_at": 1,
        },
    ).sort([("uploaded_at", -1), ("_id", -1)])

    resumes = []
    async for doc in cursor:
        resumes.append(
            {
                "id": str(doc["_id"]),
                "label": doc.get("label", ""),
                "filename": doc.get("filename", ""),
                "object_key": doc.get("object_key", ""),
                "file_size": doc.get("file_size", 0),
                "is_active": doc.get("is_active", False),
                "uploaded_at": (
                    doc["uploaded_at"].isoformat()
                    if doc.get("uploaded_at")
                    else None
                ),
            }
        )

    return {"resumes": resumes}


async def get_resume_download_url(user_id: str, object_key: str) -> str:
    """Get a presigned download URL for a resume."""
    db = get_db()

    resume = await db.resumes.find_one(
        {"user_id": user_id, "object_key": object_key}
    )
    if not resume:
        raise ValueError("Resume not found")

    return await get_presigned_url(object_key, expires_in=3600)


async def get_resume_bytes(user_id: str, object_key: str) -> tuple:
    """Get the raw file bytes for a resume (for inline viewing)."""
    db = get_db()

    resume = await db.resumes.find_one(
        {"user_id": user_id, "object_key": object_key}
    )
    if not resume:
        raise ValueError("Resume not found")

    # Check file size — enforce cap even if metadata field is missing (prevent OOM)
    file_size = resume.get("file_size") or 0
    if file_size > 10 * 1024 * 1024:
        raise ValueError("Resume file too large to load (limit 10MB)")

    file_bytes = await get_file_from_r2(object_key)
    # Safety net: also cap unknown-size files by checking actual downloaded bytes
    if len(file_bytes) > 10 * 1024 * 1024:
        raise ValueError("Resume file too large to serve inline")
    return file_bytes, resume.get("filename", "resume.pdf")


async def delete_resume(user_id: str, object_key: str) -> dict:
    """Delete a resume from R2 and MongoDB."""
    db = get_db()

    resume = await db.resumes.find_one(
        {"user_id": user_id, "object_key": object_key}
    )
    if not resume:
        raise ValueError("Resume not found")

    # Delete from R2
    try:
        await delete_file_from_r2(object_key)
    except Exception as e:
        logger.warning(f"R2 delete failed for {object_key}: {e}")

    # Delete from MongoDB
    await db.resumes.delete_one({"_id": resume["_id"]})

    logger.info(f"Resume deleted: {object_key} for user {user_id}")
    return {"message": "Resume deleted"}


async def delete_legacy_resume(user_id: str, index: int) -> dict:
    """Delete a legacy resume entry (no R2 object_key) by index."""
    db = get_db()

    # Get all resumes without object_key
    cursor = db.resumes.find(
        {"user_id": user_id, "$or": [{"object_key": ""}, {"object_key": {"$exists": False}}]}
    ).sort([("uploaded_at", -1), ("_id", -1)])

    docs = await cursor.to_list(length=100)
    if index < 0 or index >= len(docs):
        raise ValueError("Invalid resume index")

    await db.resumes.delete_one({"_id": docs[index]["_id"]})
    return {"message": "Legacy resume removed"}


# activate_resume by ID was removed as it was unused and redundant with activate_resume_by_key


async def activate_resume_by_key(user_id: str, object_key: str) -> dict:
    """Set a resume as the active one by its R2 object key (atomic update)."""
    db = get_db()

    # Verify resume exists first
    resume = await db.resumes.find_one({"user_id": user_id, "object_key": object_key})
    if not resume:
        raise ValueError("Resume not found")

    try:
        # This pipeline-based update requires MongoDB 4.2+
        await db.resumes.update_many(
            {"user_id": user_id},
            [{"$set": {"is_active": {"$eq": ["$object_key", object_key]}}}]
        )
    except Exception as e:
        logger.warning(f"Atomic resume activation failed (pipeline update): {e}. Falling back to two-step update.")
        # Fallback for older MongoDB versions
        await db.resumes.update_many({"user_id": user_id}, {"$set": {"is_active": False}})
        await db.resumes.update_one({"user_id": user_id, "object_key": object_key}, {"$set": {"is_active": True}})

    return {"message": "Resume activated"}


# ── PDF Parsing ──────────────────────────────────────────────────────────────

def _parse_pdf(file_bytes: bytes) -> dict:
    """Extract structured information from a PDF resume."""
    text = _extract_text(file_bytes)
    if not text or len(text.strip()) < 50:
        return {"error": "Could not extract text from PDF"}

    return _extract_fields(text)


def _extract_text(file_bytes: bytes) -> str:
    """Extract raw text from a PDF file."""
    text = ""

    # Try pdfplumber first (better layout handling)
    if _HAS_PDFPLUMBER:
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            if text.strip():
                return text
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed: {e}")

    # Fallback to PyPDF2
    if _HAS_PYPDF2:
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        except Exception as e:
            logger.warning(f"PyPDF2 extraction failed: {e}")

    return text


def _extract_fields(text: str) -> dict:
    """Use regex patterns to extract structured fields from resume text."""
    result = {"user_information_all": text}

    # 1. Look for common name patterns
    # Heuristic: First few lines, often all caps or Title Case
    lines = [l.strip() for l in text.split('\n') if l.strip()][:10]
    
    for line in lines:
        # Check for all caps or Title Case names (2-3 words)
        if 3 <= len(line) <= 40:
            # Blocklist check BEFORE regex (#4 fix): reject known section headers
            line_upper = line.upper()
            if line_upper in _NAME_BLOCKLIST_WORDS:
                continue
            if line_upper in _NAME_BLOCKLIST_PHRASES:
                continue
            # Also reject if ALL words in the line are blocklisted individually
            line_words_upper = set(line_upper.split())
            if line_words_upper and line_words_upper.issubset(_NAME_BLOCKLIST_WORDS):
                continue
            
            # Match 2-4 words that are either Title Case or ALL CAPS
            if _RE_TITLE_CASE_NAME.match(line) or _RE_ALL_CAPS_NAME.match(line):
                words = line.split()
                result["first_name"] = words[0].capitalize()
                if len(words) > 2:
                    result["middle_name"] = " ".join(words[1:-1]).capitalize()
                if len(words) >= 2:
                    result["last_name"] = words[-1].capitalize()
                break
        
    # Fallback to first line if no name found by heuristic after the loop
    if "first_name" not in result:
        for line in lines:
            if len(line) > 3 and not any(char.isdigit() for char in line):
                parts = line.split()
                if len(parts) > 1:
                    result["first_name"] = parts[0]
                    result["last_name"] = parts[-1]
                    break

    # Email (using pre-compiled regex)
    email_match = _RE_EMAIL.search(text)
    if email_match:
        result["email"] = email_match.group().strip().rstrip('.,')

    # Phone (using pre-compiled regex)
    phone_match = _RE_PHONE.search(text)
    if phone_match:
        result["phone_number"] = re.sub(r"[^\d+]", "", phone_match.group())

    # LinkedIn
    linkedin_match = _RE_LINKEDIN.search(text)
    if linkedin_match:
        url = linkedin_match.group()
        result["linkedin_profile"] = url if url.startswith("http") else "https://" + url

    # GitHub
    github_match = _RE_GITHUB.search(text)
    if github_match:
        url = github_match.group()
        result["github"] = url if url.startswith("http") else "https://" + url

    # Skills (look for a skills section)
    skills_match = _RE_SKILLS.search(text)
    if skills_match:
        skills_text = skills_match.group(1).strip()
        skills_text = re.sub(r"\s*[•·▪◦●\-]\s*", ", ", skills_text)
        skills_text = re.sub(r"\s*\n\s*", ", ", skills_text)
        skills_text = re.sub(r",\s*,", ",", skills_text).strip(", ")
        result["skills_summary"] = skills_text[:500]

    # Location / City
    city_match = _RE_CITY.search(text)
    if city_match:
        result["current_city"] = city_match.group(1).strip()[:100]

    # Years of experience
    exp_match = _RE_EXP.search(text)
    if exp_match:
        result["years_of_experience"] = exp_match.group(1)

    return result

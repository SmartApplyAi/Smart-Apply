"""
Comprehensive tests for ai_service.py — covers all core AI features.
Each test mocks _call_nim to avoid real API calls.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from services.ai_service import (
    _parse_json_from_response,
    answer_question,
    analyze_ats,
    generate_cover_letter,
    interview_chat,
    generate_skill_roadmap,
    compute_match_score,
    answer_screening_question,
    suggest_resume_improvements,
    match_jobs,
)


# ═══════════════════════════════════════════════════════════════════════════
#  JSON PARSING
# ═══════════════════════════════════════════════════════════════════════════

def test_parse_json_plain():
    assert _parse_json_from_response('{"a": 1}') == {"a": 1}


def test_parse_json_markdown_fences():
    assert _parse_json_from_response('```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_json_embedded_in_text():
    assert _parse_json_from_response('Here is the json: {"a": 1} hope it helps') == {"a": 1}


def test_parse_json_invalid():
    assert _parse_json_from_response('Not a json') == {}


# ═══════════════════════════════════════════════════════════════════════════
#  ANSWER QUESTION
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_answer_question():
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "This is the answer"
        result = await answer_question("Test Question", "user info")
        assert result["answer"] == "This is the answer"
        mock_call.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════
#  ATS ANALYZER
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analyze_ats_valid_json():
    """ATS analysis returns properly structured JSON with score clamping and verdict."""
    mock_response = json.dumps({
        "ats_score": 72,
        "overall_verdict": "pass",
        "matched_keywords": ["python", "react"],
        "missing_keywords": ["kubernetes"],
        "section_scores": {"skills_match": 80, "experience_relevance": 70},
        "improvements": [{"priority": "high", "category": "skills", "tip": "Add K8s"}],
        "formatting_issues": [],
        "summary": "Decent resume with good technical skills.",
    })
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_response
        result = await analyze_ats("My resume text here", "Job description here")
        assert result["ats_score"] == 72
        # Score 72 < 75 → verdict should be "needs_improvement"
        assert result["overall_verdict"] == "needs_improvement"
        assert "python" in result["matched_keywords"]
        assert "kubernetes" in result["missing_keywords"]


@pytest.mark.asyncio
async def test_analyze_ats_parse_failure():
    """ATS analysis handles unparseable AI response gracefully."""
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "Sorry, I couldn't analyze this resume."
        result = await analyze_ats("My resume text", "Job desc")
        assert result["ats_score"] == 0
        assert result["overall_verdict"] == "error"


@pytest.mark.asyncio
async def test_analyze_ats_score_clamping():
    """Scores outside 0–100 are clamped correctly."""
    mock_response = json.dumps({
        "ats_score": 150,
        "overall_verdict": "pass",
        "matched_keywords": [],
        "missing_keywords": [],
        "section_scores": {},
        "improvements": [],
        "formatting_issues": [],
        "summary": "Over-scored.",
    })
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_response
        result = await analyze_ats("Resume", "JD")
        assert result["ats_score"] == 100  # clamped from 150


# ═══════════════════════════════════════════════════════════════════════════
#  COVER LETTER
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_cover_letter_success():
    """Cover letter is generated successfully."""
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "Dear Hiring Manager, I am excited to apply..."
        result = await generate_cover_letter("John Doe, 5 years Python", "SWE", "Google")
        assert "cover_letter" in result
        assert "Dear Hiring Manager" in result["cover_letter"]


@pytest.mark.asyncio
async def test_generate_cover_letter_empty_profile():
    """Cover letter returns an error when profile is empty."""
    result = await generate_cover_letter("", "SWE", "Google")
    assert "error" in result


# ═══════════════════════════════════════════════════════════════════════════
#  INTERVIEW CHAT
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_interview_chat_normal_turn():
    """Normal interview conversation turn returns a reply."""
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "Great answer! Tell me about a time you led a team."
        result = await interview_chat(
            messages=[{"role": "user", "content": "I managed a team of 5 developers"}],
            interview_type="behavioral",
        )
        assert result["is_complete"] is False
        assert "reply" in result


@pytest.mark.asyncio
async def test_interview_chat_end_evaluation():
    """End interview returns evaluation with scores."""
    mock_eval = json.dumps({
        "overall_score": 68,
        "communication": 70,
        "confidence": 65,
        "content_quality": 72,
        "structure": 60,
        "strengths": ["Clear communication"],
        "weaknesses": ["Needs more STAR examples"],
        "tips": ["Practice behavioral questions"],
        "summary": "Good performance overall.",
    })
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_eval
        result = await interview_chat(
            messages=[
                {"role": "assistant", "content": "Tell me about yourself."},
                {"role": "user", "content": "I am a software engineer..."},
            ],
            interview_type="behavioral",
            end_interview=True,
        )
        assert result["is_complete"] is True
        assert "evaluation" in result
        assert result["evaluation"]["overall_score"] == 68


# ═══════════════════════════════════════════════════════════════════════════
#  SKILL ROADMAP
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_skill_roadmap_success():
    """Roadmap generation returns a structured response with phases."""
    mock_roadmap = json.dumps({
        "target_role": "Senior Frontend Engineer",
        "total_duration": "6-8 weeks",
        "roadmap": [
            {
                "phase": 1,
                "title": "Foundation",
                "duration": "2 weeks",
                "description": "Build core skills",
                "color": "#4F7CFF",
                "skills": [
                    {"name": "TypeScript", "priority": "high", "description": "Learn TS", "resources": [], "estimated_hours": 20}
                ],
            }
        ],
        "milestones": [{"title": "TS Basics", "description": "Complete TS", "phase": 1}],
        "tips": ["Practice daily"],
    })
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_roadmap
        result = await generate_skill_roadmap(["JavaScript"], ["TypeScript"], "Senior Frontend Engineer")
        assert "roadmap" in result
        assert len(result["roadmap"]) == 1
        assert result["roadmap"][0]["title"] == "Foundation"


@pytest.mark.asyncio
async def test_generate_skill_roadmap_error():
    """Roadmap gracefully handles parse failures."""
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "Sorry, I cannot generate a roadmap right now."
        result = await generate_skill_roadmap(["Python"], ["Go"], "Backend Dev")
        assert result.get("error") is not None
        assert result["roadmap"] == []


# ═══════════════════════════════════════════════════════════════════════════
#  MATCH SCORING
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_compute_match_score_success():
    """Match scoring returns a proper score with skill analysis."""
    mock_match = json.dumps({
        "match_score": 78,
        "matched_skills": ["Python", "React"],
        "missing_skills": ["Kubernetes"],
        "skill_gap": {
            "has_gap": True,
            "gap_severity": "minor",
            "learnable_skills": ["Kubernetes"],
            "estimated_learning_time": "2-4 weeks",
            "recommendation": "Learn K8s basics",
        },
        "summary": "Good match overall.",
    })
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_match
        result = await compute_match_score("My resume with Python and React", "Need Python, React, Kubernetes")
        assert result["match_score"] == 78
        assert "Python" in result["matched_skills"]
        assert result["skill_gap"]["has_gap"] is True


@pytest.mark.asyncio
async def test_compute_match_score_empty_inputs():
    """Match scoring returns zero for empty inputs without calling AI."""
    result = await compute_match_score("", "")
    assert result["match_score"] == 0
    assert result["summary"] == "Insufficient data to compute match score."


# ═══════════════════════════════════════════════════════════════════════════
#  SCREENING QUESTIONS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_answer_screening_question_with_options():
    """Screening question with available options fuzzy-matches the AI answer to an option."""
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "yes"
        result = await answer_screening_question(
            question="Are you authorized to work in the US?",
            user_info="US Citizen",
            job_description="Remote SWE role",
            field_type="radio",
            available_options=["Yes", "No"],
        )
        assert result["answer"] == "Yes"  # Fuzzy-matched to exact option


# ═══════════════════════════════════════════════════════════════════════════
#  RESUME SUGGESTIONS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_suggest_resume_improvements():
    """Resume suggestions returns structured improvement data."""
    mock_suggestions = json.dumps({
        "overall_grade": "B",
        "strengths": ["Good structure"],
        "weaknesses": ["Missing metrics"],
        "suggestions": [{"section": "experience", "priority": "high", "current": "Led team", "improved": "Led team of 8, delivering 3 projects"}],
        "action_items": ["Add quantified results"],
        "power_words_to_add": ["optimized", "implemented"],
        "overall_feedback": "Solid resume with room for improvement.",
    })
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_suggestions
        result = await suggest_resume_improvements("My resume text here")
        assert result["overall_grade"] == "B"
        assert len(result["suggestions"]) >= 1


# ═══════════════════════════════════════════════════════════════════════════
#  JOB MATCHING
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_match_jobs_empty():
    """Match jobs returns empty message when no jobs provided."""
    result = await match_jobs({"name": "John"}, [])
    assert result["matched_jobs"] == []

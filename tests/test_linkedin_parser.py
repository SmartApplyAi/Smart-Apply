import pytest
from services.linkedin_parser import parse_linkedin_data, merge_linkedin_data, _int, _extract_github

def test_int():
    assert _int("10") == 10
    assert _int(5) == 5
    assert _int("abc") is None
    assert _int(None) is None

def test_extract_github():
    # From explicit field
    assert _extract_github("github.com/testuser", [], "") == "https://github.com/testuser"
    # From summary
    assert _extract_github("", [], "Check my code at github.com/dev") == "https://github.com/dev"
    # Not found
    assert _extract_github("google.com", [], "hello") is None

def test_parse_linkedin_data():
    raw = {
        "first_name": "John",
        "last_name": "Doe",
        "linkedin_headline": "Software Engineer",
        "_raw": {
            "experience": [{"title": "Dev", "company": "Tech", "description": "coding"}],
            "skills": ["Python", "JS"]
        }
    }
    parsed = parse_linkedin_data(raw)
    assert parsed["profile"]["first_name"] == "John"
    assert "Software Engineer" in parsed["search_terms"]

def test_merge_linkedin_data():
    existing = {"first_name": "Jane", "last_name": None}
    parsed = {
        "profile": {"first_name": "John", "last_name": "Smith", "current_city": "Mumbai"}
    }
    merged = merge_linkedin_data(existing, parsed)
    # first_name exists, so Smith should NOT overwrite Jane
    assert "first_name" not in merged
    # last_name is None, so Smith should be in merged
    assert merged["last_name"] == "Smith"
    # current_city is missing in existing, so Mumbai should be in merged
    assert merged["current_city"] == "Mumbai"

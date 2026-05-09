import pytest
from unittest.mock import AsyncMock, patch
from services.ai_service import _parse_json_from_response, answer_question

def test_parse_json_from_response():
    # Plain JSON
    assert _parse_json_from_response('{"a": 1}') == {"a": 1}
    # With Markdown fences
    assert _parse_json_from_response('```json\n{"a": 1}\n```') == {"a": 1}
    # With text around JSON
    assert _parse_json_from_response('Here is the json: {"a": 1} hope it helps') == {"a": 1}
    # Invalid JSON
    assert _parse_json_from_response('Not a json') == {}

@pytest.mark.asyncio
async def test_answer_question():
    with patch("services.ai_service._call_nim", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "This is the answer"
        result = await answer_question("Test Question", {})
        assert result["answer"] == "This is the answer"
        mock_call.assert_called_once()

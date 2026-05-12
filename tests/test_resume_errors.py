import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
from starlette.requests import Request
from starlette.datastructures import Headers
from routers.resume import upload_resume


def _make_mock_request():
    """Create a minimal mock Request object for rate-limited endpoints."""
    scope = {"type": "http", "method": "POST", "path": "/api/resume/upload", "headers": [], "query_string": b""}
    request = Request(scope)
    # SlowAPI needs client attribute for rate limiting
    request._headers = Headers()
    scope["client"] = ("127.0.0.1", 12345)
    return request


@pytest.mark.asyncio
async def test_upload_resume_invalid_type():
    mock_file = MagicMock()
    mock_file.filename = "test.txt"
    mock_file.content_type = "text/plain"

    with pytest.raises(HTTPException) as exc:
        await upload_resume(request=_make_mock_request(), file=mock_file, user={"id": "user123"})
    assert exc.value.status_code == 400
    assert "Only PDF files are accepted" in exc.value.detail


@pytest.mark.asyncio
async def test_upload_resume_storage_error():
    mock_file = MagicMock()
    mock_file.filename = "test.pdf"
    mock_file.content_type = "application/pdf"
    # Provide enough bytes to pass the size check, with a valid PDF header
    mock_file.read = AsyncMock(return_value=b"%PDF-1.4" + b" data" * 100)
    mock_file.seek = AsyncMock()

    with patch("services.resume_service.upload_file_to_r2", new_callable=AsyncMock) as mock_upload:
        mock_upload.side_effect = Exception("Storage failure")  # Simulate storage failure

        with pytest.raises(Exception, match="Storage failure"):
            await upload_resume(request=_make_mock_request(), file=mock_file, user={"id": "user123"})

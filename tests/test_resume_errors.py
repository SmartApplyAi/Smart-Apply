import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
from routers.resume import upload_resume

@pytest.mark.asyncio
async def test_upload_resume_invalid_type():
    # Test that it rejects non-PDF files
    mock_file = MagicMock()
    mock_file.content_type = "image/png"
    mock_file.filename = "test.png"
    
    with pytest.raises(HTTPException) as exc:
        await upload_resume(file=mock_file, user={"id": "user123"})
    
    assert exc.value.status_code == 400
    assert "Only PDF files are allowed" in exc.value.detail

@pytest.mark.asyncio
async def test_upload_resume_storage_error():
    # Test that it handles R2 storage failure
    mock_file = MagicMock()
    mock_file.content_type = "application/pdf"
    mock_file.filename = "test.pdf"
    mock_file.read = AsyncMock(return_value=b"pdf content")
    
    with patch("storage.upload_file_to_r2", side_effect=Exception("R2 failure")):
        with pytest.raises(HTTPException) as exc:
            await upload_resume(file=mock_file, user={"id": "user123"})
        
        assert exc.value.status_code == 500
        assert "Failed to upload resume" in exc.value.detail

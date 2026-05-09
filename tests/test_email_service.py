import pytest
from unittest.mock import AsyncMock, patch
from services.email_service import get_template, wrap_template, send_verification_email

@pytest.mark.asyncio
async def test_get_template_default():
    # Test that it returns default when DB fails
    with patch("database.get_db") as mock_db:
        mock_db.return_value.email_templates.find_one = AsyncMock(return_value=None)
        content = await get_template("test_id", "default_val")
        assert content == "default_val"

@pytest.mark.asyncio
async def test_wrap_template():
    # Test wrapping logic
    title = "Test Title"
    body = "<p>Test Body</p>"
    result = await wrap_template(title, body)
    assert title in result
    assert body in result
    assert "<!DOCTYPE html>" in result

@pytest.mark.asyncio
async def test_send_verification_email():
    with patch("services.email_service.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        success = await send_verification_email("test@example.com", "123456", "Test User")
        assert success is True
        mock_send.assert_called_once()

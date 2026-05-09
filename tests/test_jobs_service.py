import pytest
from unittest.mock import AsyncMock, patch
from services.jobs_service import create_application, get_application

@pytest.mark.asyncio
async def test_create_application():
    user_id = "507f1f77bcf86cd799439011"
    app_data = {
        "job_title": "Software Engineer",
        "company": "Test Corp",
        "job_url": "https://example.com/job"
    }
    
    with patch("database.get_db") as mock_db:
        mock_db.return_value.job_applications.insert_one = AsyncMock()
        mock_db.return_value.job_applications.insert_one.return_value.inserted_id = "new_app_id"
        
        result = await create_application(user_id, app_data)
        assert result["job_title"] == app_data["job_title"]
        mock_db.return_value.job_applications.insert_one.assert_called_once()

@pytest.mark.asyncio
async def test_get_application_not_found():
    with patch("database.get_db") as mock_db:
        mock_db.return_value.job_applications.find_one = AsyncMock(return_value=None)
        with pytest.raises(ValueError, match="Application not found"):
            await get_application("507f1f77bcf86cd799439011", "507f1f77bcf86cd799439011")

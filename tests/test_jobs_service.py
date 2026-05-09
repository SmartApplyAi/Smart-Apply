import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.jobs_service import create_application, get_application
from bson import ObjectId
from tests.conftest import FAKE_USER_ID, FAKE_USER_OID

@pytest.mark.asyncio
async def test_create_application(mock_db):
    user_id = FAKE_USER_ID
    app_data = {
        "job_title": "Software Engineer",
        "company": "Test Corp",
        "job_url": "https://example.com/job"
    }
    
    mock_db.job_applications.insert_one = AsyncMock(return_value=MagicMock())
    mock_db.job_applications.insert_one.return_value.inserted_id = "new_app_id"
    
    result = await create_application(user_id, app_data)
    assert "recorded" in result["message"]
    mock_db.job_applications.insert_one.assert_called_once()

@pytest.mark.asyncio
async def test_get_application_not_found(mock_db):
    mock_db.job_applications.find_one = AsyncMock(return_value=None)
    with pytest.raises(ValueError, match="Application not found"):
        await get_application(FAKE_USER_ID, str(ObjectId()))

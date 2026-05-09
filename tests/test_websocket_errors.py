import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
from websocket.auth import create_ws_ticket, consume_ws_ticket

@pytest.mark.asyncio
async def test_create_ws_ticket_redis_failure():
    # redis_client is None when redis fails
    with patch("websocket.auth.get_redis", return_value=None):
        with pytest.raises(HTTPException) as exc:
            await create_ws_ticket("user123")
        assert exc.value.status_code == 503

@pytest.mark.asyncio
async def test_consume_ws_ticket_invalid():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    
    # Mock the async context manager pipeline
    mock_pipe = AsyncMock()
    mock_pipe.get = AsyncMock(return_value=None)
    mock_pipe.execute = AsyncMock(return_value=[None, None])
    
    mock_redis.pipeline = MagicMock(return_value=mock_pipe)
    mock_pipe.__aenter__ = AsyncMock(return_value=mock_pipe)
    mock_pipe.__aexit__ = AsyncMock(return_value=None)

    with patch("websocket.auth.get_redis", return_value=mock_redis):
        payload = await consume_ws_ticket("invalid_ticket")
        assert payload is None

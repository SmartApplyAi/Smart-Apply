import pytest
from unittest.mock import AsyncMock, patch
from websocket.auth import create_ws_ticket, consume_ws_ticket

@pytest.mark.asyncio
async def test_create_ws_ticket_redis_failure():
    # Test ticket creation failure when Redis is down
    with patch("redis_client.get_redis", return_value=None):
        ticket = await create_ws_ticket("user123")
        assert ticket is None

@pytest.mark.asyncio
async def test_consume_ws_ticket_invalid():
    # Test consuming an invalid or missing ticket
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    
    with patch("redis_client.get_redis", return_value=mock_redis):
        payload = await consume_ws_ticket("invalid_ticket")
        assert payload is None

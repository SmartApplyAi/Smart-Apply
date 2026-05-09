import uuid
from datetime import timedelta
from redis_client import get_redis
from loguru import logger
import json

async def create_ws_ticket(user_id: str, device_id: str = None, extension_id: str = None) -> str:
    """Generate a single-use short-lived websocket connection ticket."""
    redis_client = get_redis()
    if not redis_client:
        logger.warning("Redis unavailable: cannot create WS ticket.")
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Service temporarily unavailable (Redis). Please try again later.")

    ticket = str(uuid.uuid4())

    payload = {
        "user_id": user_id,
    }
    if device_id:
        payload["device_id"] = device_id
    if extension_id:
        payload["extension_id"] = extension_id

    # Tickets are valid for 30 seconds
    await redis_client.set(f"ws_ticket:{ticket}", json.dumps(payload), ex=30)
    logger.debug(f"Created WS ticket for user {user_id}")
    return ticket

async def consume_ws_ticket(ticket: str) -> dict:
    """Consume and validate a websocket ticket, returning its payload."""
    if not ticket:
        return None

    redis_client = get_redis()
    if not redis_client:
        logger.warning("Redis unavailable: cannot consume WS ticket.")
        return None

    key = f"ws_ticket:{ticket}"

    # We use a transaction (pipeline) to ensure it's single-use
    async with redis_client.pipeline(transaction=True) as pipe:
        try:
            await pipe.watch(key)
            payload_str = await pipe.get(key)
            if not payload_str:
                return None

            pipe.multi()
            await pipe.delete(key)
            await pipe.execute()

            return json.loads(payload_str)
        except Exception as e:
            logger.error(f"Error consuming WS ticket: {e}")
            return None

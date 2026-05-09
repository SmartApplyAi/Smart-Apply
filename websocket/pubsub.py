from redis_client import get_redis
from websocket.manager import manager
from loguru import logger
import asyncio
import json

async def start_pubsub_listener():
    """Starts listening to Redis Pub/Sub for cross-worker realtime events."""
    redis_client = get_redis()
    pubsub = redis_client.pubsub()

    # Subscribe to security events channel
    await pubsub.subscribe("security_events")
    logger.info("Started Redis Pub/Sub listener for websocket events.")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await handle_event(data)
                except Exception as e:
                    logger.error(f"Error handling pubsub message: {e}")
    except asyncio.CancelledError:
        logger.info("Redis Pub/Sub listener cancelled.")
    finally:
        await pubsub.unsubscribe("security_events")
        await pubsub.close()


async def handle_event(data: dict):
    """Handle an event received from Redis Pub/Sub."""
    event_type = data.get("type")

    if event_type == "SESSION_REVOKED":
        user_id = data.get("user_id")
        if user_id:
            logger.info(f"Received SESSION_REVOKED for user {user_id}. Terminating sockets.")
            await manager.force_disconnect_user(user_id)

    elif event_type == "USER_NOTIFICATION":
        user_id = data.get("user_id")
        payload = data.get("payload", {})
        if user_id:
            await manager.send_personal_message(json.dumps({
                "type": "NOTIFICATION",
                "payload": payload
            }), user_id)

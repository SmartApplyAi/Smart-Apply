from redis_client import get_redis
from websocket.manager import manager
from loguru import logger
import asyncio
import json


async def start_pubsub_listener():
    """Starts listening to Redis Pub/Sub for cross-worker realtime events."""
    redis_client = get_redis()
    if not redis_client:
        logger.warning("Redis unavailable: skipping Pub/Sub listener.")
        return

    pubsub = redis_client.pubsub()

    # Subscribe to all event channels
    await pubsub.subscribe("security_events", "job_events", "skill_gap_events")
    logger.info("Started Redis Pub/Sub listener for websocket events (security, job, skill_gap).")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    channel = message.get("channel", b"").decode() if isinstance(message.get("channel"), bytes) else message.get("channel", "")
                    await handle_event(data, channel)
                except Exception as e:
                    logger.error(f"Error handling pubsub message: {e}")
    except asyncio.CancelledError:
        logger.info("Redis Pub/Sub listener cancelled.")
    finally:
        await pubsub.unsubscribe("security_events", "job_events", "skill_gap_events")
        await pubsub.close()


async def handle_event(data: dict, channel: str = ""):
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

    elif event_type in ("JOB_APPLIED", "JOB_FAILED", "JOB_SKIPPED"):
        user_id = data.get("user_id")
        payload = data.get("payload", {})
        if user_id:
            await manager.send_typed_event(user_id, event_type, payload)

    elif event_type == "MATCH_SCORE":
        user_id = data.get("user_id")
        payload = data.get("payload", {})
        if user_id:
            await manager.send_typed_event(user_id, event_type, payload)

    elif event_type == "SKILL_GAP_ALERT":
        user_id = data.get("user_id")
        payload = data.get("payload", {})
        if user_id:
            await manager.send_typed_event(user_id, event_type, payload)

    elif event_type == "BOT_RUN_SUMMARY":
        user_id = data.get("user_id")
        payload = data.get("payload", {})
        if user_id:
            await manager.send_typed_event(user_id, event_type, payload)

    elif event_type == "ROADMAP_READY":
        user_id = data.get("user_id")
        payload = data.get("payload", {})
        if user_id:
            await manager.send_typed_event(user_id, "ROADMAP_READY", payload)


async def publish_job_event(user_id: str, event_type: str, payload: dict):
    """Publish a job event to Redis for cross-worker broadcast."""
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("job_events", json.dumps({
            "type": event_type,
            "user_id": user_id,
            "payload": payload,
        }))
    else:
        # Fallback: direct WebSocket send (single-worker mode)
        await manager.send_typed_event(user_id, event_type, payload)


async def publish_skill_gap_event(user_id: str, payload: dict):
    """Publish a skill gap alert to Redis for cross-worker broadcast."""
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("skill_gap_events", json.dumps({
            "type": "SKILL_GAP_ALERT",
            "user_id": user_id,
            "payload": payload,
        }))
    else:
        await manager.send_typed_event(user_id, "SKILL_GAP_ALERT", payload)


async def publish_roadmap_event(user_id: str, payload: dict):
    """Publish a roadmap-ready event to Redis for cross-worker broadcast."""
    redis_client = get_redis()
    if redis_client:
        await redis_client.publish("skill_gap_events", json.dumps({
            "type": "ROADMAP_READY",
            "user_id": user_id,
            "payload": payload,
        }))
    else:
        await manager.send_typed_event(user_id, "ROADMAP_READY", payload)

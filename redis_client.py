import redis.asyncio as redis
from config import settings
from loguru import logger
from typing import Optional

_redis_client: Optional[redis.Redis] = None

async def init_redis():
    global _redis_client
    # If REDIS_URL is not set, fallback to a default (usually only in dev)
    redis_url = getattr(settings, "REDIS_URL", "redis://localhost:6379/0")

    logger.info(f"Connecting to Redis at {redis_url}...")

    kwargs = {
        "decode_responses": True,
    }

    # Handle SSL for hosted providers like Render (rediss://)
    if redis_url.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = "none"

    try:
        # We use from_url which automatically configures connection pooling
        _redis_client = redis.from_url(redis_url, **kwargs)
        # Verify connection
        await _redis_client.ping()
        logger.info("Connected to Redis successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        logger.warning("Running in degraded mode: Redis-dependent features (WebSockets, Session Revocation, Extension Pairing) will be unavailable.")
        _redis_client = None

async def close_redis():
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        logger.info("Redis connection closed.")

def get_redis() -> Optional[redis.Redis]:
    """
    Returns the Redis client. May return None if Redis connection failed during startup,
    putting the app into a degraded mode. Callers MUST handle None gracefully.
    """
    return _redis_client

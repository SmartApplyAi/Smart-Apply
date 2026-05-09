import redis.asyncio as redis
from config import settings
from loguru import logger

_redis_client = None

async def init_redis():
    global _redis_client
    # If REDIS_URL is not set, fallback to a default (usually only in dev)
    redis_url = getattr(settings, "REDIS_URL", "redis://localhost:6379/0")
    logger.info(f"Connecting to Redis at {redis_url}...")
    try:
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        # Verify connection
        await _redis_client.ping()
        logger.info("Connected to Redis successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        # Consider whether to fail hard or soft depending on the environment.
        # For this refactor, Redis is a hard dependency.
        raise e

async def close_redis():
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        logger.info("Redis connection closed.")

def get_redis() -> redis.Redis:
    if _redis_client is None:
        raise RuntimeError("Redis client not initialized. Call init_redis() first.")
    return _redis_client

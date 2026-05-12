"""
AI Core: NIM API base caller and distributed key rotation.
"""

import json
import re
import httpx
import random
import time
import asyncio
import itertools
from config import settings
from loguru import logger
from redis_client import get_redis

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_MODEL = "meta/llama-3.1-70b-instruct"

# Local fallback state (single-instance or Redis offline)
_keys_cycle = None
_keys_lock = asyncio.Lock()
_bad_keys = {}  # key -> expiry_timestamp

async def _get_api_key() -> str:
    """Distributed round-robin through NIM API keys using Redis, with local fallback."""
    global _keys_cycle, _bad_keys
    
    keys = await settings.get_nim_api_key_list()
    if not keys:
        raise ValueError("No NVIDIA NIM API keys configured. Add NIM_API_KEYS to .env")
    
    now = time.time()
    valid_keys = [k for k in keys if k not in _bad_keys or _bad_keys[k] < now]
    
    if not valid_keys:
        _bad_keys = {}
        valid_keys = keys
        logger.warning("All NIM API keys were blacklisted locally. Resetting.")

    redis = get_redis()
    if redis:
        try:
            # Atomic increment for distributed round-robin
            idx = await redis.incr("smartapply:nim_key_index")
            return valid_keys[idx % len(valid_keys)]
        except Exception as e:
            logger.warning(f"Redis key rotation failed, falling back to local: {e}")

    # Local fallback
    async with _keys_lock:
        if _keys_cycle is None:
            _keys_cycle = itertools.cycle(valid_keys)
        return next(_keys_cycle)

async def reset_keys_cycle():
    """Reset the API key cycle and clear the blacklist (distributed)."""
    global _keys_cycle, _bad_keys
    await settings.reset_nim_cache()
    
    async with _keys_lock:
        _keys_cycle = None
        _bad_keys = {}

    redis = get_redis()
    if redis:
        try:
            await redis.set("smartapply:nim_key_index", 0)
        except Exception:
            pass
    logger.info("NIM API key cycle reset.")

async def _call_nim(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Core NIM API caller with exponential backoff and blacklisting."""
    global _bad_keys
    
    keys = await settings.get_nim_api_key_list()
    max_retries = max(len(keys) * 2, 6)
    
    for attempt in range(max_retries):
        api_key = await _get_api_key()
        
        payload = {
            "model": NIM_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": 0.9,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{NIM_BASE_URL}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("choices"):
                        return data["choices"][0]["message"]["content"].strip()
                    return ""
                
                if response.status_code in (401, 403):
                    _bad_keys[api_key] = time.time() + 3600
                    logger.error(f"NIM Key blacklisted (403). Attempt {attempt+1}/{max_retries}")
                    continue
                
                if response.status_code == 429:
                    wait = min(2**attempt + random.random(), 10)
                    await asyncio.sleep(wait)
                    continue
                
                response.raise_for_status()

        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(min(2**attempt, 5))
                continue
            logger.error(f"NIM API Error: {e}")
            raise ValueError("AI service currently overwhelmed.")

    raise ValueError("AI service failed after multiple retries.")

def _parse_json_from_response(text: str) -> dict:
    """Extract JSON from an LLM response."""
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try: return json.loads(match.group())
            except: pass
    return {}

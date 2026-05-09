from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from dependencies import get_current_user
from redis_client import get_redis
from utils import create_access_token, create_extension_token
from loguru import logger
from limiter import limiter
import uuid
import json
from datetime import datetime, timezone, timedelta
from database import get_db

router = APIRouter(prefix="/extension", tags=["Extension"])

class ExchangeRequest(BaseModel):
    pairing_code: str
    device_info: dict

@router.post("/pairing-code")
@limiter.limit("5/minute")
async def generate_pairing_code(request: Request, user: dict = Depends(get_current_user)):
    """Generate a short-lived pairing code for the extension."""
    redis_client = get_redis()
    if not redis_client:
        logger.warning("Redis unavailable: cannot generate pairing code.")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable (Redis). Please try again later.")

    # Generate a high-entropy base36 code (e.g. 8 chars)
    import secrets
    import string
    alphabet = string.ascii_uppercase + string.digits
    code = ''.join(secrets.choice(alphabet) for i in range(8))

    payload = {
        "user_id": user["id"],
        "email": user["email"]
    }

    # Store in Redis with 2 minute expiry
    await redis_client.set(f"pairing_code:{code}", json.dumps(payload), ex=120)
    logger.info(f"Generated pairing code for user {user['id']}")

    return {
        "pairing_code": code,
        "expires_in": 120
    }

@router.post("/exchange")
@limiter.limit("10/minute")
async def exchange_pairing_code(request: Request, body: ExchangeRequest):
    """Exchange a pairing code for an extension token."""
    redis_client = get_redis()
    if not redis_client:
        logger.warning("Redis unavailable: cannot exchange pairing code.")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable (Redis). Please try again later.")

    key = f"pairing_code:{body.pairing_code}"

    # Use transaction to ensure code is single-use
    async with redis_client.pipeline(transaction=True) as pipe:
        try:
            await pipe.watch(key)
            # Fetch inside the watched context to prevent race conditions
            payload_str = await pipe.get(key)
            if not payload_str:
                raise HTTPException(status_code=400, detail="Invalid or expired pairing code")

            pipe.multi()
            await pipe.delete(key)
            await pipe.execute()

            payload = json.loads(payload_str)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error exchanging pairing code: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")

    user_id = payload["user_id"]
    device_id = str(uuid.uuid4())

    # Generate scoped extension token (expires in 30 days, renewable)
    token_data = {
        "sub": user_id,
        "type": "extension",
        "device_id": device_id
    }
    extension_token = create_extension_token(token_data, expires_delta=timedelta(days=30))

    # Store extension token metadata in MongoDB for revocation
    db = get_db()
    import hashlib
    token_hash = hashlib.sha256(extension_token.encode()).hexdigest()

    await db.extension_sessions.insert_one({
        "user_id": user_id,
        "device_id": device_id,
        "token_hash": token_hash,
        "device_info": body.device_info,
        "created_at": datetime.now(timezone.utc),
        "last_active": datetime.now(timezone.utc),
        "is_active": True
    })

    logger.info(f"Extension paired for user {user_id} on device {device_id}")
    return {
        "extension_token": extension_token,
        "device_id": device_id
    }

class HeartbeatRequest(BaseModel):
    token: str

@router.post("/heartbeat")
@limiter.limit("60/minute")
async def extension_heartbeat(request: Request, body: HeartbeatRequest):
    """Update extension session last_active timestamp."""
    from utils import decode_token
    import hashlib

    payload = decode_token(body.token)
    if not payload or payload.get("type") != "extension":
        raise HTTPException(status_code=401, detail="Invalid extension token")

    user_id = payload.get("sub")
    device_id = payload.get("device_id")
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()

    db = get_db()
    result = await db.extension_sessions.update_one(
        {"user_id": user_id, "device_id": device_id, "token_hash": token_hash, "is_active": True},
        {"$set": {"last_active": datetime.now(timezone.utc)}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=401, detail="Session revoked or invalid")

    return {"status": "ok"}

"""
Cloudflare R2 (S3-compatible) storage client.
Handles resume uploads, downloads, presigned URLs, and deletions.
"""

import boto3
from botocore.config import Config as BotoConfig
from config import settings
from loguru import logger

import asyncio

_s3_client = None
_s3_lock = None


async def get_s3_client():
    """Lazy-initialise and return the S3 client for R2."""
    global _s3_client, _s3_lock
    if _s3_client is not None:
        return _s3_client
        
    if _s3_lock is None:
        _s3_lock = asyncio.Lock()
        
    async with _s3_lock:
        # Re-check after lock to prevent multiple initialisations
        if _s3_client is None:
            logger.info("Initialising R2 storage client...")
            _s3_client = boto3.client(
                "s3",
                endpoint_url=settings.r2_endpoint_url,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                region_name="auto",
                config=BotoConfig(
                    signature_version="s3v4",
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=5,
                    read_timeout=15,
                ),
            )
            logger.info("R2 storage client initialised.")
    return _s3_client


import asyncio

async def upload_file_to_r2(
    file_bytes: bytes,
    object_key: str,
    content_type: str = "application/pdf",
) -> str:
    """Upload a file to R2 and return the object key."""
    client = await get_s3_client()
    
    def _upload():
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=object_key,
            Body=file_bytes,
            ContentType=content_type,
        )
        
    await asyncio.to_thread(_upload)
    logger.info(f"Uploaded to R2: {object_key}")
    return object_key


async def get_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    """Generate a presigned download URL for an R2 object."""
    client = await get_s3_client()
    
    def _get_url():
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.R2_BUCKET_NAME, "Key": object_key},
            ExpiresIn=expires_in,
        )
        
    return await asyncio.to_thread(_get_url)


async def get_file_from_r2(object_key: str) -> bytes:
    """Download a file's bytes from R2."""
    client = await get_s3_client()
    
    def _get_file():
        response = client.get_object(Bucket=settings.R2_BUCKET_NAME, Key=object_key)
        return response["Body"].read()
        
    return await asyncio.to_thread(_get_file)


async def delete_file_from_r2(object_key: str) -> None:
    """Delete a file from R2."""
    client = await get_s3_client()
    
    def _delete():
        client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=object_key)
        
    await asyncio.to_thread(_delete)
    logger.info(f"Deleted from R2: {object_key}")

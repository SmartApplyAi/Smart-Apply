import asyncio
import time
import os
import psutil
import httpx
from loguru import logger
from config import settings

class MonitorService:
    _start_time = time.time()

    @classmethod
    def get_uptime(cls) -> float:
        return time.time() - cls._start_time

    @classmethod
    def get_system_stats(cls):
        """Gather system metrics using psutil."""
        try:
            cpu_usage = psutil.cpu_percent(interval=None)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            return {
                "cpu_usage_percent": cpu_usage,
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "used": memory.used,
                    "percent": memory.percent
                },
                "disk": {
                    "total": disk.total,
                    "used": disk.used,
                    "free": disk.free,
                    "percent": disk.percent
                },
                "process": {
                    "threads": psutil.Process().num_threads(),
                    "memory_info": psutil.Process().memory_info().rss
                }
            }
        except Exception as e:
            logger.error(f"Error gathering system stats: {e}")
            return {"error": str(e)}

    @classmethod
    def get_render_info(cls):
        """Extract Render-specific environment info."""
        return {
            "instance_id": os.getenv("RENDER_INSTANCE_ID", "local"),
            "service_id": os.getenv("RENDER_SERVICE_ID", "local"),
            "service_name": os.getenv("RENDER_SERVICE_NAME", settings.APP_NAME),
            "external_url": settings.RENDER_EXTERNAL_URL
        }

    @classmethod
    async def keep_alive_task(cls):
        """Background task to ping the health endpoint."""
        # Wait a bit before starting to ensure the server is up
        await asyncio.sleep(30)
        
        url = settings.RENDER_EXTERNAL_URL
        if not url:
            port = os.getenv("PORT", "8000")
            url = f"http://127.0.0.1:{port}"
            
        health_url = f"{url.rstrip('/')}/api/health"
        interval = settings.KEEP_ALIVE_INTERVAL * 60
        
        # Don't log the full local URL if it's just the fallback
        display_url = health_url if settings.RENDER_EXTERNAL_URL else "/api/health (local)"
        logger.info(f"Starting keep-alive scheduler: pinging {display_url} every {settings.KEEP_ALIVE_INTERVAL}m")
        
        async with httpx.AsyncClient() as client:
            while True:
                try:
                    start_time = time.time()
                    response = await client.get(health_url, timeout=10.0)
                    duration = round((time.time() - start_time) * 1000, 2)
                    
                    if response.status_code == 200:
                        logger.debug(f"Keep-alive ping successful: {health_url} ({duration}ms)")
                    else:
                        logger.warning(f"Keep-alive ping failed: {health_url} returned {response.status_code}")
                except Exception as e:
                    logger.error(f"Keep-alive ping error: {e}")
                
                await asyncio.sleep(interval)

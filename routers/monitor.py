from fastapi import APIRouter, Depends, Request
from services.monitor_service import MonitorService
from dependencies import require_admin
from limiter import limiter

router = APIRouter(tags=["Monitoring"])

@router.get("/monitor/stats")
@limiter.limit("20/minute")
async def get_stats(request: Request, admin: dict = Depends(require_admin)):
    """Get system and Render statistics."""
    return {
        "uptime_seconds": MonitorService.get_uptime(),
        "system": MonitorService.get_system_stats(),
        "render": MonitorService.get_render_info()
    }

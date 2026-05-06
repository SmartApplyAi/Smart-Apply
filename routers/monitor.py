from fastapi import APIRouter, Depends
from services.monitor_service import MonitorService
from dependencies import require_admin

router = APIRouter(tags=["Monitoring"])

@router.get("/monitor/stats")
async def get_stats(admin: dict = Depends(require_admin)):
    """Get system and Render statistics."""
    return {
        "uptime_seconds": MonitorService.get_uptime(),
        "system": MonitorService.get_system_stats(),
        "render": MonitorService.get_render_info()
    }

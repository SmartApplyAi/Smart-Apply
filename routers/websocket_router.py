from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
from dependencies import get_current_user
from websocket.auth import create_ws_ticket, consume_ws_ticket
from websocket.manager import manager
from loguru import logger
from limiter import limiter
from fastapi import Request
import json
import asyncio

router = APIRouter()

@router.post("/api/ws-ticket")
@limiter.limit("10/minute")
async def generate_ws_ticket(request: Request, user: dict = Depends(get_current_user)):
    """Generate a short-lived ticket for establishing a secure WebSocket connection."""
    # Assuming the user object has the 'id' field populated by the dependency
    user_id = user["id"]
    ticket = await create_ws_ticket(user_id=user_id)
    return {"ticket": ticket}


@router.websocket("/ws/realtime")
async def websocket_realtime_endpoint(websocket: WebSocket, ticket: str = None):
    """Secure WebSocket endpoint protected by the ticket system."""
    # Strict origin validation for websockets
    from config import settings
    origin = websocket.headers.get("origin")
    if settings.is_production and origin:
        is_allowed = False
        if origin == settings.FRONTEND_URL:
            is_allowed = True
        elif settings.CHROME_EXTENSION_ID and origin == f"chrome-extension://{settings.CHROME_EXTENSION_ID}":
            is_allowed = True
        elif not settings.CHROME_EXTENSION_ID and origin.startswith("chrome-extension://"):
            is_allowed = True
            
        if not is_allowed:
            logger.warning(f"WebSocket rejected: Origin {origin} not allowed.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not allowed")
            return

    if not ticket:
        logger.warning("WebSocket connection attempted without a ticket.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Ticket required")
        return

    payload = await consume_ws_ticket(ticket)
    if not payload:
        logger.warning(f"WebSocket connection attempted with invalid/expired ticket: {ticket}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired ticket")
        return

    user_id = payload.get("user_id")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid ticket payload")
        return

    await manager.connect(websocket, user_id)

    try:
        # Acknowledge connection
        await websocket.send_text(json.dumps({
            "type": "CONNECTION_ACK",
            "message": "Connected securely to SmartApply realtime services"
        }))

        while True:
            # Wait for messages from the client (e.g. heartbeat/ping)
            data = await websocket.receive_text()
            try:
                parsed = json.loads(data)
                if parsed.get("type") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket, user_id)

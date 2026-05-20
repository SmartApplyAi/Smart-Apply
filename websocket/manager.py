from typing import Dict, Set
from fastapi import WebSocket, status
from loguru import logger
import json

class ConnectionManager:
    def __init__(self):
        # Maps user_id -> set of active WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        logger.info(f"WebSocket connected for user {user_id}. Total connections for user: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected for user {user_id}")

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            # Create a list of failed connections to clean up later
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.debug(f"Failed to send to a websocket for user {user_id}: {e}")
                    dead_connections.append(connection)

            for dead in dead_connections:
                self.disconnect(dead, user_id)

    async def send_typed_event(self, user_id: str, event_type: str, payload: dict):
        """Send a structured typed event to a specific user's connections."""
        from datetime import datetime, timezone
        message = json.dumps({
            "type": event_type,
            "payload": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await self.send_personal_message(message, user_id)


    async def force_disconnect_user(self, user_id: str, code: int = status.WS_1008_POLICY_VIOLATION, reason: str = "Session Revoked"):
        """Forcefully disconnect all sockets for a given user."""
        if user_id in self.active_connections:
            connections = list(self.active_connections[user_id])
            for connection in connections:
                try:
                    # Try to send a final farewell message before closing
                    await connection.send_text(json.dumps({"type": "FORCE_REAUTH", "reason": reason}))
                    await connection.close(code=code, reason=reason)
                except Exception:
                    pass
                finally:
                    self.disconnect(connection, user_id)
            logger.info(f"Forcefully disconnected all sockets for user {user_id}")

manager = ConnectionManager()

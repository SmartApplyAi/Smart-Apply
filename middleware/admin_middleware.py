"""
Admin Audit Logging Middleware.
Logs all /api/admin/* requests to the audit_logs collection.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from database import get_db
from datetime import datetime, timezone
from loguru import logger
import json
from utils import decode_token

class AdminAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only log admin routes
        if not request.url.path.startswith("/api/admin"):
            return await call_next(request)

        # Get user from state (if already authenticated by Depends)
        # Note: Middleware runs before route dependencies, so we might not have user yet.
        # Instead, we'll log the request and update it later if possible, 
        # or just rely on the fact that these routes are protected.
        
        # Extract user info before call_next
        user_id = "anonymous"
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            token = request.cookies.get("sa_token") # Try cookie too
            
        if token:
            try:
                payload = decode_token(token)
                if payload:
                    user_id = payload.get("sub", "anonymous")
                    # Check if token is blacklisted (revoked)
                    db = get_db()
                    blacklisted = await db.blacklisted_tokens.find_one({"token": token})
                    if blacklisted:
                        user_id = "revoked_" + user_id
            except Exception:
                pass
        
        request.state.user_id = user_id
        response = await call_next(request)
        
        # We only log successful or partially successful actions
        if response.status_code < 400:
            try:
                # Log action asynchronously
                db = get_db()
                
                audit_entry = {
                    "user_id": request.state.user_id,
                    "method": request.method,
                    "path": request.url.path,
                    "query_params": dict(request.query_params),
                    "status_code": response.status_code,
                    "ip_address": request.client.host if request.client else "unknown",
                    "timestamp": datetime.now(timezone.utc)
                }
                
                # We don't log the body for security/privacy (might contain sensitive keys)
                # unless it's a specific safe action.
                # Log action
                await db.audit_logs.insert_one(audit_entry)
            except Exception as e:
                logger.error(f"Failed to log admin action: {e}")

        return response

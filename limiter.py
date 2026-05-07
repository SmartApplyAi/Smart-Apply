from slowapi import Limiter
from slowapi.util import get_remote_address

def get_client_ip(request):
    """Get the client IP, preferring the X-Forwarded-For header for proxy compatibility."""
    # Render and other proxies use X-Forwarded-For
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Get the first IP in the list, stripping any port
        return forwarded.split(",")[0].split(":")[0].strip()
    
    # Fallback to direct client host
    if request.client:
        return request.client.host
        
    return "127.0.0.1"


def get_user_or_ip(request):
    """Rate limit by user ID if authenticated, else by IP.
    
    Prevents VPN rotation from bypassing per-IP rate limits on
    authenticated endpoints. Falls back to IP for anonymous requests.
    """
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if token:
        try:
            from utils import decode_token
            payload = decode_token(token)
            if payload and payload.get("sub"):
                return f"user:{payload['sub']}"
        except Exception:
            pass
    return get_client_ip(request)


limiter = Limiter(key_func=get_client_ip)
user_limiter = Limiter(key_func=get_user_or_ip)

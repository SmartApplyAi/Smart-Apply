from slowapi import Limiter

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

limiter = Limiter(key_func=get_client_ip)

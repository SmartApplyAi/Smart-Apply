from datetime import datetime, timezone
from database import get_db
from bson import ObjectId
from config import settings
from loguru import logger
from services.ai_service import reset_keys_cycle

async def get_admin_stats() -> dict:
    """Get global platform statistics."""
    db = get_db()
    
    total_users = await db.users.count_documents({})
    active_users = await db.users.count_documents({"is_active": True, "email_verified": True})
    total_apps = await db.job_applications.count_documents({})
    
    # Success rate globally
    applied = await db.job_applications.count_documents({"result": "Applied"})
    success_rate = round((applied / total_apps * 100), 1) if total_apps > 0 else 0
    
    # Recent activity across all users
    recent_apps = await db.job_applications.find().sort("applied_at", -1).limit(10).to_list(length=None)
    for app in recent_apps:
        app["id"] = str(app["_id"])
        del app["_id"]
        if app.get("applied_at"):
            app["applied_at"] = app["applied_at"].isoformat()
            
    return {
        "total_users": total_users,
        "total_applications": total_apps,
        "nvidia_keys": len(await settings.get_nim_api_key_list()),
        "success_rate": success_rate,
        "recent_applications": recent_apps
    }

async def get_all_users(skip: int = 0, limit: int = 50) -> tuple:
    """Get paginated list of all users (admin view)."""
    db = get_db()
    total = await db.users.count_documents({})
    cursor = db.users.find().sort("created_at", -1).skip(skip).limit(limit)
    users = []
    async for doc in cursor:
        app_count = await db.job_applications.count_documents({"user_id": str(doc["_id"])})
        users.append({
            "id": str(doc["_id"]),
            "email": doc["email"],
            "role": doc.get("role", "user"),
            "is_active": doc.get("is_active", True),
            "email_verified": doc.get("email_verified", False),
            "app_count": app_count,
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
            "last_login": doc.get("last_login").isoformat() if doc.get("last_login") else None,
        })
    return users, total

async def update_user_status(user_id: str, is_active: bool = None, role: str = None) -> bool:
    """Update user activation status or role."""
    db = get_db()
    update_data = {}
    if is_active is not None:
        update_data["is_active"] = is_active
    if role is not None:
        update_data["role"] = role
        
    if not update_data:
        return False
        
    try:
        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0
    except Exception:
        logger.error(f"Invalid user_id provided for status update: {user_id}")
        return False

async def update_nim_keys(keys_str: str):
    """Update NIM API keys in DB and refresh config."""
    db = get_db()
    
    # Persist to DB config collection
    await db.config.update_one(
        {"key": "nvidia_nim_keys"},
        {"$set": {"value": keys_str, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    # Update current settings object (using __setattr__ for Pydantic v2 compatibility)
    object.__setattr__(settings, "NIM_API_KEYS", keys_str)
    
    # Trigger cycle reset (which also resets nim cache)
    await reset_keys_cycle()
    
    logger.info("NIM API keys updated and persisted to DB.")

# ── New Admin Features ───────────────────────────────────────────────────────

async def get_active_sessions() -> list:
    """View all active automation sessions."""
    db = get_db()
    cursor = db.automation_sessions.find(
        {"status": {"$in": ["running", "paused"]}}
    ).sort("updated_at", -1)
    
    sessions = []
    async for doc in cursor:
        user = await db.users.find_one({"_id": ObjectId(doc["user_id"])})
        sessions.append({
            "id": str(doc["_id"]),
            "user_email": user["email"] if user else "unknown",
            "status": doc.get("status"),
            "total_applied": doc.get("total_applied", 0),
            "started_at": doc["started_at"].isoformat() if doc.get("started_at") else None,
            "updated_at": doc["updated_at"].isoformat() if doc.get("updated_at") else None,
        })
    return sessions

async def get_audit_logs(limit: int = 100, user_id: str = None, skip: int = 0) -> list:
    """View admin audit logs with pagination."""
    db = get_db()
    query = {}
    if user_id:
        query["user_id"] = user_id
        
    cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(min(limit, 100))
    logs = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        if doc.get("timestamp"):
            doc["timestamp"] = doc["timestamp"].isoformat()
        logs.append(doc)
    return logs

async def hard_delete_user(user_id: str) -> bool:
    """Hard delete a user and all their data.
    R2 file deletions are performed inline but with error handling to prevent
    partial failures from blocking DB cleanup.
    """
    from services.profile_service import delete_full_profile
    return await delete_full_profile(user_id)

async def test_nim_key(key: str) -> dict:
    """Test if an NVIDIA NIM key is valid and return latency."""
    import time
    import httpx
    
    start_time = time.time()
    try:
        async with httpx.AsyncClient() as client:
            # Simple health check call to NIM
            response = await client.get(
                "https://integrate.api.nvidia.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=5.0
            )
            latency = round((time.time() - start_time) * 1000, 2)
            
            if response.status_code == 200:
                return {"valid": True, "latency_ms": latency}
            else:
                return {"valid": False, "error": f"HTTP {response.status_code}", "latency_ms": latency}
    except Exception as e:
        return {"valid": False, "error": str(e)}

async def broadcast_announcement(subject: str, message_html: str) -> dict:
    """Send an announcement email to all verified users."""
    db = get_db()
    cursor = db.users.find({"email_verified": True, "is_active": True})
    
    from services.email_service import send_email, wrap_template
    import asyncio
    
    count = 0
    errors = 0
    async for user in cursor:
        user_id = str(user["_id"])
        profile = await db.user_profiles.find_one({"user_id": user_id})
        first_name = profile.get("first_name", "User") if profile else "User"
        
        personalized_message = _sanitize_html(message_html.replace("{{user-name}}", first_name))
        
        html_content = await wrap_template("Announcement", personalized_message)
        success = await send_email(
            user["email"],
            "",
            subject,
            html_content
        )
        if success:
            count += 1
        else:
            errors += 1
        # Throttle to avoid Brevo rate limit and event loop blocking
        if (count + errors) % 10 == 0:
            await asyncio.sleep(0.5)
            
    return {"sent_count": count}


def _sanitize_html(content: str) -> str:
    """Sanitize HTML to prevent XSS/phishing injection in broadcast emails.
    
    Strips dangerous tags (script, iframe, form, object, embed, link, meta, base, style),
    event handlers (onload, onclick, etc.), and javascript: hrefs.
    """
    import re as _re
    # Remove dangerous tags (both paired and self-closing)
    dangerous = r'<(script|iframe|form|object|embed|link|meta|base|style)[^>]*>.*?</\1>'
    content = _re.sub(dangerous, '', content, flags=_re.IGNORECASE | _re.DOTALL)
    # Remove self-closing dangerous tags
    content = _re.sub(r'<(script|iframe|form|object|embed|link|meta|base|style)[^>]*/>', '', content, flags=_re.IGNORECASE)
    # Remove unclosed dangerous tags
    content = _re.sub(r'<(script|iframe|form|object|embed|link|meta|base|style)[^>]*>', '', content, flags=_re.IGNORECASE)
    # Remove event handlers (e.g., onload="...", onclick='...')
    content = _re.sub(r'\s+on\w+\s*=\s*["\'][^"\']*["\']', '', content, flags=_re.IGNORECASE)
    content = _re.sub(r'\s+on\w+\s*=\s*\S+', '', content, flags=_re.IGNORECASE)
    # Remove javascript: hrefs
    content = _re.sub(r'href\s*=\s*["\']javascript:[^"\']*["\']', 'href="#"', content, flags=_re.IGNORECASE)
    return content

async def get_platform_trends() -> dict:
    """Get platform-wide application trends for Chart.js."""
    db = get_db()
    from datetime import timedelta
    
    # Get apps per day for the last 7 days
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    pipeline = [
        {"$match": {"applied_at": {"$gte": start_date}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$applied_at"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id": 1}}
    ]
    
    cursor = db.job_applications.aggregate(pipeline)
    trends = await cursor.to_list(length=None)
    
    return {
        "labels": [d["_id"] for d in trends],
        "data": [d["count"] for d in trends]
    }

# ── Dynamic Questions ────────────────────────────────────────────────────────

async def get_all_questions() -> dict:
    """Get all dynamic profile questions."""
    db = get_db()
    cursor = db.dynamic_questions.find().sort("created_at", 1)
    questions = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        questions.append(doc)
    return {"questions": questions}

async def create_question(payload: dict) -> dict:
    """Create a new dynamic profile question."""
    db = get_db()
    question_doc = {
        "text": payload.get("text", "New Question"),
        "type": payload.get("type", "text"),
        "options": payload.get("options", []),
        "is_required": payload.get("is_required", False),
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.dynamic_questions.insert_one(question_doc)
    question_doc["id"] = str(result.inserted_id)
    del question_doc["_id"]
    return question_doc

async def update_question(question_id: str, payload: dict) -> dict:
    """Update a dynamic profile question."""
    db = get_db()
    update_data = {
        "text": payload.get("text"),
        "type": payload.get("type"),
        "options": payload.get("options", []),
        "is_required": payload.get("is_required", False),
        "updated_at": datetime.now(timezone.utc)
    }
    # Filter out None values just in case
    update_data = {k: v for k, v in update_data.items() if v is not None}
    
    await db.dynamic_questions.update_one(
        {"_id": ObjectId(question_id)}, 
        {"$set": update_data}
    )
    return {"message": "Question updated"}

async def delete_question(question_id: str) -> dict:
    """Delete a dynamic profile question."""
    db = get_db()
    await db.dynamic_questions.delete_one({"_id": ObjectId(question_id)})
    return {"message": "Question deleted"}

# ── Email Templates ──────────────────────────────────────────────────────────

async def get_email_templates() -> dict:
    """Get all email templates, merging defaults with db overwrites."""
    db = get_db()
    cursor = db.email_templates.find()
    templates = {}
    async for doc in cursor:
        templates[doc["template_id"]] = doc["content"]
        
    from services.email_service import _BASE_STYLE, _HEADER_HTML, _FOOTER_HTML
    
    defaults = {
        "global_style": {"name": "Global CSS Style", "content": _BASE_STYLE},
        "global_header": {"name": "Global Header HTML", "content": _HEADER_HTML},
        "global_footer": {"name": "Global Footer HTML", "content": _FOOTER_HTML},
        "verification_email": {"name": "Verification Email", "content": '''
    <h2>Verify your email</h2>
    <p>Hi {name},</p>
    <p>Thanks for signing up! Enter this code to verify your email address:</p>
    <div class="pin-box">
      <div class="pin-code">{pin}</div>
    </div>
    <p class="muted">This code expires in 15 minutes. If you didn't create an account, ignore this email.</p>
    '''},
        "password_reset": {"name": "Password Reset", "content": f'''
    <h2>Reset your password</h2>
    <p>Hi {{name}},</p>
    <p>We received a request to reset your password. Click the button below to set a new one:</p>
    <div style="text-align: center;">
      <a href="{{reset_url}}" class="btn">Reset Password</a>
    </div>
    <p class="muted">This link expires in {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes. If you didn't request this, ignore this email.</p>
    <p class="muted" style="word-break: break-all;">Or copy this URL: {{reset_url}}</p>
    '''},
        "application_alert": {"name": "Application Alert", "content": '''
    <h2>Application Update</h2>
    <p>Hi {name},</p>
    <p>Your application status has been updated:</p>
    <div class="pin-box" style="border-color: {color};">
      <div style="font-size: 14px; color: #94a3b8; margin-bottom: 4px;">{company}</div>
      <div style="font-size: 18px; font-weight: 700; color: #f1f5f9;">{job_title}</div>
      <div style="font-size: 16px; font-weight: 600; color: {color}; margin-top: 8px;">Status: {status}</div>
    </div>
    <p><a href="''' + settings.FRONTEND_URL + '''/dashboard.html" class="btn">View Dashboard</a></p>
    '''},
        "automation_summary": {"name": "Automation Summary", "content": '''
    <h2>Automation Run Complete</h2>
    <p>Hi {name},</p>
    <p>Your automation session has finished. Here's a summary:</p>
    <div class="pin-box">
      <div style="display: flex; justify-content: space-around; text-align: center;">
        <div><div style="font-size: 28px; font-weight: 800; color: #f1f5f9;">{total}</div><div class="muted">Total</div></div>
        <div><div style="font-size: 28px; font-weight: 800; color: #22c55e;">{applied}</div><div class="muted">Applied</div></div>
        <div><div style="font-size: 28px; font-weight: 800; color: #ef4444;">{failed}</div><div class="muted">Failed</div></div>
        <div><div style="font-size: 28px; font-weight: 800; color: #94a3b8;">{skipped}</div><div class="muted">Skipped</div></div>
      </div>
    </div>
    <p><a href="''' + settings.FRONTEND_URL + '''/dashboard.html" class="btn">View Details</a></p>
    '''},
        "security_alert": {"name": "Security Alert", "content": '''
    <h2>Security Alert</h2>
    <p>Hi {name},</p>
    <p>We detected the following security event on your account:</p>
    <div class="pin-box" style="border-color: #f59e0b;">
      <div style="font-size: 16px; font-weight: 600; color: #f59e0b;">{event}</div>
      <div class='muted' style='margin-top: 8px;'>IP: {ip}</div>
    </div>
    <p class="muted">If this wasn't you, please reset your password immediately.</p>
    <p><a href="''' + settings.FRONTEND_URL + '''/forgot-password.html" class="btn" style="background: #f59e0b;">Secure My Account</a></p>
    '''},
        "weekly_digest": {"name": "Weekly Digest", "content": '''
    <h2>Your Weekly Summary</h2>
    <p>Hi {name},</p>
    <p>Here's what happened with your applications this week:</p>
    <div class="pin-box">
      <div style="font-size: 14px; color: #94a3b8;">Applications this week</div>
      <div style="font-size: 36px; font-weight: 800; color: #4f7cff;">{total}</div>
    </div>
    <p><a href="''' + settings.FRONTEND_URL + '''/dashboard.html" class="btn">View Full Dashboard</a></p>
    '''}
    }
    
    result = []
    for t_id, info in defaults.items():
        result.append({
            "id": t_id,
            "name": info["name"],
            "content": templates.get(t_id, info["content"])
        })
        
    return {"templates": result}

async def update_email_template(template_id: str, content: str) -> dict:
    """Update an email template."""
    db = get_db()
    await db.email_templates.update_one(
        {"template_id": template_id},
        {"$set": {"content": content, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    return {"message": "Template updated"}


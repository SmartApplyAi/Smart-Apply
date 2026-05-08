"""
Email service using Brevo (Sendinblue) API.
Handles all transactional emails: verification, password reset, alerts, etc.
"""

import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from config import settings
from loguru import logger
from typing import Optional
import asyncio

import threading
# Initialize API instance lazily to handle dynamic key updates
_api_instance: Optional[sib_api_v3_sdk.TransactionalEmailsApi] = None
_api_lock = threading.Lock()

def get_brevo_api():
    global _api_instance
    with _api_lock:
        if _api_instance is None or _api_instance.api_client.configuration.api_key.get('api-key') != settings.BREVO_API_KEY:
            configuration = sib_api_v3_sdk.Configuration()
            configuration.api_key['api-key'] = settings.BREVO_API_KEY
            _api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))
            if not settings.BREVO_API_KEY:
                logger.warning("Brevo API key is not configured. Emails will fail.")
        return _api_instance

async def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
) -> bool:
    """Send a transactional email via Brevo."""
    def _execute():
        email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email, "name": to_name or to_email}],
            sender={
                "email": settings.BREVO_SENDER_EMAIL,
                "name": settings.BREVO_SENDER_NAME,
            },
            subject=subject,
            html_content=html_content,
        )
        api = get_brevo_api()
        api.send_transac_email(email)

    try:
        await asyncio.to_thread(_execute)
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except ApiException as e:
        logger.error(f"Brevo API error sending to {to_email}: {e}")
        return False
    except Exception as e:
        logger.error(f"Email send failed for {to_email}: {e}")
        return False


# ── Email Templates ─────────────────────────────────────────────────────────

_BASE_STYLE = """
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #070b14; -webkit-font-smoothing: antialiased; }
  .container { max-width: 540px; margin: 40px auto; background: #121826; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 24px 48px rgba(0,0,0,0.4); }
  .header { padding: 40px 40px 32px; text-align: center; }
  .header h1 { color: #f1f5f9; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .header .logo { color: #fff; font-size: 28px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.05em; }
  .header .logo span { color: #4f7cff; }
  .body { padding: 0 40px 40px; color: #94a3b8; line-height: 1.7; font-size: 15px; }
  .body h2 { color: #f1f5f9; margin-top: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .pin-box { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(79, 124, 255, 0.3); border-radius: 16px; padding: 24px; text-align: center; margin: 28px 0; }
  .pin-code { font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #4f7cff; font-family: 'Inter', monospace; margin-left: 12px; }
  .btn { display: inline-block; background: #4f7cff; color: #fff !important; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 24px 0; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 4px 12px rgba(79, 124, 255, 0.3); }
  .footer { padding: 24px 40px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.05); background: rgba(0,0,0,0.2); }
  .muted { color: #64748b; font-size: 14px; }
</style>
"""

_HEADER_HTML = """
<div class="header">
  <div class="logo">Smart<span>Apply</span></div>
  <h1>{title}</h1>
</div>
"""

_FOOTER_HTML = """
<div class="footer">
  <p>© 2024 SmartApply. All rights reserved.</p>
  <p class="muted">This is an automated message. Please do not reply.</p>
</div>
"""


async def get_template(template_id: str, default_content: str) -> str:
    """Fetch an email template from the DB, or return the default if not found."""
    try:
        from database import get_db
        db = get_db()
        doc = await db.email_templates.find_one({"template_id": template_id})
        if doc and "content" in doc:
            return doc["content"]
    except Exception as e:
        logger.error(f"Error fetching email template {template_id}: {e}")
    return default_content

async def wrap_template(title: str, body_html: str) -> str:
    base_style = await get_template("global_style", _BASE_STYLE)
    header_html = await get_template("global_header", _HEADER_HTML)
    footer_html = await get_template("global_footer", _FOOTER_HTML)
    
    return f"""<!DOCTYPE html><html><head>{base_style}</head><body>
<div class="container">
  {header_html.format(title=title)}
  <div class="body">{body_html}</div>
  {footer_html}
</div></body></html>"""


# ── Public Email Functions ──────────────────────────────────────────────────

async def send_verification_email(email: str, pin: str, name: str = "") -> bool:
    """Send a 6-digit email verification PIN."""
    default_body = """
    <h2>Verify your email</h2>
    <p>Hi {name},</p>
    <p>Thanks for signing up! Enter this code to verify your email address:</p>
    <div class="pin-box">
      <div class="pin-code">{pin}</div>
    </div>
    <p class="muted">This code expires in 15 minutes. If you didn't create an account, ignore this email.</p>
    """
    body_template = await get_template("verification_email", default_body)
    display_name = name if name else 'User'
    body = body_template.replace("{name}", display_name).replace("{pin}", pin)
    
    html_content = await wrap_template("Email Verification", body)
    return await send_email(email, name, "Verify your email — SmartApply", html_content)


async def send_password_reset_email(email: str, reset_url: str, name: str = "") -> bool:
    """Send a password reset link."""
    default_body = f"""
    <h2>Reset your password</h2>
    <p>Hi {{name}},</p>
    <p>We received a request to reset your password. Click the button below to set a new one:</p>
    <div style="text-align: center;">
      <a href="{{reset_url}}" class="btn">Reset Password</a>
    </div>
    <p class="muted">This link expires in {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes. If you didn't request this, ignore this email.</p>
    <p class="muted" style="word-break: break-all;">Or copy this URL: {{reset_url}}</p>
    """
    body_template = await get_template("password_reset", default_body)
    display_name = name if name else 'User'
    body = body_template.replace("{name}", display_name).replace("{reset_url}", reset_url)
    
    html_content = await wrap_template("Password Reset", body)
    return await send_email(email, name, "Reset your password — SmartApply", html_content)


async def send_application_alert(email: str, job_title: str, company: str, status: str, name: str = "") -> bool:
    """Send a job application status alert."""
    default_body = f"""
    <h2>Application Update</h2>
    <p>Hi {{name}},</p>
    <p>Your application status has been updated:</p>
    <div class="pin-box" style="border-color: {{color}};">
      <div style="font-size: 14px; color: #94a3b8; margin-bottom: 4px;">{{company}}</div>
      <div style="font-size: 18px; font-weight: 700; color: #f1f5f9;">{{job_title}}</div>
      <div style="font-size: 16px; font-weight: 600; color: {{color}}; margin-top: 8px;">Status: {{status}}</div>
    </div>
    <p><a href="{settings.FRONTEND_URL}/dashboard" class="btn">View Dashboard</a></p>
    """
    body_template = await get_template("application_alert", default_body)
    display_name = name if name else 'User'
    color = "#22c55e" if status in ("Applied", "submitted") else "#ef4444" if status in ("Failed", "failed") else "#94a3b8"
    body = body_template.replace("{name}", display_name).replace("{company}", company).replace("{job_title}", job_title).replace("{status}", status).replace("{color}", color)
    
    html_content = await wrap_template("Application Alert", body)
    return await send_email(email, name, f"Application Update: {job_title} — SmartApply", html_content)


async def send_automation_summary(
    email: str, total: int, applied: int, failed: int, skipped: int, name: str = ""
) -> bool:
    """Send an automation run summary."""
    default_body = f"""
    <h2>Automation Run Complete</h2>
    <p>Hi {{name}},</p>
    <p>Your automation session has finished. Here's a summary:</p>
    <div class="pin-box">
      <div style="display: flex; justify-content: space-around; text-align: center;">
        <div><div style="font-size: 28px; font-weight: 800; color: #f1f5f9;">{{total}}</div><div class="muted">Total</div></div>
        <div><div style="font-size: 28px; font-weight: 800; color: #22c55e;">{{applied}}</div><div class="muted">Applied</div></div>
        <div><div style="font-size: 28px; font-weight: 800; color: #ef4444;">{{failed}}</div><div class="muted">Failed</div></div>
        <div><div style="font-size: 28px; font-weight: 800; color: #94a3b8;">{{skipped}}</div><div class="muted">Skipped</div></div>
      </div>
    </div>
    <p><a href="{settings.FRONTEND_URL}/dashboard" class="btn">View Details</a></p>
    """
    body_template = await get_template("automation_summary", default_body)
    display_name = name if name else 'User'
    body = body_template.replace("{name}", display_name).replace("{total}", str(total)).replace("{applied}", str(applied)).replace("{failed}", str(failed)).replace("{skipped}", str(skipped))
    
    html_content = await wrap_template("Automation Summary", body)
    return await send_email(email, name, "Automation Summary — SmartApply", html_content)


async def send_security_alert(email: str, event: str, ip: str = "", name: str = "") -> bool:
    """Send a security alert (login from new device, password change, etc.)."""
    default_body = f"""
    <h2>Security Alert</h2>
    <p>Hi {{name}},</p>
    <p>We detected the following security event on your account:</p>
    <div class="pin-box" style="border-color: #f59e0b;">
      <div style="font-size: 16px; font-weight: 600; color: #f59e0b;">{{event}}</div>
      <div class='muted' style='margin-top: 8px;'>IP: {{ip}}</div>
    </div>
    <p class="muted">If this wasn't you, please reset your password immediately.</p>
    <p><a href="{settings.FRONTEND_URL}/forgot-password" class="btn" style="background: #f59e0b;">Secure My Account</a></p>
    """
    body_template = await get_template("security_alert", default_body)
    display_name = name if name else 'User'
    body = body_template.replace("{name}", display_name).replace("{event}", event).replace("{ip}", ip)
    
    html_content = await wrap_template("Security Alert", body)
    return await send_email(email, name, "Security Alert — SmartApply", html_content)


async def send_weekly_digest(
    email: str, stats: dict, name: str = ""
) -> bool:
    """Send a weekly digest email with application stats."""
    default_body = f"""
    <h2>Your Weekly Summary</h2>
    <p>Hi {{name}},</p>
    <p>Here's what happened with your applications this week:</p>
    <div class="pin-box">
      <div style="font-size: 14px; color: #94a3b8;">Applications this week</div>
      <div style="font-size: 36px; font-weight: 800; color: #4f7cff;">{{total}}</div>
    </div>
    <p><a href="{settings.FRONTEND_URL}/dashboard" class="btn">View Full Dashboard</a></p>
    """
    body_template = await get_template("weekly_digest", default_body)
    display_name = name if name else 'User'
    body = body_template.replace("{name}", display_name).replace("{total}", str(stats.get('total', 0)))
    
    html_content = await wrap_template("Weekly Digest", body)
    return await send_email(email, name, "Weekly Digest — SmartApply", html_content)

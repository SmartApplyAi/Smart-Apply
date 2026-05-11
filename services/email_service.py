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

import time

# Simple in-memory cache for email templates (TTL: 5 minutes)
_template_cache = {}
_TEMPLATE_CACHE_TTL = 300  # seconds


async def get_template(template_id: str, default_content: str) -> str:
    """Fetch an email template from the DB (cached), or return the default if not found."""
    now = time.time()
    cached = _template_cache.get(template_id)
    if cached and (now - cached["ts"]) < _TEMPLATE_CACHE_TTL:
        return cached["content"]

    try:
        from database import get_db
        db = get_db()
        doc = await db.email_templates.find_one({"template_id": template_id})
        if doc and "content" in doc:
            _template_cache[template_id] = {"content": doc["content"], "ts": now}
            return doc["content"]
    except Exception as e:
        logger.error(f"Error fetching email template {template_id}: {e}")
    _template_cache[template_id] = {"content": default_content, "ts": now}
    return default_content

async def wrap_template(
    title: str,
    body_html: str,
    base_style: Optional[str] = None,
    header_html: Optional[str] = None,
    footer_html: Optional[str] = None
) -> str:
    """Wrap content in the standard email layout. Supports pre-fetched components for performance."""
    if base_style is None:
        base_style = await get_template("global_style", _BASE_STYLE)
    if header_html is None:
        header_html = await get_template("global_header", _HEADER_HTML)
    if footer_html is None:
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
    """Send a weekly digest email with applications sent, success rate, streak, top skill gap."""
    total = stats.get('total', 0)
    applied = stats.get('applied', 0)
    failed = stats.get('failed', 0)
    success_rate = stats.get('success_rate', 0)
    current_streak = stats.get('current_streak', 0)
    top_skill_gaps = stats.get('top_skill_gaps', [])

    # Build streak display
    streak_emoji = "🔥" if current_streak >= 3 else "📊"
    streak_color = "#f59e0b" if current_streak >= 3 else "#94a3b8"

    # Build skill gap pills
    skill_gap_html = ""
    if top_skill_gaps:
        pills = "".join([
            f'<span style="display: inline-block; background: rgba(239,68,68,0.1); color: #f87171; '
            f'padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; margin: 3px;">'
            f'{skill}</span>'
            for skill in top_skill_gaps[:5]
        ])
        skill_gap_html = f"""
        <div style="margin-top: 20px;">
          <div style="font-size: 14px; color: #94a3b8; margin-bottom: 8px;">Top Skill Gaps This Week</div>
          <div style="line-height: 2;">{pills}</div>
        </div>
        """

    default_body = f"""
    <h2>Your Weekly Summary</h2>
    <p>Hi {{name}},</p>
    <p>Here's what happened with your job search this week:</p>
    <div class="pin-box">
      <div style="display: flex; justify-content: space-around; text-align: center; flex-wrap: wrap;">
        <div style="min-width: 80px; margin: 8px;">
          <div style="font-size: 32px; font-weight: 800; color: #4f7cff;">{{total}}</div>
          <div class="muted" style="font-size: 13px;">Applications</div>
        </div>
        <div style="min-width: 80px; margin: 8px;">
          <div style="font-size: 32px; font-weight: 800; color: #22c55e;">{{success_rate}}%</div>
          <div class="muted" style="font-size: 13px;">Success Rate</div>
        </div>
        <div style="min-width: 80px; margin: 8px;">
          <div style="font-size: 32px; font-weight: 800; color: {streak_color};">{streak_emoji} {{streak}}</div>
          <div class="muted" style="font-size: 13px;">Day Streak</div>
        </div>
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-around; text-align: center;">
        <div>
          <div style="font-size: 20px; font-weight: 700; color: #22c55e;">{{applied}}</div>
          <div class="muted" style="font-size: 12px;">Applied</div>
        </div>
        <div>
          <div style="font-size: 20px; font-weight: 700; color: #ef4444;">{{failed}}</div>
          <div class="muted" style="font-size: 12px;">Failed</div>
        </div>
      </div>
      {{skill_gap_html}}
    </div>
    <p style="text-align: center;">
      <a href="{settings.FRONTEND_URL}/dashboard" class="btn">View Full Dashboard</a>
    </p>
    <p class="muted" style="text-align: center;">Keep the momentum going! Every application brings you closer to your dream job.</p>
    """
    body_template = await get_template("weekly_digest", default_body)
    display_name = name if name else 'User'
    body = (body_template
        .replace("{name}", display_name)
        .replace("{total}", str(total))
        .replace("{applied}", str(applied))
        .replace("{failed}", str(failed))
        .replace("{success_rate}", str(success_rate))
        .replace("{streak}", str(current_streak))
        .replace("{skill_gap_html}", skill_gap_html)
    )

    html_content = await wrap_template("Weekly Digest", body)
    return await send_email(email, name, "📊 Weekly Digest — SmartApply", html_content)


async def send_enhanced_automation_summary(
    email: str, total: int, applied: int, failed: int, skipped: int,
    top_matches: list = None, name: str = ""
) -> bool:
    """Send an enhanced automation summary with top 3 matched jobs."""
    # Build top matches HTML
    top_matches_html = ""
    if top_matches:
        rows = ""
        for i, match in enumerate(top_matches[:3]):
            score = match.get("match_score", 0)
            score_color = "#22c55e" if score >= 80 else "#f59e0b" if score >= 50 else "#ef4444"
            job_url = match.get("job_url", "#")
            rows += f"""
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 12px 8px; color: #f1f5f9; font-weight: 500;">{match.get('job_title', 'Unknown')}</td>
              <td style="padding: 12px 8px; color: #94a3b8;">{match.get('company', 'Unknown')}</td>
              <td style="padding: 12px 8px; text-align: center;">
                <span style="display: inline-block; background: {score_color}20; color: {score_color}; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 14px;">{score}%</span>
              </td>
              <td style="padding: 12px 8px; text-align: center;">
                <a href="{job_url}" style="color: #4f7cff; text-decoration: none; font-size: 13px;">View →</a>
              </td>
            </tr>"""
        top_matches_html = f"""
        <div style="margin: 24px 0;">
          <div style="font-size: 16px; font-weight: 600; color: #f1f5f9; margin-bottom: 12px;">🏆 Top 3 Best Matches</div>
          <table style="width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.02); border-radius: 12px; overflow: hidden;">
            <thead><tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
              <th style="padding: 10px 8px; text-align: left; color: #64748b; font-size: 12px; font-weight: 500; text-transform: uppercase;">Role</th>
              <th style="padding: 10px 8px; text-align: left; color: #64748b; font-size: 12px; font-weight: 500; text-transform: uppercase;">Company</th>
              <th style="padding: 10px 8px; text-align: center; color: #64748b; font-size: 12px; font-weight: 500; text-transform: uppercase;">Match</th>
              <th style="padding: 10px 8px; text-align: center; color: #64748b; font-size: 12px; font-weight: 500; text-transform: uppercase;">Link</th>
            </tr></thead>
            <tbody>{rows}</tbody>
          </table>
        </div>"""

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
    {{top_matches_html}}
    <p><a href="{settings.FRONTEND_URL}/dashboard" class="btn">View Details</a></p>
    """
    body_template = await get_template("enhanced_automation_summary", default_body)
    display_name = name if name else 'User'
    body = (body_template
        .replace("{name}", display_name)
        .replace("{total}", str(total))
        .replace("{applied}", str(applied))
        .replace("{failed}", str(failed))
        .replace("{skipped}", str(skipped))
        .replace("{top_matches_html}", top_matches_html)
    )

    html_content = await wrap_template("Automation Summary", body)
    return await send_email(email, name, "🚀 Automation Summary — SmartApply", html_content)


async def send_skill_gap_alert(
    email: str, missing_skills: list, name: str = ""
) -> bool:
    """Send a skill gap alert email with actionable learning suggestions."""
    skills_html = "".join([
        f'<span style="display: inline-block; background: rgba(239,68,68,0.1); color: #f87171; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; margin: 4px;">{skill}</span>'
        for skill in missing_skills[:10]
    ])

    default_body = f"""
    <h2>Skill Gap Detected</h2>
    <p>Hi {{name}},</p>
    <p>Based on your recent applications, we noticed some skills that could boost your match scores. These are skills frequently requested in jobs you applied to but not found in your profile:</p>
    <div class="pin-box" style="border-color: rgba(249, 158, 11, 0.3);">
      <div style="font-size: 14px; color: #94a3b8; margin-bottom: 12px;">Missing Skills</div>
      <div style="line-height: 2;">{{skills_html}}</div>
    </div>
    <p style="color: #94a3b8;">The good news? Most of these are learnable skills that can be picked up relatively quickly. Use our <strong>Skill Gap Analyzer</strong> to get a personalized learning roadmap.</p>
    <p style="text-align: center;">
      <a href="{settings.FRONTEND_URL}/skill-gap" class="btn" style="background: linear-gradient(135deg, #f59e0b, #f97316);">View Skill Gap Analyzer →</a>
    </p>
    <p class="muted">Bridging these gaps could significantly improve your match rate on future applications.</p>
    """
    body_template = await get_template("skill_gap_alert", default_body)
    display_name = name if name else 'User'
    body = body_template.replace("{name}", display_name).replace("{skills_html}", skills_html)

    html_content = await wrap_template("Skill Gap Alert", body)
    return await send_email(email, name, "📊 Skill Gap Alert — SmartApply", html_content)


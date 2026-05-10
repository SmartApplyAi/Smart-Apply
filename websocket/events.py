"""
WebSocket event type constants.
All real-time events sent through WebSockets use these typed identifiers.
"""

# ── Job Application Events ──────────────────────────────────────────────────
JOB_APPLIED = "JOB_APPLIED"
JOB_FAILED = "JOB_FAILED"
JOB_SKIPPED = "JOB_SKIPPED"

# ── Match Score Events ──────────────────────────────────────────────────────
MATCH_SCORE = "MATCH_SCORE"

# ── Skill Gap Events ───────────────────────────────────────────────────────
SKILL_GAP_ALERT = "SKILL_GAP_ALERT"

# ── Automation Events ───────────────────────────────────────────────────────
BOT_RUN_SUMMARY = "BOT_RUN_SUMMARY"
AUTOMATION_STARTED = "AUTOMATION_STARTED"
AUTOMATION_STOPPED = "AUTOMATION_STOPPED"
AUTOMATION_PROGRESS = "AUTOMATION_PROGRESS"

# ── System Events ───────────────────────────────────────────────────────────
NOTIFICATION = "NOTIFICATION"
USER_NOTIFICATION = "USER_NOTIFICATION"
FORCE_REAUTH = "FORCE_REAUTH"
SESSION_REVOKED = "SESSION_REVOKED"
CONNECTION_ACK = "CONNECTION_ACK"

# ── Heartbeat ───────────────────────────────────────────────────────────────
PING = "PING"
PONG = "PONG"

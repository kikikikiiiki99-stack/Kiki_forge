"""Admin digest email: a short summary of users, AI usage and suggested improvements, sent to
every admin by a platform cron (Mon 08:00, Fri 18:00, Sun 18:00 UTC — see .emergent/crons.yml).
Recipients and body come only from server-side data; nothing is caller-supplied."""

import asyncio
import hmac
import ipaddress
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from emergentintegrations.llm.chat import LlmChat, UserMessage

from db import db
from data import TIERS
from lib.ai_errors import friendly_ai_error
from routers.site import get_settings, list_items

logger = logging.getLogger("stockforge.digest")
router = APIRouter(prefix="/api/cron")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constant by design: survives deployment
MODEL = ("anthropic", "claude-sonnet-4-5-20250929")

# ---------- guardrail gate (Emergent managed email playbook, copied as-is) ----------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": os.environ["EMAIL_FROM_NAME"]}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if body.get("code") in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning("Email paused: %s: %s", body.get("code"), body.get("message", ""))
        else:
            logger.error("Email send failed: %s %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
    return resp.json().get("id")


# ---------- digest content ----------
async def digest_stats() -> dict:
    now = datetime.now(timezone.utc)
    week = (now - timedelta(days=7)).isoformat()
    per_tier = {t["id"]: 0 for t in TIERS}
    async for r in db.users.aggregate([{"$group": {"_id": "$tier", "n": {"$sum": 1}}}]):
        per_tier[r["_id"] or 1] = r["n"]
    return {
        "users": await db.users.count_documents({}),
        "new_users_7d": await db.users.count_documents({"created_at": {"$gte": week}}),
        "active_7d": len(await db.logins.distinct("user_id", {"t": {"$gte": week}})),
        "logins_7d": await db.logins.count_documents({"t": {"$gte": week}}),
        "paid_members": sum(n for t, n in per_tier.items() if t > 1),
        "ai_questions_7d": await db.chat.count_documents({"role": "user", "t": {"$gte": week}}),
        "ai_questions_total": await db.chat.count_documents({"role": "user"}),
        "agent_messages_7d": await db.agent_messages.count_documents({"role": "user", "t": {"$gte": week}}),
        "changes_7d": await db.admin_log.count_documents({"t": {"$gte": week}}),
    }


async def ai_suggestions(stats: dict) -> list[str]:
    s = await get_settings()
    items = await list_items()
    prompt = (f"StockForge weekly stats: {json.dumps(stats)}. Settings: site '{s.site_name}', banner live={s.banner_live}, "
              f"sections off: {[k for k, v in s.sections.items() if not v]}, featured items: {len(items)}.\n"
              "Give exactly 3 short, concrete improvement suggestions for the admin (max 22 words each). "
              "Return ONLY a JSON array of 3 strings.")
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"digest-{uuid.uuid4()}",
                   system_message="You are the StockForge admin analyst. Be specific and practical.").with_model(*MODEL)
    raw = await chat.send_message(UserMessage(text=prompt))
    m = re.search(r"\[.*\]", raw, re.S)
    return [str(x)[:200] for x in json.loads(m.group(0))][:3] if m else []


def render(site_name: str, stats: dict, tips: list[str], note: str) -> tuple[str, str]:
    rows = [("Total users", stats["users"]), ("New this week", stats["new_users_7d"]),
            ("Active this week", stats["active_7d"]), ("Paid members", stats["paid_members"]),
            ("AI questions (7d)", stats["ai_questions_7d"]), ("Admin changes (7d)", stats["changes_7d"])]
    cells = "".join(f'<tr><td style="padding:6px 0;color:#94a3b8">{escape(k)}</td>'
                    f'<td style="padding:6px 0;text-align:right;font-weight:bold;color:#0f172a">{v}</td></tr>' for k, v in rows)
    tip_html = "".join(f'<li style="margin:0 0 8px">{escape(t)}</li>' for t in tips) or \
        f'<li style="color:#94a3b8">{escape(note)}</li>'
    app_url = os.environ.get("APP_URL", "")
    link = (f'<p style="margin:20px 0 0"><a href="{escape(app_url)}" style="color:#0891b2">Open the admin control centre</a></p>'
            if app_url.startswith("https://") else "")
    html = (f'<table role="presentation" width="100%" style="background:#f1f5f9"><tr><td style="padding:24px">'
            f'<table role="presentation" width="560" align="center" style="background:#ffffff;border-radius:12px;'
            f'font-family:Arial,sans-serif;font-size:14px;color:#0f172a"><tr><td style="padding:28px">'
            f'<p style="margin:0;font-size:11px;letter-spacing:2px;color:#0891b2">ADMIN DIGEST</p>'
            f'<h1 style="margin:6px 0 18px;font-size:22px">{escape(site_name)} — this week</h1>'
            f'<table role="presentation" width="100%">{cells}</table>'
            f'<h2 style="margin:24px 0 10px;font-size:15px">Suggested improvements</h2><ul style="padding-left:18px;margin:0">{tip_html}</ul>'
            f'{link}<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Sent by {escape(site_name)} to its admins. '
            f'Suggestions are AI-generated; nothing was changed automatically.</p></td></tr></table></td></tr></table>')
    return f"{site_name} admin digest · {stats['active_7d']} active, {stats['ai_questions_7d']} AI questions", html


async def admin_recipients() -> list[str]:
    env = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    db_admins = {(u.get("email") or "").lower() async for u in db.users.find({"is_admin": True}, {"_id": 0, "email": 1})}
    # +clerk_test addresses are Clerk dev test accounts with no real inbox.
    return sorted(e for e in env | db_admins if "@" in e and "+clerk_test" not in e)


async def run_digest(run_id: str):
    try:
        stats = await digest_stats()
        tips, note = [], ""
        try:
            tips = await ai_suggestions(stats)
        except Exception as e:  # stats still go out when AI credits are out
            note = friendly_ai_error(e)
            logger.warning("digest suggestions skipped: %s", str(e)[:200])
        subject, html = render((await get_settings()).site_name, stats, tips, note or "No suggestions this time.")
        sent = []
        for to in await admin_recipients():
            try:
                await send_email(to=to, subject=subject, html=html)
                sent.append(to)
            except Exception as e:
                logger.error("digest to %s failed: %s", to, str(e)[:200])
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "done", "sent": len(sent),
                                                                     "finished_at": datetime.now(timezone.utc).isoformat()}})
    except Exception:
        logger.exception("digest run failed")
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "failed"}})


@router.post("/digest", status_code=202)
async def digest_webhook(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Unauthorized")
    try:
        env = await request.json()
    except Exception:
        env = None
    if env is not None and not isinstance(env, dict):
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("x-webhook-id") or (env or {}).get("run_id") or str(uuid.uuid4())
    res = await db.cron_runs.update_one({"run_id": run_id}, {"$setOnInsert": {
        "run_id": run_id, "kind": "digest", "status": "queued", "t": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    if res.upserted_id is None:
        return {"accepted": True, "duplicate": True}
    background.add_task(run_digest, run_id)
    return {"accepted": True, "run_id": run_id}

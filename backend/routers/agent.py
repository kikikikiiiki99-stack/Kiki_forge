"""Admin AI agent (Claude Sonnet 4.5). It answers and PROPOSES changes; nothing is applied
until an admin clicks Apply on the proposal card. It can't touch code — only settings and data."""

import json
import logging
import os
import re
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from db import db
from lib.ai_errors import friendly_ai_error, is_budget_error
from data import TIERS
from models.site import (SECTION_IDS, AgentChatIn, AgentMessage, FeaturedItemIn, FeaturedItemPatch, Proposal,
                         SiteSettingsUpdate, now_iso)
from routers.site import (create_item, delete_item, delete_user, get_settings, list_items, set_user_admin,
                          set_user_tier, update_item, update_settings)

logger = logging.getLogger("stockforge.agent")
MODEL = ("anthropic", "claude-sonnet-4-5-20250929")
DESTRUCTIVE = {"delete_item", "delete_user"}
BLOCK = re.compile(r"```proposals\s*(.*?)```", re.S)

SYSTEM = f"""You are the StockForge Admin Agent, an assistant inside the admin control centre of StockForge,
a trading-terminal web app. You help the admin understand the app's state, answer questions and suggest improvements.
You CANNOT edit code. You can only PROPOSE changes to site settings, featured items and users. The admin reviews
each proposal as a card and clicks Apply or Dismiss — so never claim a change is done.

Reply in concise plain text (short paragraphs or "- " bullets, no markdown headers). When you want to propose changes,
append ONE fenced block exactly like:
```proposals
[{{"kind": "...", "summary": "one-line human summary", "payload": {{...}}}}]
```
Allowed kinds and payloads:
- update_settings: any subset of {{site_name, tagline, brand_primary ("#RRGGBB" or "" for tier colours), brand_secondary,
  landing_headline, landing_sub, home_headline, home_sub, banner_enabled (bool), banner_text, banner_tone ("info"|"warning"|"alert"),
  banner_starts_at / banner_ends_at (UTC ISO like "2026-11-02T00:00:00Z", or "" for no limit),
  sections ({{id: bool}}, ids: {", ".join(SECTION_IDS)})}}
- create_item: {{sym, title, note, tone ("bull"|"bear"|"neutral"), link ("forecast"|"markets"|"none"), order (int), active (bool)}}
- update_item: {{id, ...fields to change}}
- delete_item: {{id}}
- set_user_tier: {{user_id, tier (1-10)}}
- set_user_admin: {{user_id, is_admin (bool)}}
- delete_user: {{user_id}}
Use only ids that appear in the context. Propose at most 5 changes per reply and only when useful or asked.
Tiers: {", ".join(f"T{t['id']} {t['name']}" for t in TIERS)}."""


async def _context() -> str:
    s = await get_settings()
    items = await list_items()
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "email": 1, "name": 1, "tier": 1, "is_admin": 1, "last_login": 1}) \
        .sort("last_login", -1).to_list(40)
    stats = {"users": await db.users.count_documents({}), "admins": await db.users.count_documents({"is_admin": True}),
             "ai_messages": await db.chat.count_documents({"role": "user"})}
    return ("CURRENT SITE SETTINGS:\n" + s.model_dump_json(exclude={"updated_at"}) +
            "\nFEATURED ITEMS:\n" + json.dumps([i.model_dump(exclude={"created_at"}) for i in items]) +
            "\nUSERS (most recent 40):\n" + json.dumps(users) + "\nSTATS: " + json.dumps(stats))


def parse_proposals(raw: str) -> tuple[str, List[Proposal]]:
    m = BLOCK.search(raw)
    text = BLOCK.sub("", raw).strip()
    if not m:
        return text, []
    try:
        data = json.loads(m.group(1).strip())
    except json.JSONDecodeError:
        logger.warning("agent proposals block was not valid JSON")
        return text, []
    out: List[Proposal] = []
    for p in (data if isinstance(data, list) else [])[:5]:
        try:
            prop = Proposal(kind=p.get("kind"), summary=str(p.get("summary") or p.get("kind"))[:300],
                            payload=p.get("payload") or {})
        except (ValidationError, AttributeError):
            continue
        prop.destructive = prop.kind in DESTRUCTIVE
        out.append(prop)
    return text, out


AG = "agent"


async def execute(p: Proposal, admin: dict):
    pl = dict(p.payload)
    try:
        if p.kind == "update_settings":
            return (await update_settings(SiteSettingsUpdate(**pl), admin, AG)).model_dump()
        if p.kind == "create_item":
            return (await create_item(FeaturedItemIn(**pl), admin, AG)).model_dump()
        if p.kind == "update_item":
            item_id = pl.pop("id", "")
            return (await update_item(item_id, FeaturedItemPatch(**pl), admin, AG)).model_dump()
        if p.kind == "delete_item":
            return await delete_item(pl.get("id", ""), admin, AG)
        if p.kind == "set_user_tier":
            return await set_user_tier(pl.get("user_id", ""), int(pl.get("tier", 0)), admin, AG)
        if p.kind == "set_user_admin":
            return await set_user_admin(pl.get("user_id", ""), bool(pl.get("is_admin")), admin, AG)
        if p.kind == "delete_user":
            return (await delete_user(pl.get("user_id", ""), admin, AG)).model_dump()
    except ValidationError as e:
        raise HTTPException(400, f"Invalid proposal: {e.errors()[0].get('msg', 'bad value')}")
    raise HTTPException(400, "Unknown proposal kind")


def build_agent_router(require_admin):
    router = APIRouter(prefix="/api/admin/agent")

    @router.get("/messages", response_model=List[AgentMessage])
    async def messages(_: dict = Depends(require_admin)):
        docs = await db.agent_messages.find({}, {"_id": 0}).sort("t", 1).to_list(200)
        return [AgentMessage(**d) for d in docs]

    @router.delete("/messages")
    async def clear(_: dict = Depends(require_admin)):
        await db.agent_messages.delete_many({})
        return {"ok": True}

    @router.post("/chat", response_model=AgentMessage)
    async def chat(body: AgentChatIn, admin: dict = Depends(require_admin)):
        history = await db.agent_messages.find({}, {"_id": 0}).sort("t", -1).to_list(10)
        transcript = "\n".join(f"{m['role'].upper()}: {m['text']}" for m in reversed(history))
        user_msg = AgentMessage(role="user", text=body.text)
        await db.agent_messages.insert_one(user_msg.model_dump())
        prompt = f"{await _context()}\n\nRecent conversation:\n{transcript or '(none)'}\n\nADMIN: {body.text}"
        llm = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"admin-agent-{uuid.uuid4()}",
                      system_message=SYSTEM).with_model(*MODEL)
        parts: List[str] = []
        try:
            async for ev in llm.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.warning("agent chat failed: %s", str(e)[:300])
            # Credits exhausted is a billing state the admin must fix, not a server fault.
            raise HTTPException(402 if is_budget_error(e) else 503, friendly_ai_error(e))
        text, proposals = parse_proposals("".join(parts))
        ai_msg = AgentMessage(role="ai", text=text or "Here are my suggestions.", proposals=proposals)
        await db.agent_messages.insert_one(ai_msg.model_dump())
        return ai_msg

    async def _find(pid: str) -> tuple[dict, Proposal]:
        doc = await db.agent_messages.find_one({"proposals.id": pid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Proposal not found")
        p = next(Proposal(**x) for x in doc["proposals"] if x["id"] == pid)
        if p.status != "proposed" and p.status != "failed":
            raise HTTPException(409, f"Proposal already {p.status}")
        return doc, p

    async def _set(pid: str, status: str, error=None):
        await db.agent_messages.update_one({"proposals.id": pid},
                                           {"$set": {"proposals.$.status": status, "proposals.$.error": error}})

    @router.post("/proposals/{pid}/apply", response_model=Proposal)
    async def apply(pid: str, admin: dict = Depends(require_admin)):
        _, p = await _find(pid)
        try:
            await execute(p, admin)
        except HTTPException as e:
            await _set(pid, "failed", str(e.detail))
            raise
        await _set(pid, "applied")
        return p.model_copy(update={"status": "applied", "error": None})

    @router.post("/proposals/{pid}/dismiss", response_model=Proposal)
    async def dismiss(pid: str, _: dict = Depends(require_admin)):
        _, p = await _find(pid)
        await _set(pid, "dismissed")
        return p.model_copy(update={"status": "dismissed"})

    return router

"""Site settings (public read, admin write), featured items CRUD, user deletion and the
change history. The action helpers here are shared with the AI agent's Apply button;
every one of them writes an admin_log entry (who, when, what, admin vs agent)."""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models.site import (SECTION_IDS, AdminUserDeleteOut, ChangeEntry, FeaturedItem, FeaturedItemIn,
                         FeaturedItemPatch, SitePublic, SiteSettings, SiteSettingsUpdate, now_iso)
from data import TIERS

SITE_ID = "site"
LABELS = {"site_name": "site name", "tagline": "tagline", "brand_primary": "primary colour",
          "brand_secondary": "secondary colour", "landing_headline": "landing headline", "landing_sub": "landing intro",
          "home_headline": "feed headline", "home_sub": "feed subtitle", "banner_enabled": "banner on/off",
          "banner_text": "banner message", "banner_tone": "banner tone", "banner_starts_at": "banner start",
          "banner_ends_at": "banner end", "sections": "app sections"}


async def log_change(actor: dict, summary: str, source: str = "admin", action: str = ""):
    await db.admin_log.insert_one({"t": now_iso(), "by": actor.get("user_id", ""), "by_email": actor.get("email", ""),
                                   "source": source, "summary": summary[:300], "action": action or summary[:80]})


def _parse(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def banner_live(s: SiteSettings, now: Optional[datetime] = None) -> bool:
    if not (s.banner_enabled and s.banner_text.strip()):
        return False
    now = now or datetime.now(timezone.utc)
    start, end = _parse(s.banner_starts_at), _parse(s.banner_ends_at)
    return (start is None or now >= start) and (end is None or now < end)


async def get_settings() -> SiteSettings:
    doc = await db.site_settings.find_one({"id": SITE_ID}, {"_id": 0, "id": 0}) or {}
    s = SiteSettings(**doc)
    s.sections = {k: bool(s.sections.get(k, True)) for k in SECTION_IDS}
    s.banner_live = banner_live(s)
    return s


async def update_settings(patch: SiteSettingsUpdate, actor: dict, source: str = "admin") -> SiteSettings:
    upd = patch.model_dump(exclude_none=True)
    before = await get_settings()
    if "sections" in upd:
        unknown = set(upd["sections"]) - set(SECTION_IDS)
        if unknown:
            raise HTTPException(400, f"Unknown sections: {', '.join(sorted(unknown))}")
        upd["sections"] = {**before.sections, **{k: bool(v) for k, v in upd["sections"].items()}}
    start = _parse(upd.get("banner_starts_at", before.banner_starts_at))
    end = _parse(upd.get("banner_ends_at", before.banner_ends_at))
    if start and end and end <= start:
        raise HTTPException(400, "Banner end must be after its start")
    changed = [k for k, v in upd.items() if getattr(before, k) != v]
    if not changed:
        raise HTTPException(400, "Nothing to change")
    upd["updated_at"] = now_iso()
    await db.site_settings.update_one({"id": SITE_ID}, {"$set": upd}, upsert=True)
    await log_change(actor, "Updated " + ", ".join(LABELS.get(k, k) for k in changed), source, "update_settings")
    return await get_settings()


async def list_items(active_only: bool = False) -> List[FeaturedItem]:
    q = {"active": True} if active_only else {}
    docs = await db.featured_items.find(q, {"_id": 0}).sort([("order", 1), ("created_at", 1)]).to_list(200)
    return [FeaturedItem(**d) for d in docs]


async def create_item(body: FeaturedItemIn, actor: dict, source: str = "admin") -> FeaturedItem:
    item = FeaturedItem(**{**body.model_dump(), "sym": body.sym.strip().upper()})
    await db.featured_items.insert_one(item.model_dump())
    await log_change(actor, f"Added featured item {item.sym} · {item.title}", source, "create_item")
    return item


async def update_item(item_id: str, patch: FeaturedItemPatch, actor: dict, source: str = "admin") -> FeaturedItem:
    upd = patch.model_dump(exclude_none=True)
    if "sym" in upd:
        upd["sym"] = upd["sym"].strip().upper()
    if not upd:
        raise HTTPException(400, "Nothing to change")
    res = await db.featured_items.update_one({"id": item_id}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "Item not found")
    item = FeaturedItem(**await db.featured_items.find_one({"id": item_id}, {"_id": 0}))
    await log_change(actor, f"Edited featured item {item.sym} ({', '.join(upd)})", source, "update_item")
    return item


async def delete_item(item_id: str, actor: dict, source: str = "admin") -> dict:
    doc = await db.featured_items.find_one_and_delete({"id": item_id}, {"_id": 0, "sym": 1, "title": 1})
    if not doc:
        raise HTTPException(404, "Item not found")
    await log_change(actor, f"Deleted featured item {doc['sym']} · {doc['title']}", source, "delete_item")
    return {"id": item_id, "deleted": True}


async def _who(user_id: str) -> str:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1})
    return (u or {}).get("email") or (u or {}).get("name") or user_id


async def set_user_tier(user_id: str, tier: int, actor: dict, source: str = "admin") -> dict:
    if not 1 <= tier <= len(TIERS):
        raise HTTPException(400, "Tier must be 1–10")
    res = await db.users.update_one({"user_id": user_id}, {"$set": {"tier": tier, "theme": tier, "tier_expires_at": None}})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    await log_change(actor, f"Set {await _who(user_id)} to T{tier} {TIERS[tier - 1]['name']}", source, f"set_tier:{user_id}:{tier}")
    return {"user_id": user_id, "tier": tier}


async def set_user_admin(user_id: str, is_admin: bool, actor: dict, source: str = "admin") -> dict:
    if not is_admin and await db.users.count_documents({"is_admin": True}) <= 1:
        raise HTTPException(409, "Keep at least one admin")
    res = await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": is_admin}})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    await log_change(actor, f"{'Made' if is_admin else 'Removed'} {await _who(user_id)} {'an admin' if is_admin else 'as admin'}",
                     source, f"set_admin:{user_id}:{is_admin}")
    return {"user_id": user_id, "is_admin": is_admin}


async def delete_user(user_id: str, actor: dict, source: str = "admin") -> AdminUserDeleteOut:
    if user_id == actor.get("user_id"):
        raise HTTPException(409, "You can't delete your own account")
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "is_admin": 1, "email": 1})
    if not doc:
        raise HTTPException(404, "User not found")
    if doc.get("is_admin") and await db.users.count_documents({"is_admin": True}) <= 1:
        raise HTTPException(409, "Keep at least one admin")
    await db.users.delete_one({"user_id": user_id})
    await db.chat.delete_many({"user_id": user_id})
    await log_change(actor, f"Deleted user {doc.get('email') or user_id}", source, f"delete_user:{user_id}")
    return AdminUserDeleteOut(user_id=user_id, deleted=True)


def _legacy_summary(action: str) -> str:
    """Older admin_log rows only carry an action code; turn them into readable text."""
    head, _, rest = action.partition(":")
    parts = rest.split(":")
    if head == "set_tier" and len(parts) == 2:
        return f"Set user {parts[0]} to T{parts[1]}"
    if head == "set_admin" and len(parts) == 2:
        return f"Changed admin role of {parts[0]} to {parts[1]}"
    if head == "delete_user":
        return f"Deleted user {rest}"
    if head == "admin_unlocked":
        return "Unlocked admin with code"
    if head.startswith("agent_apply"):
        return f"Applied agent proposal ({rest})"
    return action.replace("_", " ")


def build_site_router(require_admin):
    router = APIRouter(prefix="/api")

    @router.get("/site", response_model=SitePublic)
    async def public_site():
        return SitePublic(settings=await get_settings(), items=await list_items(active_only=True))

    @router.get("/admin/site", response_model=SiteSettings)
    async def admin_site(_: dict = Depends(require_admin)):
        return await get_settings()

    @router.put("/admin/site", response_model=SiteSettings)
    async def put_site(body: SiteSettingsUpdate, admin: dict = Depends(require_admin)):
        return await update_settings(body, admin)

    @router.get("/admin/items", response_model=List[FeaturedItem])
    async def admin_items(_: dict = Depends(require_admin)):
        return await list_items()

    @router.post("/admin/items", response_model=FeaturedItem)
    async def post_item(body: FeaturedItemIn, admin: dict = Depends(require_admin)):
        return await create_item(body, admin)

    @router.put("/admin/items/{item_id}", response_model=FeaturedItem)
    async def put_item(item_id: str, body: FeaturedItemPatch, admin: dict = Depends(require_admin)):
        return await update_item(item_id, body, admin)

    @router.delete("/admin/items/{item_id}")
    async def del_item(item_id: str, admin: dict = Depends(require_admin)):
        return await delete_item(item_id, admin)

    @router.delete("/admin/users/{user_id}", response_model=AdminUserDeleteOut)
    async def del_user(user_id: str, admin: dict = Depends(require_admin)):
        return await delete_user(user_id, admin)

    @router.get("/admin/history", response_model=List[ChangeEntry])
    async def history(_: dict = Depends(require_admin)):
        rows = await db.admin_log.find({}, {"_id": 0}).sort("t", -1).to_list(300)
        emails = {u["user_id"]: u.get("email", "") async for u in
                  db.users.find({"user_id": {"$in": list({r.get("by", "") for r in rows})}}, {"_id": 0, "user_id": 1, "email": 1})}
        return [ChangeEntry(t=r.get("t", ""), by=r.get("by", ""), by_email=r.get("by_email") or emails.get(r.get("by", ""), ""),
                            source=r.get("source", "agent" if str(r.get("action", "")).startswith("agent_") else "admin"),
                            summary=r.get("summary") or _legacy_summary(str(r.get("action", ""))))
                for r in rows if not str(r.get("action", "")).startswith("agent_apply")]

    return router

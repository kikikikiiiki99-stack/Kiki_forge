import hmac
import io
import os
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from data import TIERS
from db import db

APP_ROOT = Path(__file__).resolve().parent.parent
SKIP_FILES = {".tok.json"}
SKIP_DIRS = {"memory", "node_modules", ".git", "__pycache__", "build", ".ruff_cache", ".emergent", "test_reports", ".cache"}
MAX_FAILS = 5
LOCK_MINUTES = 15


class CodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    passphrase: str = Field(min_length=1, max_length=64)


class TierIn(BaseModel):
    tier: int = Field(ge=1, le=10)


class AdminIn(BaseModel):
    is_admin: bool


def _zip_source() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(APP_ROOT):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f.startswith(".env") or f in SKIP_FILES or f.endswith((".pyc", ".log")):
                    continue
                p = Path(root) / f
                z.write(p, Path("stockforge") / p.relative_to(APP_ROOT))
        z.writestr("stockforge/SECRETS_README.txt",
                   "Secrets (.env files) are NOT included.\n"
                   "backend/.env needs: MONGO_URL, DB_NAME, CORS_ORIGINS, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,\n"
                   "EMERGENT_LLM_KEY, ADMIN_CODE, ADMIN_PASSPHRASE, ADMIN_EMAIL\n"
                   "frontend/.env needs: REACT_APP_BACKEND_URL\n")
    return buf.getvalue()


def make_require_admin(current):
    async def require_admin(me: dict = Depends(current)) -> dict:
        if not me.get("is_admin"):
            raise HTTPException(403, "Admin only")
        return me
    return require_admin


def build_admin_router(current, require_admin):
    router = APIRouter(prefix="/api/admin")

    @router.post("/unlock")
    async def unlock(body: CodeIn, me: dict = Depends(current)):
        now = datetime.now(timezone.utc)
        lock = me.get("admin_lock_until")
        if lock and datetime.fromisoformat(lock) > now:
            raise HTTPException(429, "Too many wrong codes. Try again later.")
        expected = os.environ.get("ADMIN_CODE", "")
        phrase = os.environ.get("ADMIN_PASSPHRASE", "")
        code_ok = bool(expected) and hmac.compare_digest(body.code.strip(), expected)
        phrase_ok = bool(phrase) and hmac.compare_digest(body.passphrase.strip().lower(), phrase.lower())
        if not (code_ok and phrase_ok):
            fails = me.get("admin_fails", 0) + 1
            upd = {"admin_fails": 0, "admin_lock_until": (now + timedelta(minutes=LOCK_MINUTES)).isoformat()} if fails >= MAX_FAILS else {"admin_fails": fails}
            await db.users.update_one({"user_id": me["user_id"]}, {"$set": upd})
            raise HTTPException(401, "Wrong code or passphrase")
        await db.users.update_one({"user_id": me["user_id"]}, {"$set": {"is_admin": True, "admin_fails": 0, "admin_lock_until": None}})
        await db.admin_log.insert_one({"t": now.isoformat(), "by": me["user_id"], "action": "admin_unlocked"})
        return {"is_admin": True}

    @router.get("/stats")
    async def stats(_: dict = Depends(require_admin)):
        now = datetime.now(timezone.utc)
        day, week = (now - timedelta(days=1)).isoformat(), (now - timedelta(days=7)).isoformat()
        per_tier = {t["id"]: 0 for t in TIERS}
        async for r in db.users.aggregate([{"$group": {"_id": "$tier", "n": {"$sum": 1}}}]):
            per_tier[r["_id"] or 1] = r["n"]
        paid = await db.payment_transactions.find({"payment_status": "paid"}, {"_id": 0, "amount": 1}).to_list(10000)
        btc_paid = await db.btc_payments.find({"status": {"$in": ["confirmed", "approved"]}}, {"_id": 0, "usd_cents": 1}).to_list(10000)
        orders = await db.users.aggregate([{"$project": {"n": {"$size": {"$ifNull": ["$orders", []]}}}},
                                           {"$group": {"_id": None, "n": {"$sum": "$n"}}}]).to_list(1)
        return {
            "users": await db.users.count_documents({}),
            "admins": await db.users.count_documents({"is_admin": True}),
            "logins_24h": await db.logins.count_documents({"t": {"$gte": day}}),
            "logins_7d": await db.logins.count_documents({"t": {"$gte": week}}),
            "active_24h": len(await db.logins.distinct("user_id", {"t": {"$gte": day}})),
            "per_tier": [{"tier": t["id"], "name": t["name"], "users": per_tier[t["id"]]} for t in TIERS],
            "revenue": sum(p.get("amount", 0) for p in paid) + sum(p["usd_cents"] for p in btc_paid) / 100,
            "payments": len(paid) + len(btc_paid),
            "checkouts_started": await db.payment_transactions.count_documents({}) + await db.btc_payments.count_documents({}),
            "btc_pending": await db.btc_payments.count_documents({"status": {"$in": ["pending", "seen"]}, "txid": {"$type": "string"}}),
            "ai_messages": await db.chat.count_documents({"role": "user"}),
            "paper_orders": orders[0]["n"] if orders else 0,
        }

    @router.get("/users")
    async def users(_: dict = Depends(require_admin)):
        proj = {"_id": 0, "user_id": 1, "email": 1, "name": 1, "tier": 1, "is_admin": 1, "created_at": 1, "last_login": 1, "cash": 1, "tier_expires_at": 1}
        return await db.users.find({}, proj).sort("last_login", -1).to_list(1000)

    @router.get("/logins")
    async def logins(_: dict = Depends(require_admin)):
        return await db.logins.find({}, {"_id": 0}).sort("t", -1).to_list(100)

    @router.get("/payments")
    async def payments(_: dict = Depends(require_admin)):
        proj = {"_id": 0, "session_id": 1, "user_id": 1, "tier": 1, "amount": 1, "currency": 1, "payment_status": 1, "created_at": 1}
        return await db.payment_transactions.find({}, proj).sort("created_at", -1).to_list(100)

    @router.patch("/users/{user_id}/tier")
    async def set_tier(user_id: str, body: TierIn, admin: dict = Depends(require_admin)):
        from routers.site import set_user_tier
        return await set_user_tier(user_id, body.tier, admin)

    @router.patch("/users/{user_id}/admin")
    async def set_admin(user_id: str, body: AdminIn, admin: dict = Depends(require_admin)):
        from routers.site import set_user_admin
        return await set_user_admin(user_id, body.is_admin, admin)

    @router.get("/download")
    async def download(_: dict = Depends(require_admin)):
        data = _zip_source()
        name = f"stockforge-source-{datetime.now(timezone.utc):%Y%m%d}.zip"
        return StreamingResponse(io.BytesIO(data), media_type="application/zip",
                                 headers={"Content-Disposition": f'attachment; filename="{name}"'})

    return router

"""Bitcoin tier checkout (non-custodial): admin address, live BTC quotes, on-chain verification,
manual approve/reject, 30-day periods, and the admin tier editor."""
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import ROUND_UP, Decimal
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from data import TIERS
from db import db
from features import notify, table_response
from markets import get_markets

CHAIN_APIS = ["https://mempool.space/api", "https://blockstream.info/api"]
PRICE_API = "https://api.coinbase.com/v2/prices/BTC-USD/spot"
SAT = Decimal(100_000_000)
QUOTE_MINUTES = 15
PERIOD_DAYS = 30
ADDR_RE = re.compile(r"^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$")
OPEN = ["pending", "seen", "expired"]


def now():
    return datetime.now(timezone.utc)


def price_label(cents):
    if cents <= 0:
        return "$0"
    return f"${cents / 100:,.0f}/mo" if cents % 100 == 0 else f"${cents / 100:,.2f}/mo"


async def get_tiers():
    ov = ((await db.settings.find_one({"_id": "tiers"})) or {}).get("overrides", {})
    out = []
    for t in TIERS:
        o = ov.get(str(t["id"]), {})
        cents = 0 if t["id"] == 1 else o.get("amount_cents", t["amount_cents"])
        out.append({**t, "name": o.get("name", t["name"]), "amount_cents": cents, "price": price_label(cents)})
    return out


async def ensure_billing_indexes():
    await db.btc_payments.create_index("id", unique=True)
    await db.btc_payments.create_index("txid", unique=True, partialFilterExpression={"txid": {"$type": "string"}})
    await db.btc_payments.create_index([("user_id", 1), ("created_at", -1)])
    await db.btc_payments.create_index([("status", 1), ("created_at", -1)])


async def btc_address():
    return ((await db.settings.find_one({"_id": "billing"})) or {}).get("btc_address")


async def btc_usd():
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(PRICE_API)
            r.raise_for_status()
            return Decimal(r.json()["data"]["amount"]), "Coinbase"
    except Exception:
        m = await get_markets()
        btc = next((x for x in m.get("crypto", []) if x["sym"] == "BTC" and x.get("price")), None)
        if btc:
            return Decimal(str(btc["price"])), "market feed"
    raise HTTPException(503, "Live BTC price unavailable — try again in a moment")


async def fetch_tx(txid):
    async with httpx.AsyncClient(timeout=10) as c:
        for base in CHAIN_APIS:
            try:
                r = await c.get(f"{base}/tx/{txid}")
                if r.status_code in (400, 404):
                    return None
                r.raise_for_status()
                return r.json()
            except httpx.HTTPError:
                continue
    raise HTTPException(503, "Blockchain explorers unreachable — try again shortly")


async def grant(p):
    u = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "tier": 1, "tier_expires_at": 1}) or {}
    start = now()
    if u.get("tier") == p["tier"] and u.get("tier_expires_at") and u["tier_expires_at"] > start.isoformat():
        start = datetime.fromisoformat(u["tier_expires_at"])
    ends = (start + timedelta(days=PERIOD_DAYS)).isoformat()
    await db.users.update_one({"user_id": p["user_id"]}, {"$set": {"tier": p["tier"], "theme": p["tier"], "tier_expires_at": ends}})
    await db.btc_payments.update_one({"id": p["id"]}, {"$set": {"period_ends_at": ends}})
    await notify(p["user_id"], "payment", f"T{p['tier']} {p['tier_name']} unlocked",
                 f"Paid in Bitcoin · active until {ends[:10]}")
    return ends


async def check_payment(p, txid):
    """Verify txid on-chain against the payment's address + amount and update status."""
    txid = txid.lower()
    if p.get("txid") and p["txid"] != txid:
        raise HTTPException(409, "This checkout is already linked to a different transaction")
    tx = await fetch_tx(txid)
    if tx is None:
        raise HTTPException(404, "Transaction not found on the blockchain yet — check the ID or wait a minute")
    received = sum(v.get("value", 0) for v in tx.get("vout", []) if v.get("scriptpubkey_address") == p["btc_address"])
    if received == 0:
        raise HTTPException(400, "That transaction does not pay the StockForge receiving address")
    confirmed = bool((tx.get("status") or {}).get("confirmed"))
    enough = received >= p["amount_sats"]
    status = "confirmed" if confirmed and enough else "seen"
    upd = {"txid": txid, "received_sats": received, "confirmations": 1 if confirmed else 0, "status": status,
           "underpaid": not enough, "verified_at": now().isoformat()}
    try:
        res = await db.btc_payments.update_one({"id": p["id"], "status": {"$in": OPEN}}, {"$set": upd})
    except DuplicateKeyError:
        raise HTTPException(409, "That transaction was already used for another payment")
    p = {**p, **upd}
    if status == "confirmed" and res.modified_count:
        p["period_ends_at"] = await grant(p)
    return p


class QuoteIn(BaseModel):
    tier: int = Field(ge=2, le=10)


class TxIn(BaseModel):
    txid: str = Field(pattern=r"^[0-9a-fA-F]{64}$")


class AddressIn(BaseModel):
    btc_address: str = Field(min_length=14, max_length=90)


class TierEdit(BaseModel):
    id: int = Field(ge=1, le=10)
    name: str = Field(min_length=1, max_length=24)
    amount_cents: int = Field(ge=0, le=10_000_000)


class TiersIn(BaseModel):
    tiers: List[TierEdit]


class RejectIn(BaseModel):
    note: Optional[str] = Field(default="", max_length=200)


def build_billing_router(current, require_admin):
    r = APIRouter(prefix="/api")

    @r.get("/billing/status")
    async def billing_status():
        return {"enabled": bool(await btc_address()), "quote_minutes": QUOTE_MINUTES, "period_days": PERIOD_DAYS}

    @r.post("/billing/quote")
    async def quote(body: QuoteIn, me: dict = Depends(current)):
        t = next((x for x in await get_tiers() if x["id"] == body.tier), None)
        if not t or t["amount_cents"] <= 0:
            raise HTTPException(400, "Invalid tier")
        if body.tier < me["tier"]:
            raise HTTPException(400, "You already have a higher tier")
        addr = await btc_address()
        if not addr:
            raise HTTPException(503, "Bitcoin payments aren't set up yet — the admin hasn't added a receiving address")
        px, src = await btc_usd()
        sats = int((Decimal(t["amount_cents"]) / 100 / px * SAT).to_integral_value(rounding=ROUND_UP))
        ts = now()
        doc = {"id": str(uuid.uuid4()), "user_id": me["user_id"], "email": me.get("email", ""), "tier": t["id"],
               "tier_name": t["name"], "usd_cents": t["amount_cents"], "btc_usd": str(px), "price_source": src,
               "amount_sats": sats, "amount_btc": f"{Decimal(sats) / SAT:.8f}", "btc_address": addr, "status": "pending",
               "txid": None, "received_sats": None, "confirmations": 0, "underpaid": False,
               "quote_expires_at": (ts + timedelta(minutes=QUOTE_MINUTES)).isoformat(), "created_at": ts.isoformat(),
               "verified_at": None, "period_ends_at": None, "note": ""}
        await db.btc_payments.insert_one(dict(doc))
        return doc

    @r.get("/billing/payments")
    async def my_payments(me: dict = Depends(current)):
        return await db.btc_payments.find({"user_id": me["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)

    @r.post("/billing/payments/{pid}/verify")
    async def verify(pid: str, body: TxIn, me: dict = Depends(current)):
        p = await db.btc_payments.find_one({"id": pid, "user_id": me["user_id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Payment not found")
        if p["status"] in ("confirmed", "approved"):
            return p
        if p["status"] == "rejected":
            raise HTTPException(409, "This payment was rejected by the admin")
        if not p.get("txid") and p["quote_expires_at"] < now().isoformat():
            await db.btc_payments.update_one({"id": pid}, {"$set": {"status": "expired"}})
            raise HTTPException(409, "This quote expired — start a new checkout for a fresh BTC amount")
        return await check_payment(p, body.txid)

    # ---------- admin ----------
    @r.get("/admin/billing")
    async def get_billing(_: dict = Depends(require_admin)):
        s = (await db.settings.find_one({"_id": "billing"}, {"_id": 0})) or {}
        return {"btc_address": s.get("btc_address"), "updated_at": s.get("updated_at")}

    @r.put("/admin/billing")
    async def set_billing(body: AddressIn, admin: dict = Depends(require_admin)):
        a = body.btc_address.strip()
        a = a.lower() if a.lower().startswith("bc1") else a
        if not ADDR_RE.match(a):
            raise HTTPException(400, "That doesn't look like a valid Bitcoin mainnet address")
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                v = await c.get(f"{CHAIN_APIS[0]}/v1/validate-address/{a}")
                if v.is_success and v.json().get("isvalid") is False:
                    raise HTTPException(400, "Invalid Bitcoin address (checksum failed)")
        except httpx.HTTPError:
            pass
        ts = now().isoformat()
        await db.settings.update_one({"_id": "billing"}, {"$set": {"btc_address": a, "updated_at": ts}}, upsert=True)
        await db.admin_log.insert_one({"t": ts, "by": admin["user_id"], "action": f"btc_address:{a}"})
        return {"btc_address": a, "updated_at": ts}

    @r.get("/admin/btc-payments")
    async def list_payments(status: Optional[str] = None, _: dict = Depends(require_admin)):
        q = {"status": status} if status else {}
        return await db.btc_payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

    @r.post("/admin/btc-payments/{pid}/approve")
    async def approve(pid: str, admin: dict = Depends(require_admin)):
        p = await db.btc_payments.find_one_and_update(
            {"id": pid, "status": {"$in": OPEN}},
            {"$set": {"status": "approved", "approved_by": admin["user_id"], "verified_at": now().isoformat()}}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Payment not found or already processed")
        await grant(p)
        return await db.btc_payments.find_one({"id": pid}, {"_id": 0})

    @r.post("/admin/btc-payments/{pid}/reject")
    async def reject(pid: str, body: RejectIn, admin: dict = Depends(require_admin)):
        p = await db.btc_payments.find_one_and_update(
            {"id": pid, "status": {"$in": OPEN}},
            {"$set": {"status": "rejected", "note": body.note or "", "approved_by": admin["user_id"]}}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Payment not found or already processed")
        await notify(p["user_id"], "payment", f"Bitcoin payment for T{p['tier']} rejected", body.note or "Contact the admin for details")
        return await db.btc_payments.find_one({"id": pid}, {"_id": 0})

    @r.post("/admin/btc-payments/{pid}/recheck")
    async def recheck(pid: str, _: dict = Depends(require_admin)):
        p = await db.btc_payments.find_one({"id": pid}, {"_id": 0})
        if not p or not p.get("txid"):
            raise HTTPException(404, "No transaction to check for this payment")
        if p["status"] not in OPEN:
            return p
        return await check_payment(p, p["txid"])

    @r.get("/admin/tiers")
    async def admin_tiers(_: dict = Depends(require_admin)):
        return await get_tiers()

    @r.put("/admin/tiers")
    async def save_tiers(body: TiersIn, admin: dict = Depends(require_admin)):
        ov = {str(t.id): {"name": t.name.strip().upper(), "amount_cents": 0 if t.id == 1 else t.amount_cents} for t in body.tiers}
        await db.settings.update_one({"_id": "tiers"}, {"$set": {f"overrides.{k}": v for k, v in ov.items()}}, upsert=True)
        await db.admin_log.insert_one({"t": now().isoformat(), "by": admin["user_id"], "action": "tiers_edited"})
        return await get_tiers()

    @r.get("/admin/export/{kind}")
    async def admin_export(kind: Literal["users", "payments"], fmt: Literal["csv", "xlsx"] = Query("csv"),
                           _: dict = Depends(require_admin)):
        if kind == "users":
            cols = ["user_id", "email", "name", "tier", "tier_expires_at", "is_admin", "created_at", "last_login"]
            docs = await db.users.find({}, {"_id": 0}).to_list(10000)
        else:
            cols = ["id", "created_at", "email", "user_id", "tier", "tier_name", "usd_cents", "amount_btc", "btc_usd",
                    "status", "txid", "received_sats", "confirmations", "period_ends_at", "note"]
            docs = await db.btc_payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
        return table_response([[d.get(c) for c in cols] for d in docs], cols, f"stockforge-{kind}", fmt)

    return r

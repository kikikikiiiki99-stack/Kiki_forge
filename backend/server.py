import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import requests
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

from admin import build_admin_router, make_require_admin
from billing import build_billing_router, ensure_billing_indexes, get_tiers
from features import ALERT_SYMS, ai_limit, ai_used, build_features_router, ensure_feature_indexes, live_prices, notify, use_ai
from db import client, db
from clerk_auth import clerk_router, require_user
from data import DEFAULT_WATCH, GATES, PRICES, START_CASH, TICKERS, TIERS, snapshot, snapshot_context
from markets import get_markets, markets_router
from universe import LAST_PX, equity_of, find_asset, in_universe, price_of, universe_router, warm
from predict import TF, Timeframe, narrative_context, predict
from wallet import build_wallet_router, ensure_wallet_indexes
from routers.site import build_site_router
from lib.ai_errors import friendly_ai_error, is_budget_error
from routers.agent import build_agent_router
from routers.digest import router as digest_router
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

app = FastAPI()
api = APIRouter(prefix="/api")
logger = logging.getLogger("stockforge")
MODEL = ("anthropic", "claude-opus-5-5")
SYMS = {t["sym"] for t in TICKERS}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_user(uid):
    return {"user_id": uid, "tier": 1, "theme": 1, "watch": list(DEFAULT_WATCH), "alerts": {},
            "cash": START_CASH, "positions": [], "orders": [],
            "equity": [{"t": now_iso(), "v": START_CASH}], "created_at": now_iso()}


def _is_admin_email(uid):
    """One Clerk lookup per user: is a VERIFIED email of theirs listed in ADMIN_EMAIL?"""
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    if not admins:
        return False
    r = requests.get(f"https://api.clerk.com/v1/users/{uid}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "stockforge"})
    r.raise_for_status()
    return any(e["email_address"].lower() in admins and (e.get("verification") or {}).get("status") == "verified"
               for e in r.json().get("email_addresses", []))


def _clerk_profile(uid):
    try:
        r = requests.get(f"https://api.clerk.com/v1/users/{uid}", timeout=8,
                         headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "stockforge"})
        r.raise_for_status()
        j = r.json()
        emails = j.get("email_addresses") or []
        name = " ".join(x for x in [j.get("first_name"), j.get("last_name")] if x)
        return {"email": emails[0]["email_address"] if emails else "", "name": name}
    except Exception:
        return {}


async def current(request: Request, user: dict = Depends(require_user)) -> dict:
    doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if doc is None:
        doc = new_user(user["user_id"])
        await db.users.update_one({"user_id": doc["user_id"]}, {"$setOnInsert": doc}, upsert=True)
        doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    for k, v in new_user(user["user_id"]).items():
        doc.setdefault(k, v)
    if not doc.get("admin_email_checked"):
        upd = {"admin_email_checked": True}
        if await run_in_threadpool(_is_admin_email, user["user_id"]):
            upd["is_admin"] = True
        await db.users.update_one({"user_id": doc["user_id"]}, {"$set": upd})
        doc.update(upd)
    exp = doc.get("tier_expires_at")
    if exp and exp < now_iso():
        old = doc["tier"]
        await db.users.update_one({"user_id": doc["user_id"], "tier_expires_at": exp},
                                  {"$set": {"tier": 1, "theme": 1, "tier_expires_at": None}})
        doc.update(tier=1, theme=1, tier_expires_at=None)
        await notify(doc["user_id"], "payment", f"T{old} membership expired", "Renew with a new Bitcoin payment on the Tiers page")
    sid = user.get("session_id")
    if sid and doc.get("last_sid") != sid:
        upd = {"last_sid": sid, "last_login": now_iso()}
        if not doc.get("email"):
            upd.update(await run_in_threadpool(_clerk_profile, user["user_id"]))
        await db.users.update_one({"user_id": doc["user_id"]}, {"$set": upd})
        doc.update(upd)
        fwd = request.headers.get("x-forwarded-for", "")
        await db.logins.insert_one({
            "t": upd["last_login"], "user_id": doc["user_id"], "email": doc.get("email", ""), "name": doc.get("name", ""),
            "ip": fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else ""),
            "ua": request.headers.get("user-agent", "")[:160],
        })
    return doc


def gate(name):
    async def check(me: dict = Depends(current)) -> dict:
        if me["tier"] < GATES[name]:
            raise HTTPException(403, f"Requires tier {GATES[name]}")
        return me
    return check




async def public_me(doc):
    eq = equity_of(doc["cash"], doc["positions"])
    hidden = {"admin_fails", "admin_lock_until", "last_sid", "admin_email_checked"}
    tiers = await get_tiers()
    positions = [{**p, "last": LAST_PX.get(p["sym"]) or p["entry"]} for p in doc["positions"]]
    return {**{k: v for k, v in doc.items() if k not in hidden}, "positions": positions, "deposits_total": doc.get("deposits_total", 0), "is_admin": bool(doc.get("is_admin")),
            "equity_now": eq, "tier_name": tiers[doc["tier"] - 1]["name"], "tier_expires_at": doc.get("tier_expires_at"),
            "ai_used": await ai_used(doc["user_id"]), "ai_limit": ai_limit(doc["tier"])}


@api.get("/")
async def root():
    return {"message": "StockForge API"}


@api.get("/snapshot")
async def get_snapshot():
    snap = snapshot()
    snap["tiers"] = [{k: v for k, v in t.items() if k != "amount_cents"} for t in await get_tiers()]
    return snap


@api.get("/me")
async def me(doc: dict = Depends(current)):
    return await public_me(doc)


class ThemeIn(BaseModel):
    tier: int = Field(ge=1, le=10)


@api.put("/me/theme")
async def set_theme(body: ThemeIn, doc: dict = Depends(current)):
    if body.tier > doc["tier"]:
        raise HTTPException(403, "Upgrade to unlock this look")
    await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {"theme": body.tier}})
    return {"theme": body.tier}


class SymIn(BaseModel):
    sym: str = Field(min_length=1, max_length=10)


@api.post("/watchlist")
async def add_watch(body: SymIn, doc: dict = Depends(current)):
    sym = body.sym.strip().upper()
    if not await in_universe(sym):
        raise HTTPException(400, f"{sym} is not a NASDAQ listing or a top-100 crypto")
    await db.users.update_one({"user_id": doc["user_id"]}, {"$addToSet": {"watch": sym}})
    return {"watch": (await current_watch(doc["user_id"]))}


async def current_watch(uid):
    return (await db.users.find_one({"user_id": uid}, {"_id": 0, "watch": 1}))["watch"]


@api.delete("/watchlist/{sym}")
async def del_watch(sym: str, doc: dict = Depends(current)):
    sym = sym.upper()
    await db.users.update_one({"user_id": doc["user_id"]}, {"$pull": {"watch": sym}, "$unset": {f"alerts.{sym}": ""}})
    return {"watch": (await current_watch(doc["user_id"]))}


class AlertIn(BaseModel):
    price: float = Field(gt=0)
    dir: Literal["above", "below"]


@api.put("/alerts/{sym}")
async def set_alert(sym: str, body: AlertIn, doc: dict = Depends(current)):
    sym = sym.upper()
    if not await in_universe(sym):
        raise HTTPException(400, "Unknown symbol")
    px = (await live_prices()).get(sym, 0)
    hit = px >= body.price if body.dir == "above" else px <= body.price
    alert = {"price": body.price, "dir": body.dir, "hit": hit, "created_at": now_iso()}
    await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {f"alerts.{sym}": alert}})
    return {"sym": sym, "alert": alert}


@api.delete("/alerts/{sym}")
async def del_alert(sym: str, doc: dict = Depends(current)):
    await db.users.update_one({"user_id": doc["user_id"]}, {"$unset": {f"alerts.{sym.upper()}": ""}})
    return {"ok": True}


@api.get("/export")
async def export(doc: dict = Depends(gate("export"))):
    rows = [t for t in TICKERS if t["sym"] in doc["watch"]]
    return {"exported_at": now_iso(), "watchlist": doc["watch"], "alerts": doc["alerts"],
            "quotes": [{k: t[k] for k in ("sym", "name", "price", "chg", "conf", "bias")} for t in rows]}


class OrderIn(BaseModel):
    sym: str
    side: Literal["BUY", "SELL"]
    qty: float = Field(gt=0, le=10_000_000)


@api.post("/paper/order")
async def paper_order(body: OrderIn, doc: dict = Depends(gate("paper"))):
    sym = body.sym.strip().upper()
    price = await price_of(sym)
    if not price:
        raise HTTPException(400, "Unknown symbol — pick any NASDAQ listing or top-100 crypto")
    for p in doc["positions"]:
        await price_of(p["sym"])
    signed = body.qty if body.side == "BUY" else -body.qty
    cash = doc["cash"] - signed * price
    positions = [dict(p) for p in doc["positions"]]
    pos = next((p for p in positions if p["sym"] == sym), None)
    if pos is None:
        positions.append({"sym": sym, "qty": signed, "entry": price})
    else:
        new_qty = pos["qty"] + signed
        if abs(new_qty) < 1e-9:
            positions = [p for p in positions if p["sym"] != sym]
        elif (pos["qty"] > 0) == (signed > 0):
            pos["entry"] = (pos["entry"] * abs(pos["qty"]) + price * abs(signed)) / abs(new_qty)
            pos["qty"] = new_qty
        elif (pos["qty"] > 0) != (new_qty > 0):
            pos.update(qty=new_qty, entry=price)
        else:
            pos["qty"] = new_qty
    gross = sum(abs(p["qty"]) * (LAST_PX.get(p["sym"]) or p["entry"]) for p in positions)
    if cash < -0.0001 and gross > 2 * equity_of(cash, positions):
        raise HTTPException(400, "Insufficient buying power")
    order = {"id": str(uuid.uuid4()), "time": now_iso(), "side": body.side, "qty": body.qty, "sym": sym, "price": price}
    point = {"t": now_iso(), "v": equity_of(cash, positions)}
    await db.users.update_one({"user_id": doc["user_id"]}, {
        "$set": {"cash": cash, "positions": positions},
        "$push": {"orders": {"$each": [order], "$slice": -200}, "equity": {"$each": [point], "$slice": -300}},
    })
    return {"order": order, "me": await public_me(await current_raw(doc["user_id"]))}


async def current_raw(uid):
    return await db.users.find_one({"user_id": uid}, {"_id": 0})


@api.post("/paper/reset")
async def paper_reset(doc: dict = Depends(gate("paper"))):
    await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {
        "cash": START_CASH, "positions": [], "orders": [], "equity": [{"t": now_iso(), "v": START_CASH}]}})
    return await public_me(await current_raw(doc["user_id"]))


# ---------- AI ----------
ADVISOR_SYSTEM = (
    "You are the StockForge Neural Advisor, a sharp, concise markets analyst inside a trading terminal. "
    "Use the session snapshot and the user's paper account for context. Prefer short paragraphs and tight bullet lists, "
    "cite tickers and levels, flag risks. Never promise returns. End with a one-line reminder that this is not investment advice "
    "only when giving trade ideas."
)


def sse(gen):
    async def stream():
        try:
            async for chunk in gen:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            logger.exception("stream failed")
            yield f"data: {json.dumps({'error': friendly_ai_error(e)})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


FALLBACK_MODEL = ("anthropic", "claude-sonnet-5-5")


def make_chat(session_id, system, model=MODEL):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=session_id, system_message=system).with_model(*model)
    chat.sf_system = system
    return chat


async def _stream_once(chat, text):
    async for ev in chat.stream_message(UserMessage(text=text)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


async def stream_llm(chat, text):
    sent = False
    try:
        async for c in _stream_once(chat, text):
            sent = True
            yield c
    except Exception as e:
        if sent or is_budget_error(e):
            raise
        logger.warning("Opus unavailable, falling back to Sonnet: %s", str(e)[:120])
        backup = make_chat(f"{chat.session_id}-fb", chat.sf_system, FALLBACK_MODEL)
        async for c in _stream_once(backup, text):
            yield c


def account_context(doc):
    pos = ", ".join(f"{p['sym']} {p['qty']}@{p['entry']:.2f}" for p in doc["positions"]) or "none"
    return f"User tier: {TIERS[doc['tier'] - 1]['name']}. Paper cash ${doc['cash']:,.0f}, positions: {pos}. Watchlist: {', '.join(doc['watch'])}."


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@api.get("/advisor/history")
async def advisor_history(doc: dict = Depends(current)):
    return await db.chat.find({"user_id": doc["user_id"]}, {"_id": 0}).sort("t", 1).to_list(200)


@api.delete("/advisor/history")
async def advisor_clear(doc: dict = Depends(current)):
    await db.chat.delete_many({"user_id": doc["user_id"]})
    return {"ok": True}


@api.post("/advisor/chat")
async def advisor_chat(body: ChatIn, doc: dict = Depends(current)):
    uid = doc["user_id"]
    await use_ai(doc)
    history = await db.chat.find({"user_id": uid}, {"_id": 0}).sort("t", -1).to_list(12)
    transcript = "\n".join(f"{m['role'].upper()}: {m['text']}" for m in reversed(history))
    await db.chat.insert_one({"user_id": uid, "role": "user", "text": body.text, "t": now_iso()})
    prompt = f"{snapshot_context()}\n{account_context(doc)}\n\nRecent conversation:\n{transcript or '(none)'}\n\nUSER: {body.text}"
    chat = make_chat(f"advisor-{uid}-{uuid.uuid4()}", ADVISOR_SYSTEM)

    async def gen():
        parts = []
        try:
            async for c in stream_llm(chat, prompt):
                parts.append(c)
                yield c
        finally:
            if parts:
                await db.chat.insert_one({"user_id": uid, "role": "ai", "text": "".join(parts), "t": now_iso()})
    return sse(gen())


@api.post("/advisor/brief")
async def deep_brief(doc: dict = Depends(gate("deepBrief"))):
    await use_ai(doc)
    chat = make_chat(f"brief-{doc['user_id']}-{uuid.uuid4()}", ADVISOR_SYSTEM)
    prompt = (f"{snapshot_context()}\n{account_context(doc)}\n\nWrite a DEEP BRIEF for today's session in markdown-free plain text "
              "with these sections in caps: TAPE, LEADERS & LAGGARDS, CATALYSTS, PORTFOLIO RISK, PLAYBOOK. Max 260 words.")
    return sse(stream_llm(chat, prompt))


class AnalystIn(BaseModel):
    sym: str
    question: Optional[str] = ""


@api.post("/analyst")
async def analyst(body: AnalystIn, doc: dict = Depends(current)):
    data = await get_markets()
    asset = next((a for a in data["crypto"] + data["stocks"] if a["sym"] == body.sym.upper()), None)
    if not asset:
        u = await find_asset(body.sym)
        if u:
            p = await predict(u, "1W")
            asset = {**u, "spark": [h["c"] for h in p["history"]], "bands": None, "chg7": 0}
    if not asset:
        raise HTTPException(404, "Asset not in live universe")
    await use_ai(doc)
    spark = asset.get("spark") or []
    step = max(1, len(spark) // 28)
    series = ", ".join(f"{p:.4g}" for p in spark[::step])
    b = asset.get("bands") or {}
    ctx = (f"Asset {asset['sym']} ({asset['name']}, {asset['kind']}). Live price {asset['price']}. 24h change {asset['chg']:.2f}%, "
           f"7d change {asset.get('chg7') or 0:.2f}%. ±1σ 24h band {b.get('d1')}, 7d band {b.get('d7')}. "
           f"Downsampled 7-day hourly closes: {series}.")
    q = body.question or "Trend, risks and what the 7-day data suggests."
    chat = make_chat(f"analyst-{doc['user_id']}-{uuid.uuid4()}",
                     "You are StockForge AI Analyst. Give a crisp technical read: trend, momentum, key levels, volatility regime, "
                     "scenarios with rough probabilities, risks. Max 200 words, plain text with short labeled lines. Not investment advice.")
    return sse(stream_llm(chat, f"{ctx}\n\nQuestion: {q}"))


# ---------- advanced predictions ----------
@api.get("/predict/{sym}")
async def get_prediction(sym: str, tf: Timeframe = "1W", doc: dict = Depends(current)):
    asset = await find_asset(sym)
    if not asset:
        raise HTTPException(404, f"{sym.upper()} is not a NASDAQ listing or a top-100 crypto")
    return await predict(asset, tf)


class NarrativeIn(BaseModel):
    tf: Timeframe = "1W"


@api.post("/predict/{sym}/narrative")
async def prediction_narrative(sym: str, body: NarrativeIn, doc: dict = Depends(current)):
    asset = await find_asset(sym)
    if not asset:
        raise HTTPException(404, "Unknown symbol")
    p = await predict(asset, body.tf)
    await use_ai(doc)
    chat = make_chat(f"forecast-{doc['user_id']}-{uuid.uuid4()}",
                     "You are StockForge Quantum Forecaster. You receive a Monte Carlo forecast and a technical signal stack. "
                     "Write a sharp briefing in plain text with these labeled lines: VERDICT, BEST CASE, AVERAGE CASE, WORST CASE, "
                     "KEY LEVELS, TRIGGERS, RISK. Quote the numbers you are given (prices, probabilities, levels); never invent data. "
                     "Max 190 words. End with: Not investment advice.")
    return sse(stream_llm(chat, narrative_context(p)))


class InsightIn(BaseModel):
    sym: str = Field(min_length=1, max_length=10)
    kind: Literal["summary", "prediction"]


@api.post("/insights")
async def insights(body: InsightIn, doc: dict = Depends(current)):
    sym = body.sym.strip().upper()
    t = next((x for x in TICKERS if x["sym"] == sym), None)
    data = await get_markets()
    live = next((a for a in data["crypto"] + data["stocks"] if a["sym"] == sym and not a.get("stale")), None)
    uni = await find_asset(sym)
    if not t and not live and not uni:
        raise HTTPException(404, "Unknown symbol")
    await use_ai(doc)
    ctx = []
    if t:
        ctx.append(f"Session snapshot {sym} ({t['name']}): price {t['price']}, change {t['chg']:+}%, model confidence {t['conf']}/100, "
                   f"bias {t['bias']}, volatility {t['vol']}, note: {t['note']}, catalysts: {'; '.join(c[0] for c in t['catalysts'])}, "
                   f"recent closes: {t['hist']}.")
    if uni and not t and not live:
        ctx.append(f"{sym} ({uni['name']}, {uni['kind']}, sector {uni.get('sector')}): price {uni['price']}, 24h change {uni['chg']:.2f}%, market cap {uni.get('cap')}.")
    if live:
        ctx.append(f"Live: price {live['price']}, 24h {live['chg']:.2f}%, 7d {live.get('chg7') or 0:.2f}%, bands {live.get('bands')}.")
    task = ("Write a plain-language MARKET SUMMARY for this symbol: what is happening, why it matters, and what to watch next."
            if body.kind == "summary" else
            "Comment on the PREDICTION: explain what the model bias and confidence imply, whether recent price action supports it, "
            "the bull and bear case, and what would invalidate it.")
    chat = make_chat(f"insight-{doc['user_id']}-{uuid.uuid4()}",
                     "You are StockForge AI Insights. Explain markets in clear, plain language for everyday investors. "
                     "Short paragraphs, no markdown headers, max 170 words. End with: Not investment advice.")
    return sse(stream_llm(chat, "\n".join(ctx) + "\n\n" + task))


app.include_router(api)
require_admin = make_require_admin(current)
app.include_router(build_admin_router(current, require_admin))
app.include_router(build_billing_router(current, require_admin))
app.include_router(build_features_router(current, gate))
app.include_router(clerk_router)
app.include_router(markets_router)
app.include_router(universe_router)
app.include_router(build_wallet_router(current))
app.include_router(build_site_router(require_admin))
app.include_router(build_agent_router(require_admin))
app.include_router(digest_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)


@app.on_event("startup")
async def ensure_indexes():
    await ensure_billing_indexes()
    await ensure_feature_indexes()
    await ensure_wallet_indexes()
    from lib.db import ensure_indexes as ensure_lib_indexes
    await ensure_lib_indexes()
    asyncio.create_task(warm())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

"""Notifications + price-alert checks, per-tier AI quota, and CSV/Excel import/export."""
import io
import uuid
from datetime import datetime, timezone
from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pymongo import ReturnDocument

from data import LIVE_CRYPTO, PRICES, TICKERS
from db import db
from markets import get_markets

SYMS = {t["sym"] for t in TICKERS}
ALERT_SYMS = SYMS | {c[1] for c in LIVE_CRYPTO}
# Daily AI requests per tier (T1..T10); None = unlimited.
AI_DAILY = [5, 15, 30, 50, 80, 120, 200, 300, 500, None]
MAX_UPLOAD = 2 * 1024 * 1024


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def ensure_feature_indexes():
    await db.notifications.create_index([("user_id", 1), ("t", -1)])
    await db.ai_usage.create_index([("user_id", 1), ("day", 1)], unique=True)


# ---------- notifications ----------
async def notify(uid, kind, title, body="", sym=None):
    await db.notifications.insert_one({"id": str(uuid.uuid4()), "user_id": uid, "kind": kind, "title": title,
                                       "body": body, "sym": sym, "t": now_iso(), "read": False})


async def live_prices():
    from universe import all_prices
    prices = dict(PRICES)
    prices.update(await all_prices())
    try:
        m = await get_markets()
        for a in m.get("crypto", []) + m.get("stocks", []):
            if a.get("price") and not a.get("stale"):
                prices[a["sym"]] = a["price"]
    except Exception:
        pass
    return prices


async def check_alerts(doc):
    alerts = doc.get("alerts") or {}
    if not any(not a.get("triggered_at") for a in alerts.values()):
        return
    prices = await live_prices()
    for sym, a in alerts.items():
        px = prices.get(sym)
        if a.get("triggered_at") or px is None:
            continue
        above = a["dir"] == "above"
        if (px >= a["price"]) if above else (px <= a["price"]):
            res = await db.users.update_one(
                {"user_id": doc["user_id"], f"alerts.{sym}.created_at": a["created_at"], f"alerts.{sym}.triggered_at": {"$exists": False}},
                {"$set": {f"alerts.{sym}.triggered_at": now_iso(), f"alerts.{sym}.hit": True, f"alerts.{sym}.hit_price": px}})
            if res.modified_count:
                await notify(doc["user_id"], "alert", f"{sym} {'≥' if above else '≤'} ${a['price']:,.2f}",
                             f"Target crossed · now ${px:,.2f}", sym)


# ---------- AI quota ----------
def ai_limit(tier):
    return AI_DAILY[max(1, min(tier, 10)) - 1]


async def ai_used(uid):
    d = await db.ai_usage.find_one({"user_id": uid, "day": today()}, {"_id": 0, "n": 1})
    return d["n"] if d else 0


async def use_ai(doc):
    limit = ai_limit(doc["tier"])
    if limit is None:
        return
    key = {"user_id": doc["user_id"], "day": today()}
    res = await db.ai_usage.find_one_and_update(key, {"$inc": {"n": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    if res["n"] > limit:
        await db.ai_usage.update_one(key, {"$inc": {"n": -1}})
        raise HTTPException(429, f"Daily AI limit reached ({limit}/day on your tier). Upgrade for more, or try again tomorrow.")


# ---------- tables ----------
def table_response(rows, columns, name, fmt):
    df = pd.DataFrame(rows, columns=columns)
    if fmt == "xlsx":
        buf = io.BytesIO()
        df.to_excel(buf, index=False, engine="openpyxl")
        data, mime = buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        data, mime = df.to_csv(index=False).encode(), "text/csv"
    return StreamingResponse(io.BytesIO(data), media_type=mime,
                             headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"'})


def _read_table(filename, raw):
    name = (filename or "").lower()
    try:
        if name.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
        elif name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw))
        else:
            raise HTTPException(400, "Upload a .csv or .xlsx file")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Could not read that file — check it is a valid CSV or Excel sheet")
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


def _col(df, *names):
    return next((n for n in names if n in df.columns), None)


def build_features_router(current, gate):
    r = APIRouter(prefix="/api")

    @r.get("/notifications")
    async def notifications(me: dict = Depends(current)):
        await check_alerts(me)
        items = await db.notifications.find({"user_id": me["user_id"]}, {"_id": 0}).sort("t", -1).to_list(50)
        unread = await db.notifications.count_documents({"user_id": me["user_id"], "read": False})
        return {"unread": unread, "items": items}

    @r.post("/notifications/read")
    async def mark_read(me: dict = Depends(current)):
        await db.notifications.update_many({"user_id": me["user_id"], "read": False}, {"$set": {"read": True}})
        return {"unread": 0}

    @r.get("/export/{kind}")
    async def export_table(kind: Literal["watchlist", "alerts", "history"], fmt: Literal["csv", "xlsx"] = Query("csv"),
                           me: dict = Depends(gate("export"))):
        by = {t["sym"]: t for t in TICKERS}
        if kind == "watchlist":
            prices = await live_prices()
            rows = [[s, by[s]["name"], prices.get(s), by[s]["chg"], by[s]["conf"], by[s]["bias"]] for s in me["watch"] if s in by]
            cols = ["sym", "name", "price", "chg_pct", "confidence", "bias"]
        elif kind == "alerts":
            rows = [[s, a["dir"], a["price"], a.get("created_at"), a.get("triggered_at"), a.get("hit_price")]
                    for s, a in (me.get("alerts") or {}).items()]
            cols = ["sym", "direction", "target", "created_at", "triggered_at", "hit_price"]
        else:
            rows = [[s, i + 1, p] for s in me["watch"] if s in by for i, p in enumerate(by[s]["hist"])]
            cols = ["sym", "point", "price"]
        return table_response(rows, cols, f"stockforge-{kind}", fmt)

    @r.post("/import")
    async def import_table(mode: Literal["watchlist", "portfolio"] = Query("watchlist"), file: UploadFile = File(...),
                           me: dict = Depends(gate("export"))):
        raw = await file.read()
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "File too large (2 MB max)")
        df = _read_table(file.filename, raw)
        sc = _col(df, "sym", "symbol", "ticker")
        if not sc:
            raise HTTPException(400, "Add a column named sym, symbol or ticker")
        syms = [str(x).strip().upper() for x in df[sc].dropna()]
        valid = [s for s in dict.fromkeys(syms) if s in SYMS]
        skipped = sorted(set(syms) - set(valid))
        if mode == "watchlist":
            await db.users.update_one({"user_id": me["user_id"]}, {"$addToSet": {"watch": {"$each": valid}}})
            return {"mode": mode, "imported": valid, "skipped": skipped}
        qc, ec = _col(df, "qty", "quantity", "shares"), _col(df, "entry", "price", "cost", "avg_price")
        if not qc:
            raise HTTPException(400, "Portfolio import needs a qty (or quantity / shares) column")
        rows = {}
        for _, row in df.iterrows():
            s = str(row[sc]).strip().upper()
            try:
                qty = int(float(row[qc]))
                entry = float(row[ec]) if ec and pd.notna(row[ec]) else PRICES.get(s)
            except (TypeError, ValueError):
                continue
            if s in SYMS and qty != 0 and entry and entry > 0:
                rows[s] = {"sym": s, "qty": qty, "entry": round(entry, 4)}
        if not rows:
            raise HTTPException(400, "No valid rows found (need a known symbol and a non-zero qty)")
        positions = [p for p in me["positions"] if p["sym"] not in rows] + list(rows.values())
        eq = me["cash"] + sum(p["qty"] * PRICES.get(p["sym"], p["entry"]) for p in positions)
        await db.users.update_one({"user_id": me["user_id"]}, {"$set": {"positions": positions},
                                  "$push": {"equity": {"$each": [{"t": now_iso(), "v": eq}], "$slice": -300}}})
        return {"mode": mode, "imported": list(rows), "skipped": skipped}

    return r

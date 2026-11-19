"""Full NASDAQ directory + Top-100 crypto universe, with cached live prices.

NASDAQ rows come from the nasdaq.com screener (all ~4,000 listings, refreshed every 15 min);
crypto comes from CoinGecko's top 100 by market cap (refreshed every 2 min). Both fall back to
the last good copy on disk so the directory never goes empty."""
import asyncio
import json
import time
from pathlib import Path
from typing import Literal, Optional

import requests
from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from data import TICKERS

DATA_DIR = Path(__file__).parent / "datasets"
NASDAQ_FILE = DATA_DIR / "nasdaq_raw.json"
CRYPTO_FILE = DATA_DIR / "crypto_top100.json"
_UA = {"User-Agent": "Mozilla/5.0 (StockForge)", "Accept": "application/json"}
STABLES = {"USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD", "USD1", "BUSD", "USDD", "USDX"}

_cache = {"stocks": None, "stocks_t": 0, "crypto": None, "crypto_t": 0}
LAST_PX: dict = {t["sym"]: t["price"] for t in TICKERS}
_locks = {"stocks": asyncio.Lock(), "crypto": asyncio.Lock()}


def _num(s, default=None):
    try:
        return float(str(s).replace("$", "").replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError):
        return default


def _norm_stock(r):
    price = _num(r.get("lastsale"))
    cap = _num(r.get("marketCap"), 0) or 0
    return {
        "sym": r["symbol"].strip().upper().replace("/", "."), "name": (r.get("name") or "").strip(), "kind": "stock",
        "price": price, "chg": _num(r.get("pctchange"), 0) or 0, "cap": cap, "vol": _num(r.get("volume"), 0) or 0,
        "sector": (r.get("sector") or "").strip() or "Other", "industry": (r.get("industry") or "").strip(),
        "country": (r.get("country") or "").strip(), "exchange": "NASDAQ",
    }


def _load_stocks_sync():
    raw = None
    try:
        r = requests.get("https://api.nasdaq.com/api/screener/stocks", timeout=25, headers=_UA,
                         params={"tableonly": "true", "exchange": "nasdaq", "download": "true"})
        r.raise_for_status()
        raw = r.json()
        if len(raw["data"]["rows"]) < 1000:
            raise ValueError("short NASDAQ list")
        NASDAQ_FILE.write_text(json.dumps(raw))
        src = "nasdaq.com"
    except Exception:
        raw = json.loads(NASDAQ_FILE.read_text())
        src = "nasdaq.com (cached)"
    rows = [_norm_stock(x) for x in raw["data"]["rows"] if x.get("symbol")]
    rows = [x for x in rows if x["price"]]
    return rows, src


def _load_crypto_sync():
    try:
        r = requests.get("https://api.coingecko.com/api/v3/coins/markets", timeout=15, headers=_UA, params={
            "vs_currency": "usd", "order": "market_cap_desc", "per_page": 100, "page": 1,
            "sparkline": "false", "price_change_percentage": "24h,7d"})
        r.raise_for_status()
        coins = r.json()
        if len(coins) < 50:
            raise ValueError("short crypto list")
        CRYPTO_FILE.write_text(json.dumps(coins))
        src = "CoinGecko"
    except Exception:
        coins = json.loads(CRYPTO_FILE.read_text()) if CRYPTO_FILE.exists() else []
        src = "CoinGecko (cached)"
    rows = []
    for i, c in enumerate(coins):
        sym = (c.get("symbol") or "").upper()
        rows.append({
            "sym": sym, "name": c.get("name"), "kind": "crypto", "cg_id": c.get("id"), "rank": c.get("market_cap_rank") or i + 1,
            "price": c.get("current_price"), "chg": c.get("price_change_percentage_24h_in_currency") or c.get("price_change_percentage_24h") or 0,
            "chg7": c.get("price_change_percentage_7d_in_currency") or 0, "cap": c.get("market_cap") or 0,
            "vol": c.get("total_volume") or 0, "high": c.get("high_24h"), "low": c.get("low_24h"), "image": c.get("image"),
            "sector": "Stablecoin" if sym in STABLES else "Crypto", "exchange": "CRYPTO",
        })
    seen, out = set(), []
    for r_ in rows:  # some tickers repeat (wrapped / bridged); keep the largest
        if r_["sym"] and r_["sym"] not in seen and r_["price"]:
            seen.add(r_["sym"])
            out.append(r_)
    return out, src


async def get_stocks():
    if _cache["stocks"] and time.time() - _cache["stocks_t"] < 900:
        return _cache["stocks"]
    async with _locks["stocks"]:
        if _cache["stocks"] and time.time() - _cache["stocks_t"] < 900:
            return _cache["stocks"]
        rows, src = await run_in_threadpool(_load_stocks_sync)
        _cache.update(stocks={"rows": rows, "src": src, "by": {r["sym"]: r for r in rows}, "updated": time.time()}, stocks_t=time.time())
        for r in rows:
            LAST_PX[r["sym"]] = r["price"]
    return _cache["stocks"]


async def get_crypto():
    if _cache["crypto"] and time.time() - _cache["crypto_t"] < 120:
        return _cache["crypto"]
    async with _locks["crypto"]:
        if _cache["crypto"] and time.time() - _cache["crypto_t"] < 120:
            return _cache["crypto"]
        rows, src = await run_in_threadpool(_load_crypto_sync)
        if not rows and _cache["crypto"]:
            return _cache["crypto"]
        _cache.update(crypto={"rows": rows, "src": src, "by": {r["sym"]: r for r in rows}, "updated": time.time()}, crypto_t=time.time())
        for r in rows:
            LAST_PX[r["sym"]] = r["price"]
    return _cache["crypto"]


SNAP_BY = {t["sym"]: t for t in TICKERS}


async def find_asset(sym: str) -> Optional[dict]:
    """Crypto first for crypto-looking tickers that clash (none in practice), then NASDAQ, then snapshot ETFs."""
    sym = sym.strip().upper()
    c = await get_crypto()
    if sym in c["by"]:
        return c["by"][sym]
    s = await get_stocks()
    if sym in s["by"]:
        return s["by"][sym]
    if sym in SNAP_BY:
        t = SNAP_BY[sym]
        return {"sym": sym, "name": t["name"], "kind": "stock", "price": t["price"], "chg": t["chg"], "cap": t["capN"] * 1e9,
                "vol": 0, "sector": "ETF" if not t["capN"] else "Technology", "industry": "", "exchange": "NYSE ARCA" if not t["capN"] else "NASDAQ"}
    return None


async def in_universe(sym: str) -> bool:
    return (await find_asset(sym)) is not None


async def price_of(sym: str) -> Optional[float]:
    a = await find_asset(sym)
    if a and a.get("price"):
        LAST_PX[a["sym"]] = a["price"]
        return a["price"]
    return None


async def all_prices() -> dict:
    out = dict(LAST_PX)
    try:
        await get_crypto()
        await get_stocks()
        out.update(LAST_PX)
    except Exception:
        pass
    return out


async def warm():
    try:
        await asyncio.gather(get_stocks(), get_crypto())
    except Exception:
        pass


universe_router = APIRouter(prefix="/api")
SORTS = {"cap", "chg", "price", "sym", "vol"}


@universe_router.get("/universe")
async def universe(kind: Literal["stock", "crypto", "all"] = "stock", q: str = "", sector: str = "",
                   filter: Literal["", "gainers", "losers", "mega"] = "", sort: str = "cap",
                   dir: Literal["asc", "desc"] = "desc", page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200)):
    rows = []
    srcs = {}
    if kind in ("stock", "all"):
        s = await get_stocks()
        rows += s["rows"]
        srcs["stocks"] = s["src"]
    if kind in ("crypto", "all"):
        c = await get_crypto()
        rows += c["rows"]
        srcs["crypto"] = c["src"]
    sectors = sorted({r["sector"] for r in rows if r.get("sector")})
    if q:
        ql = q.strip().lower()
        rows = [r for r in rows if r["sym"].lower().startswith(ql) or ql in (r["name"] or "").lower()]
        rows.sort(key=lambda r: (r["sym"].lower() != ql, not r["sym"].lower().startswith(ql)))
    if sector:
        rows = [r for r in rows if r.get("sector") == sector]
    if filter == "gainers":
        rows = [r for r in rows if (r["chg"] or 0) > 0]
        sort, dir = "chg", "desc"
    elif filter == "losers":
        rows = [r for r in rows if (r["chg"] or 0) < 0]
        sort, dir = "chg", "asc"
    elif filter == "mega":
        rows = [r for r in rows if (r["cap"] or 0) >= 200e9]
    if sort not in SORTS:
        sort = "cap"
    if not q or filter:
        key = (lambda r: r["sym"]) if sort == "sym" else (lambda r: r.get(sort) or 0)
        rows = sorted(rows, key=key, reverse=dir == "desc")
    total = len(rows)
    start = (page - 1) * limit
    return {"total": total, "page": page, "limit": limit, "rows": rows[start:start + limit], "sectors": sectors,
            "sources": srcs, "updated": time.time()}


@universe_router.get("/universe/stats")
async def universe_stats():
    s, c = await asyncio.gather(get_stocks(), get_crypto())
    st, cr = s["rows"], c["rows"]
    adv = sum(1 for r in st if r["chg"] > 0)
    top = lambda rows, rev: [{k: r[k] for k in ("sym", "name", "price", "chg", "kind")} for r in sorted(
        [r for r in rows if r["cap"] and r["cap"] > 2e9], key=lambda r: r["chg"], reverse=rev)[:5]]
    return {"stocks": len(st), "crypto": len(cr), "advancers": adv, "decliners": sum(1 for r in st if r["chg"] < 0),
            "crypto_cap": sum(r["cap"] or 0 for r in cr), "stock_gainers": top(st, True), "stock_losers": top(st, False),
            "crypto_gainers": top(cr, True), "sources": {"stocks": s["src"], "crypto": c["src"]}}


@universe_router.get("/universe/batch")
async def universe_batch(syms: str = Query("", max_length=2000)):
    out = {}
    for s in [x.strip().upper() for x in syms.split(",") if x.strip()][:200]:
        a = await find_asset(s)
        if a:
            out[s] = a
    return out


@universe_router.get("/universe/{sym}")
async def universe_one(sym: str):
    a = await find_asset(sym)
    if not a:
        raise HTTPException(404, f"{sym.upper()} is not a NASDAQ listing or a top-100 crypto")
    return a


def equity_of(cash, positions):
    return cash + sum(p["qty"] * (LAST_PX.get(p["sym"]) or p["entry"]) for p in positions)

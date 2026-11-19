import asyncio
import math
import time

import requests
from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from data import LIVE_CRYPTO, LIVE_STOCKS, TICKERS

markets_router = APIRouter(prefix="/api")
_cache = {"t": 0, "data": None}
_UA = {"User-Agent": "Mozilla/5.0 (StockForge)"}


def _bands(price, series):
    pts = [p for p in series if p]
    if len(pts) < 3 or not price:
        return None
    rets = [math.log(b / a) for a, b in zip(pts, pts[1:]) if a > 0 and b > 0]
    if len(rets) < 2:
        return None
    mean = sum(rets) / len(rets)
    sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1))
    step = 168 / max(len(pts) - 1, 1)
    s24, s7 = sd * math.sqrt(24 / step), sd * math.sqrt(168 / step)
    return {
        "d1": [price * math.exp(-s24), price * math.exp(s24)],
        "d7": [price * math.exp(-s7), price * math.exp(s7)],
        "sigma_hourly": sd / math.sqrt(step),
    }


def _crypto_yahoo():
    out = []
    for cid, sym, name in LIVE_CRYPTO:
        a = _stock(f"{sym}-USD")
        out.append({**a, "sym": sym, "name": name, "kind": "crypto"})
    return out


def _crypto():
    try:
        return _crypto_coingecko(), "CoinGecko"
    except Exception:
        return _crypto_yahoo(), "Yahoo Finance"


def _crypto_coingecko():
    ids = ",".join(c[0] for c in LIVE_CRYPTO)
    r = requests.get("https://api.coingecko.com/api/v3/coins/markets", timeout=12, headers=_UA, params={
        "vs_currency": "usd", "ids": ids, "sparkline": "true", "price_change_percentage": "24h,7d"})
    r.raise_for_status()
    by_id = {c["id"]: c for c in r.json()}
    out = []
    for cid, sym, name in LIVE_CRYPTO:
        c = by_id.get(cid)
        if not c:
            continue
        spark = (c.get("sparkline_in_7d") or {}).get("price") or []
        out.append({
            "sym": sym, "name": name, "kind": "crypto", "price": c["current_price"],
            "chg": c.get("price_change_percentage_24h_in_currency") or c.get("price_change_percentage_24h") or 0,
            "chg7": c.get("price_change_percentage_7d_in_currency") or 0,
            "high": c.get("high_24h"), "low": c.get("low_24h"), "cap": c.get("market_cap"),
            "spark": spark[-168:], "bands": _bands(c["current_price"], spark[-168:]),
        })
    return out


def _stock(sym):
    r = requests.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}", timeout=12, headers=_UA,
                     params={"range": "7d", "interval": "1h"})
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    meta = res["meta"]
    closes = [c for c in res["indicators"]["quote"][0].get("close", []) if c]
    price = meta.get("regularMarketPrice") or (closes[-1] if closes else None)
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    day_prev = meta.get("previousClose") or prev
    chg = ((price - day_prev) / day_prev * 100) if price and day_prev else 0
    chg7 = ((price - closes[0]) / closes[0] * 100) if closes and price else 0
    return {
        "sym": sym, "name": meta.get("longName") or meta.get("shortName") or sym, "kind": "stock", "price": price,
        "chg": chg, "chg7": chg7, "high": meta.get("regularMarketDayHigh"), "low": meta.get("regularMarketDayLow"),
        "cap": None, "spark": closes, "bands": _bands(price, closes),
    }


def _stocks():
    out = []
    for s in LIVE_STOCKS:
        try:
            out.append(_stock(s))
        except Exception:
            t = next((x for x in TICKERS if x["sym"] == s), None)
            if t:
                out.append({"sym": s, "name": t["name"], "kind": "stock", "price": t["price"], "chg": t["chg"], "chg7": 0,
                            "high": None, "low": None, "cap": None, "spark": t["hist"], "bands": None, "stale": True})
    return out


async def get_markets(force=False):
    if not force and _cache["data"] and time.time() - _cache["t"] < 60:
        return _cache["data"]
    crypto_task = run_in_threadpool(_crypto)
    stock_task = run_in_threadpool(_stocks)
    crypto, stocks = await asyncio.gather(crypto_task, stock_task, return_exceptions=True)
    prev = _cache["data"] or {}
    crypto_src = "cached"
    if isinstance(crypto, tuple):
        crypto, crypto_src = crypto
    data = {
        "crypto": crypto if isinstance(crypto, list) else prev.get("crypto", []),
        "stocks": stocks if isinstance(stocks, list) else prev.get("stocks", []),
        "updated": time.time(),
        "sources": {"crypto": crypto_src,
                    "stocks": "Yahoo Finance" if isinstance(stocks, list) else "cached"},
    }
    _cache.update(t=time.time(), data=data)
    return data


@markets_router.get("/markets")
async def markets(force: bool = False):
    return await get_markets(force)

"""Advanced prediction engine: fat-tailed Monte Carlo cones, support/resistance, probabilities,
technical signal stack — per symbol and timeframe. Claude writes the narrative on top."""
import math
import time
from typing import Literal, Optional

import numpy as np
import requests
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

_UA = {"User-Agent": "Mozilla/5.0 (StockForge)"}
_cache: dict = {}
TTL = 300
N_PATHS = 4000

# timeframe -> yahoo range/interval, horizon in bars for stock / crypto, bars per year (stock / crypto), label
TF = {
    "1D": {"range": "5d", "interval": "15m", "h": (26, 96), "bpy": (26 * 252, 96 * 365), "label": "Next session", "unit": "15m"},
    "1W": {"range": "1mo", "interval": "1h", "h": (35, 168), "bpy": (7 * 252, 24 * 365), "label": "Next 7 days", "unit": "1h"},
    "1M": {"range": "1y", "interval": "1d", "h": (21, 30), "bpy": (252, 365), "label": "Next 30 days", "unit": "1d"},
    "3M": {"range": "2y", "interval": "1d", "h": (63, 90), "bpy": (252, 365), "label": "Next 90 days", "unit": "1d"},
}
Timeframe = Literal["1D", "1W", "1M", "3M"]


def _yahoo(sym: str, rng: str, interval: str):
    r = requests.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}", timeout=12, headers=_UA,
                     params={"range": rng, "interval": interval})
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    ts = res.get("timestamp") or []
    out = []
    for i, t in enumerate(ts):
        c = q["close"][i]
        if c is None:
            continue
        out.append({"t": t, "o": q["open"][i] or c, "h": q["high"][i] or c, "l": q["low"][i] or c, "c": c, "v": (q.get("volume") or [0] * len(ts))[i] or 0})
    return out, res["meta"]


def _coingecko(cg_id: str, days: int):
    r = requests.get(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart", timeout=12, headers=_UA,
                     params={"vs_currency": "usd", "days": days})
    r.raise_for_status()
    pts = r.json()["prices"]
    return [{"t": int(p[0] / 1000), "o": p[1], "h": p[1], "l": p[1], "c": p[1], "v": 0} for p in pts]


def _history(asset: dict, tf: str):
    cfg = TF[tf]
    if asset["kind"] == "crypto":
        try:
            bars, _ = _yahoo(f"{asset['sym']}-USD", cfg["range"], cfg["interval"])
            if len(bars) > 30:
                return bars, "Yahoo Finance"
        except Exception:
            pass
        days = {"1D": 2, "1W": 30, "1M": 365, "3M": 365}[tf]
        bars = _coingecko(asset["cg_id"], days)
        if tf in ("1M", "3M"):  # daily-ish already for >90d windows
            pass
        return bars, "CoinGecko"
    bars, _ = _yahoo(asset["sym"].replace(".", "-"), cfg["range"], cfg["interval"])
    return bars, "Yahoo Finance"


def _ema(x: np.ndarray, n: int):
    a = 2 / (n + 1)
    out = np.empty_like(x)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def _rsi(c: np.ndarray, n=14):
    d = np.diff(c)
    if len(d) < n:
        return 50.0
    up, dn = np.clip(d, 0, None), np.clip(-d, 0, None)
    au, ad = up[:n].mean(), dn[:n].mean()
    for i in range(n, len(d)):
        au = (au * (n - 1) + up[i]) / n
        ad = (ad * (n - 1) + dn[i]) / n
    return 100.0 if ad == 0 else float(100 - 100 / (1 + au / ad))


def _levels(bars, price, sigma_px):
    """Classic pivots from the lookback window + swing-level clusters with touch counts."""
    look = bars[-min(len(bars), 120):]
    H, L, C = max(b["h"] for b in look), min(b["l"] for b in look), look[-1]["c"]
    pp = (H + L + C) / 3
    piv = {"R2": pp + (H - L), "R1": 2 * pp - L, "PIVOT": pp, "S1": 2 * pp - H, "S2": pp - (H - L)}
    highs = [b["h"] for b in bars]
    lows = [b["l"] for b in bars]
    swings = []
    w = 3
    for i in range(w, len(bars) - w):
        if highs[i] == max(highs[i - w:i + w + 1]):
            swings.append(highs[i])
        if lows[i] == min(lows[i - w:i + w + 1]):
            swings.append(lows[i])
    tol = max(sigma_px * 0.6, price * 0.004)
    clusters = []
    for s in sorted(swings):
        if clusters and s - clusters[-1][-1] <= tol:
            clusters[-1].append(s)
        else:
            clusters.append([s])
    zones = [{"price": float(np.mean(c)), "touches": len(c)} for c in clusters if len(c) >= 2]
    res = sorted([z for z in zones if z["price"] > price * 1.001], key=lambda z: z["price"])[:2]
    sup = sorted([z for z in zones if z["price"] < price * 0.999], key=lambda z: -z["price"])[:2]
    out = []
    for k, v in piv.items():
        out.append({"label": k, "price": float(v), "kind": "pivot" if k == "PIVOT" else ("resistance" if k.startswith("R") else "support"),
                    "touches": sum(1 for s in swings if abs(s - v) <= tol), "source": "pivot"})
    for i, z in enumerate(res):
        out.append({"label": f"RZ{i + 1}", "price": z["price"], "kind": "resistance", "touches": z["touches"], "source": "swing"})
    for i, z in enumerate(sup):
        out.append({"label": f"SZ{i + 1}", "price": z["price"], "kind": "support", "touches": z["touches"], "source": "swing"})
    mx = max([l["touches"] for l in out] + [1])
    for l in out:
        l["strength"] = round(min(100, 30 + 70 * l["touches"] / mx))
        l["dist_pct"] = (l["price"] / price - 1) * 100
    return sorted(out, key=lambda l: -l["price"])


def _simulate(asset, bars, tf):
    cfg = TF[tf]
    crypto = asset["kind"] == "crypto"
    H = cfg["h"][1 if crypto else 0]
    bpy = cfg["bpy"][1 if crypto else 0]
    closes = np.array([b["c"] for b in bars], dtype=float)
    if len(closes) < 30:
        raise HTTPException(422, "Not enough price history to model this asset yet")
    live = asset.get("price") or closes[-1]
    price = float(live if abs(live / closes[-1] - 1) < 0.25 else closes[-1])
    rets = np.diff(np.log(closes))
    rets = rets[np.isfinite(rets)]
    sd = float(rets.std(ddof=1))
    lam = 0.94
    ew = float(np.sqrt(np.average(rets[-200:] ** 2, weights=lam ** np.arange(len(rets[-200:]))[::-1])))
    sigma = max(1e-5, 0.5 * sd + 0.5 * ew)
    mu_hist = float(rets.mean())
    # momentum + mean-reversion tilt from the signal stack, then shrink drift hard toward zero
    ema_f, ema_s = _ema(closes, 12), _ema(closes, 26)
    macd = ema_f - ema_s
    sig_line = _ema(macd, 9)
    hist_now = float(macd[-1] - sig_line[-1])
    rsi = _rsi(closes)
    sma20 = float(closes[-20:].mean())
    sma50 = float(closes[-50:].mean()) if len(closes) >= 50 else float(closes.mean())
    trend = (1 if price > sma20 else -1) + (1 if sma20 > sma50 else -1)
    mom = float(closes[-1] / closes[max(0, len(closes) - 21)] - 1)
    score = 0.35 * np.tanh(trend / 2) + 0.25 * np.tanh(hist_now / (price * sigma + 1e-9)) + 0.2 * np.tanh(mom / (sigma * 4.6 + 1e-9)) \
        + 0.2 * (-(rsi - 50) / 50 if rsi > 70 or rsi < 30 else (rsi - 50) / 100)
    # total drift over the horizon is capped at ±0.35σ√H so the cone stays honest about uncertainty
    cap = 0.35 * sigma / math.sqrt(H)
    mu = float(np.clip(0.3 * mu_hist + 0.25 * float(score) * sigma / math.sqrt(H), -cap, cap))
    # Student-t innovations (df=4) scaled to unit variance: fat tails for crypto and earnings gaps
    rng = np.random.default_rng(abs(hash((asset["sym"], tf, int(time.time() // TTL)))) % (2 ** 32))
    df_t = 4
    z = rng.standard_t(df_t, size=(N_PATHS, H)) / math.sqrt(df_t / (df_t - 2))
    steps = (mu - 0.5 * sigma ** 2) + sigma * z
    paths = price * np.exp(np.cumsum(steps, axis=1))
    paths = np.hstack([np.full((N_PATHS, 1), price), paths])
    pct = np.percentile(paths, [5, 25, 50, 75, 95], axis=0)
    mean_path = paths.mean(axis=0)
    final = paths[:, -1]
    rets_f = final / price - 1
    sig_h = sigma * math.sqrt(H)
    levels = _levels(bars, price, price * sigma * math.sqrt(max(1, H / 4)))
    r1 = next((l for l in sorted(levels, key=lambda l: l["price"]) if l["kind"] == "resistance" and l["price"] > price), None)
    s1 = next((l for l in sorted(levels, key=lambda l: -l["price"]) if l["kind"] == "support" and l["price"] < price), None)
    pmax, pmin = paths.max(axis=1), paths.min(axis=1)
    var95 = float(-np.percentile(rets_f, 5))
    cvar95 = float(-rets_f[rets_f <= np.percentile(rets_f, 5)].mean())
    k = max(sig_h, 0.005)
    p_up = float((final > price).mean())
    bull = float((rets_f > 0.5 * k).mean())
    bear = float((rets_f < -0.5 * k).mean())
    # thin the path for the chart (<= 60 projection points)
    stride = max(1, H // 60)
    idx = list(range(0, H + 1, stride))
    if idx[-1] != H:
        idx.append(H)
    # calendar span of the horizon, spread evenly across projection bars (stock sessions skip nights/weekends)
    span = {"1D": 6.5 * 3600 if not crypto else 86400, "1W": 7 * 86400, "1M": 30 * 86400, "3M": 90 * 86400}[tf]
    t0 = bars[-1]["t"]
    proj = [{"t": t0 + span * i / H, "p5": float(pct[0][i]), "p25": float(pct[1][i]),
             "p50": float(pct[2][i]), "p75": float(pct[3][i]), "p95": float(pct[4][i]), "mean": float(mean_path[i])} for i in idx]
    # show ~3 horizons of history so the cone has room to breathe
    cut = t0 - 3 * span if tf != "1D" else t0 - (2 * 86400 if crypto else 1.2 * 86400)
    shown = [b for b in bars if b["t"] >= cut] or bars
    if len(shown) < 30:
        shown = bars[-30:]
    bars_v = shown
    hstride = max(1, len(bars_v) // 140)
    hist = [{"t": b["t"], "c": float(b["c"])} for b in bars_v[::hstride]]
    if hist[-1]["t"] != bars[-1]["t"]:
        hist.append({"t": bars[-1]["t"], "c": float(bars[-1]["c"])})
    hist[-1]["c"] = price
    edges = np.linspace(np.percentile(final, 1), np.percentile(final, 99), 25)
    counts, _ = np.histogram(np.clip(final, edges[0], edges[-1]), bins=edges)
    dist = [{"price": float((edges[i] + edges[i + 1]) / 2), "prob": float(counts[i] / N_PATHS)} for i in range(len(counts))]
    ann_vol = sigma * math.sqrt(bpy)
    vol_rank = float((np.abs(rets[-len(rets) // 4:]).mean() / (np.abs(rets).mean() + 1e-12)))
    signal = "BULLISH" if score > 0.12 else "BEARISH" if score < -0.12 else "NEUTRAL"
    conf = int(round(min(92, 50 + abs(float(score)) * 55 + abs(p_up - 0.5) * 60)))
    return {
        "sym": asset["sym"], "name": asset["name"], "kind": asset["kind"], "tf": tf, "tf_label": cfg["label"], "bar": cfg["unit"],
        "price": price, "horizon_bars": H, "paths": N_PATHS, "history": hist, "projection": proj, "levels": levels,
        "scenarios": {
            "best": {"price": float(pct[4][-1]), "ret": float(pct[4][-1] / price - 1), "label": "Best case · 95th pct"},
            "bull": {"price": float(pct[3][-1]), "ret": float(pct[3][-1] / price - 1), "label": "Bull · 75th pct"},
            "base": {"price": float(pct[2][-1]), "ret": float(pct[2][-1] / price - 1), "label": "Average case · median"},
            "bear": {"price": float(pct[1][-1]), "ret": float(pct[1][-1] / price - 1), "label": "Bear · 25th pct"},
            "worst": {"price": float(pct[0][-1]), "ret": float(pct[0][-1] / price - 1), "label": "Worst case · 5th pct"},
            "mean": {"price": float(mean_path[-1]), "ret": float(mean_path[-1] / price - 1), "label": "Expected (mean)"},
        },
        "probabilities": {
            "up": p_up, "down": 1 - p_up, "bull": bull, "bear": bear, "neutral": max(0.0, 1 - bull - bear),
            "gain_1sigma": float((rets_f > k).mean()), "loss_1sigma": float((rets_f < -k).mean()),
            "gain_10": float((rets_f > 0.10).mean()), "loss_10": float((rets_f < -0.10).mean()),
            "touch_r1": float((pmax >= r1["price"]).mean()) if r1 else None, "touch_s1": float((pmin <= s1["price"]).mean()) if s1 else None,
            "r1": r1["price"] if r1 else None, "s1": s1["price"] if s1 else None, "move_pct": k,
        },
        "risk": {"var95": var95, "cvar95": cvar95, "var95_usd_per_1k": var95 * 1000, "ann_vol": ann_vol, "sigma_bar": sigma,
                 "vol_regime": "EXPANDING" if vol_rank > 1.15 else "COMPRESSING" if vol_rank < 0.85 else "STABLE", "vol_ratio": vol_rank,
                 "max_dd_median": float(np.median(pmin / price - 1))},
        "signals": {"signal": signal, "confidence": conf, "score": float(score), "rsi": rsi, "macd_hist": hist_now, "sma20": sma20, "sma50": sma50,
                    "trend": "UP" if trend > 0 else "DOWN" if trend < 0 else "FLAT", "momentum": mom,
                    "stack": [
                        {"k": "Trend (SMA20/50)", "v": "UP" if trend > 0 else "DOWN" if trend < 0 else "MIXED", "tone": "bull" if trend > 0 else "bear" if trend < 0 else "muted"},
                        {"k": "RSI 14", "v": f"{rsi:.1f}", "tone": "bear" if rsi > 70 else "bull" if rsi < 30 else "muted"},
                        {"k": "MACD histogram", "v": "RISING" if hist_now > 0 else "FALLING", "tone": "bull" if hist_now > 0 else "bear"},
                        {"k": "Momentum", "v": f"{mom * 100:+.2f}%", "tone": "bull" if mom > 0 else "bear"},
                        {"k": "Vol regime", "v": "EXPANDING" if vol_rank > 1.15 else "COMPRESSING" if vol_rank < 0.85 else "STABLE", "tone": "muted"},
                    ]},
        "distribution": dist,
        "model": f"Student-t Monte Carlo · {N_PATHS:,} paths · EWMA σ · drift shrunk toward 0",
        "updated": time.time(),
    }


async def predict(asset: dict, tf: str) -> dict:
    if tf not in TF:
        raise HTTPException(400, "Unknown timeframe")
    key = (asset["sym"], tf)
    hit = _cache.get(key)
    if hit and time.time() - hit["updated"] < TTL:
        return hit
    try:
        bars, src = await run_in_threadpool(_history, asset, tf)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, f"Price history for {asset['sym']} is unavailable right now — try again shortly")
    out = await run_in_threadpool(_simulate, asset, bars, tf)
    out["source"] = src
    _cache[key] = out
    return out


def narrative_context(p: dict) -> str:
    s, pr, rk, sg = p["scenarios"], p["probabilities"], p["risk"], p["signals"]
    lv = ", ".join(f"{l['label']} {l['price']:.4g} ({l['kind']}, {l['touches']} touches)" for l in p["levels"])
    return (f"{p['sym']} ({p['name']}, {p['kind']}) · horizon {p['tf_label']} · price {p['price']:.6g}.\n"
            f"Monte Carlo ({p['model']}): best {s['best']['price']:.6g} ({s['best']['ret']:+.1%}), average/median {s['base']['price']:.6g} "
            f"({s['base']['ret']:+.1%}), worst {s['worst']['price']:.6g} ({s['worst']['ret']:+.1%}).\n"
            f"P(up) {pr['up']:.0%}, P(bull) {pr['bull']:.0%}, P(bear) {pr['bear']:.0%}, P(touch R1) {pr['touch_r1']}, P(touch S1) {pr['touch_s1']}.\n"
            f"Risk: VaR95 {rk['var95']:.1%}, CVaR95 {rk['cvar95']:.1%}, annualized vol {rk['ann_vol']:.0%}, regime {rk['vol_regime']}.\n"
            f"Signals: {sg['signal']} conf {sg['confidence']}, RSI {sg['rsi']:.1f}, MACD hist {'+' if sg['macd_hist'] > 0 else '-'}, trend {sg['trend']}, momentum {sg['momentum']:+.2%}.\n"
            f"Levels: {lv}.")

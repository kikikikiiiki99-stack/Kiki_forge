SNAPSHOT_DATE = "Oct 20, 2026"

TIERS = [
    {"id": 1, "name": "ROOKIE", "price": "$0", "amount_cents": 0, "tag": "Core desk", "look": "Plain ledger", "perks": ["Feed (4 names)", "Quotes", "Watchlist", "Live markets"]},
    {"id": 2, "name": "STARTER", "price": "$19/mo", "amount_cents": 1900, "tag": "Paper desk", "look": "Blueprint dots", "perks": ["Paper trading", "Dot-grid field"]},
    {"id": 3, "name": "TRADER", "price": "$49/mo", "amount_cents": 4900, "tag": "Day desk", "look": "Scanline day desk", "perks": ["Full feed", "Watchlist export"]},
    {"id": 4, "name": "PRO", "price": "$99/mo", "amount_cents": 9900, "tag": "Pro terminal", "look": "Split frames", "perks": ["Heat map", "Order log"]},
    {"id": 5, "name": "ELITE", "price": "$149/mo", "amount_cents": 14900, "tag": "Catalyst desk", "look": "HUD brackets", "perks": ["Catalyst scanner", "Elite glow"]},
    {"id": 6, "name": "ALPHA", "price": "$249/mo", "amount_cents": 24900, "tag": "Alpha HUD", "look": "Dual HUD", "perks": ["Session intel", "Dual accent"]},
    {"id": 7, "name": "QUANTUM", "price": "$399/mo", "amount_cents": 39900, "tag": "Deep brief", "look": "Iridescent frames", "perks": ["Deep advisor brief", "Quantum finish"]},
    {"id": 8, "name": "NEURAL", "price": "$599/mo", "amount_cents": 59900, "tag": "Neural HUD", "look": "Max glass", "perks": ["Max glass", "Neural rings"]},
    {"id": 9, "name": "GOD", "price": "$999/mo", "amount_cents": 99900, "tag": "Gold terminal", "look": "Gold foil", "perks": ["Gold theme", "Ambient wash"]},
    {"id": 10, "name": "SINGULARITY", "price": "$2,499/mo", "amount_cents": 249900, "tag": "Ultimate", "look": "Void singularity", "perks": ["Every feature", "Peak particles"]},
]

GATES = {"paper": 2, "fullFeed": 3, "export": 3, "heat": 4, "orderLog": 4, "catalysts": 5, "intel": 6, "deepBrief": 7}

DASHBOARD = {
    "stats": [
        {"label": "SPY", "value": "$768.80", "sub": "+0.30%", "tone": "bull"},
        {"label": "QQQ", "value": "$719.20", "sub": "+0.15%", "tone": "bull"},
        {"label": "VIX", "value": "~18", "sub": "elevated", "tone": "muted"},
        {"label": "Tone", "value": "Mixed", "sub": "dispersion", "tone": "accent"},
    ],
    "intel": "TSLA firm into earnings (~Oct 21). META softer on the session. NVDA near $217 after a pullback from the ~$243 region. VIX eased from ~20 into the high teens.",
}

TICKERS = [
    {"sym": "NVDA", "name": "NVIDIA", "price": 216.9, "chg": -0.1, "cap": "$5.23T", "capN": 5230, "range52": "$164–$243", "range1d": "$212–$221", "avgVol": "214M", "note": "AI GPUs · off the ~$243 high zone", "conf": 62, "bias": "Neutral-Bull", "vol": "High", "insider": "Mixed", "catalysts": [["Pullback from highs", "Recent"], ["AI demand narrative", "Ongoing"]], "hist": [212, 214, 218, 221, 219, 216, 215, 217, 216.5, 216.9]},
    {"sym": "AMD", "name": "AMD", "price": 539.5, "chg": 0.3, "cap": "$881B", "capN": 881, "range52": "—", "range1d": "$528–$545", "avgVol": "48M", "note": "Data center · strong YTD", "conf": 58, "bias": "Bull", "vol": "Elevated", "insider": "Constructive", "catalysts": [["Data-center GPU share", "Theme"]], "hist": [520, 525, 530, 528, 535, 538, 536, 540, 539, 539.5]},
    {"sym": "TSLA", "name": "Tesla", "price": 374.0, "chg": 1.6, "cap": "$1.48T", "capN": 1480, "range52": "$297–$499", "range1d": "$362–$378", "avgVol": "98M", "note": "Earnings ~Oct 21 · session leader", "conf": 71, "bias": "Bull", "vol": "Very High", "insider": "Event-driven", "catalysts": [["Earnings", "~Oct 21"], ["Session strength", "Today"]], "hist": [355, 360, 358, 365, 368, 370, 372, 371, 373, 374]},
    {"sym": "META", "name": "Meta", "price": 690.0, "chg": -2.15, "cap": "$1.76T", "capN": 1760, "range52": "$520–$780", "range1d": "$676–$702", "avgVol": "14M", "note": "Earnings ~Oct 21 · soft session", "conf": 48, "bias": "Cautious", "vol": "High", "insider": "Pre-earnings", "catalysts": [["Earnings", "~Oct 21"], ["Soft tape", "Today"]], "hist": [720, 715, 710, 705, 700, 695, 698, 692, 688, 690]},
    {"sym": "AAPL", "name": "Apple", "price": 340.8, "chg": -0.6, "cap": "$4.97T", "capN": 4970, "range52": "$243–$348", "range1d": "$338–$344", "avgVol": "56M", "note": "Services + hardware", "conf": 54, "bias": "Neutral", "vol": "Normal", "insider": "Stable", "catalysts": [["Product cycle", "Ongoing"]], "hist": [338, 339, 341, 342, 341.5, 340, 341, 340.5, 341, 340.8]},
    {"sym": "MSFT", "name": "Microsoft", "price": 531.5, "chg": -0.35, "cap": "$3.95T", "capN": 3950, "range52": "$349–$554", "range1d": "$527–$536", "avgVol": "22M", "note": "Cloud + Copilot", "conf": 56, "bias": "Neutral-Bull", "vol": "Normal", "insider": "Stable", "catalysts": [["Azure / AI", "Theme"]], "hist": [528, 530, 533, 532, 531, 534, 532, 531, 532, 531.5]},
    {"sym": "GOOGL", "name": "Alphabet", "price": 341.5, "chg": -0.75, "cap": "$4.15T", "capN": 4150, "range52": "$244–$409", "range1d": "$339–$346", "avgVol": "26M", "note": "Search + Cloud", "conf": 53, "bias": "Neutral", "vol": "Normal", "insider": "Stable", "catalysts": [["Cloud growth", "Theme"]], "hist": [345, 344, 343, 342, 341, 342, 341.8, 341.2, 341.6, 341.5]},
    {"sym": "AMZN", "name": "Amazon", "price": 263.0, "chg": 0.25, "cap": "$2.84T", "capN": 2840, "range52": "$196–$287", "range1d": "$259–$266", "avgVol": "39M", "note": "AWS + retail", "conf": 60, "bias": "Bull", "vol": "Normal", "insider": "Constructive", "catalysts": [["AWS", "Theme"]], "hist": [258, 259, 260, 261, 262, 261.5, 262.5, 262.8, 263.1, 263]},
    {"sym": "SPY", "name": "S&P 500 ETF", "price": 768.8, "chg": 0.3, "cap": "—", "capN": 0, "range52": "$629–$782", "range1d": "$763–$771", "avgVol": "74M", "note": "Broad beta", "conf": 55, "bias": "Neutral-Bull", "vol": "Normal", "insider": "N/A", "catalysts": [["Index beta", "—"]], "hist": [762, 764, 765, 766, 767, 766.5, 767.5, 768, 768.5, 768.8]},
    {"sym": "QQQ", "name": "Nasdaq-100", "price": 719.2, "chg": 0.15, "cap": "—", "capN": 0, "range52": "—", "range1d": "$712–$721", "avgVol": "41M", "note": "Tech beta", "conf": 52, "bias": "Neutral", "vol": "Normal", "insider": "N/A", "catalysts": [["Tech beta", "—"]], "hist": [710, 712, 715, 714, 716, 717, 718, 717.5, 718.8, 719.2]},
]

PRICES = {t["sym"]: t["price"] for t in TICKERS}

MAG7 = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA"]

LIVE_CRYPTO = [
    ["bitcoin", "BTC", "Bitcoin"],
    ["ethereum", "ETH", "Ethereum"],
    ["solana", "SOL", "Solana"],
    ["binancecoin", "BNB", "BNB"],
    ["ripple", "XRP", "XRP"],
    ["dogecoin", "DOGE", "Dogecoin"],
]
LIVE_STOCKS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "META"]

START_CASH = 100000.0
DEFAULT_WATCH = ["NVDA", "AMD", "TSLA", "META", "SPY"]


def snapshot():
    return {
        "snapshotDate": SNAPSHOT_DATE,
        "tiers": [{k: v for k, v in t.items() if k != "amount_cents"} for t in TIERS],
        "gates": GATES,
        "dashboard": DASHBOARD,
        "tickers": TICKERS,
        "mag7": MAG7,
        "liveCrypto": LIVE_CRYPTO,
        "liveStocks": LIVE_STOCKS,
    }


def snapshot_context():
    rows = [f"{t['sym']} {t['price']} ({t['chg']:+}%) conf {t['conf']} bias {t['bias']} — {t['note']}" for t in TICKERS]
    return f"Session snapshot {SNAPSHOT_DATE}:\n" + "\n".join(rows) + f"\nIntel: {DASHBOARD['intel']}"

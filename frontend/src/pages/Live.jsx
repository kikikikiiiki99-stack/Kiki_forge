import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSF } from "@/context/SFContext";
import { Hero, Chg } from "@/components/sf/ui";
import { Sparkline } from "@/components/sf/Sparkline";
import { priceFmt } from "@/lib/theme";

const quant = (a) => {
  const s = a.spark || [];
  if (s.length < 10) return "Not enough history for the quant model yet.";
  const n = s.length, xs = s.map((_, i) => i), mx = (n - 1) / 2, my = s.reduce((x, y) => x + y, 0) / n;
  const slope = xs.reduce((acc, x, i) => acc + (x - mx) * (s[i] - my), 0) / xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  const slopePct = ((slope * 24) / my) * 100;
  const last24 = s.slice(-24), mom = ((last24[last24.length - 1] - last24[0]) / last24[0]) * 100;
  const hi = Math.max(...s), lo = Math.min(...s), pos = ((a.price - lo) / (hi - lo || 1)) * 100;
  const trend = slopePct > 0.4 ? "UPTREND" : slopePct < -0.4 ? "DOWNTREND" : "SIDEWAYS";
  const b = a.bands;
  return [
    `TREND      ${trend} · regression slope ${slopePct >= 0 ? "+" : ""}${slopePct.toFixed(2)}%/day`,
    `MOMENTUM   ${mom >= 0 ? "+" : ""}${mom.toFixed(2)}% over the last 24 points`,
    `RANGE      7d low ${priceFmt(lo)} · high ${priceFmt(hi)} · price sits at ${pos.toFixed(0)}% of range`,
    b ? `BANDS      24h ±1σ ${priceFmt(b.d1[0])} – ${priceFmt(b.d1[1])} · 7d ±1σ ${priceFmt(b.d7[0])} – ${priceFmt(b.d7[1])}` : "BANDS      unavailable",
    `READ       ${trend === "UPTREND" && pos > 70 ? "Extended near highs — momentum intact but chase risk is elevated." : trend === "DOWNTREND" && pos < 30 ? "Pressed near lows — watch for capitulation or a reflex bounce." : "Balanced tape — let price confirm a break of the band before leaning."}`,
  ].join("\n");
};

const LiveCard = ({ a }) => (
  <div className="sf-panel sf-hover p-5 rise" data-testid={`live-card-${a.sym}`}>
    <div className="flex justify-between">
      <div><p className="font-disp text-xl font-bold">{a.sym}</p><p className="text-xs text-neutral-500 truncate max-w-[150px]">{a.name}</p></div>
      <div className="text-right"><p className="font-mono text-lg" data-testid={`live-price-${a.sym}`}>{priceFmt(a.price)}</p><Chg v={a.chg} className="text-xs" /></div>
    </div>
    <div className="my-3"><Sparkline data={a.spark} w={300} h={50} /></div>
    <div className="font-mono text-[10px] text-neutral-500 space-y-0.5">
      <p>7D <span className={a.chg7 >= 0 ? "bull" : "bear"}>{a.chg7 >= 0 ? "+" : ""}{(a.chg7 || 0).toFixed(2)}%</span>{a.stale && <span className="ml-2 text-amber-400">SNAPSHOT</span>}</p>
      {a.bands && <p>24H ±1σ {priceFmt(a.bands.d1[0])} – {priceFmt(a.bands.d1[1])}</p>}
    </div>
  </div>
);

export default function Live() {
  const { markets, marketsLoading, refreshMarkets, api } = useSF();
  const assets = [...(markets?.crypto || []), ...(markets?.stocks || [])];
  const [mode, setMode] = useState("quant");
  const [sym, setSym] = useState("BTC");
  const [q, setQ] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    const a = assets.find((x) => x.sym === sym);
    if (!a) return;
    if (mode === "quant") return setOut(quant(a));
    setBusy(true); setOut("");
    try { await api.stream("/analyst", { sym, question: q }, setOut); }
    catch (e) { setOut(`Analyst error: ${e.message}`); }
    finally { setBusy(false); }
  };

  const updated = markets?.updated ? new Date(markets.updated * 1000).toLocaleTimeString() : "—";
  return (
    <section data-testid="page-live">
      <Hero kicker="REAL-TIME" title="Live Markets" sub={markets ? `${markets.sources.crypto} + ${markets.sources.stocks} · updated ${updated} · auto-refresh every minute` : "Connecting to live markets…"}>
        <button className="sf-btn sf-btn-p" onClick={() => refreshMarkets(true)} disabled={marketsLoading} data-testid="live-refresh-button">
          <RefreshCw size={14} className={marketsLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </Hero>
      <p className="kicker mb-3">CRYPTO</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">{(markets?.crypto || []).map((a) => <LiveCard key={a.sym} a={a} />)}</div>
      <p className="kicker mb-3">STOCKS</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">{(markets?.stocks || []).map((a) => <LiveCard key={a.sym} a={a} />)}</div>
      <div className="sf-panel p-6" data-testid="analyst-panel">
        <p className="font-disp text-2xl font-bold mb-4 tracking-wide">AI ANALYST</p>
        <div className="flex flex-wrap gap-2">
          <select className="sf-input" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="analyst-mode-select">
            <option value="quant">Built-in quant model (instant)</option>
            <option value="ai">StockForge AI · Claude (deep analysis)</option>
          </select>
          <select className="sf-input" value={sym} onChange={(e) => setSym(e.target.value)} data-testid="analyst-asset-select">
            {assets.map((a) => <option key={a.sym} value={a.sym}>{a.sym} · {a.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-3">
          <input className="sf-input flex-1" placeholder="e.g. Trend, risks and what the 7-day data suggests" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()} data-testid="analyst-question-input" />
          <button className="sf-btn sf-btn-p" onClick={analyze} disabled={busy} data-testid="analyst-analyze-button">{busy ? "Thinking…" : "Analyze"}</button>
        </div>
        {(out || busy) && <pre className={`mt-5 whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-neutral-200 border-l-2 border-[var(--a)] pl-4 ${busy ? "caret" : ""}`} data-testid="analyst-output">{out}</pre>}
      </div>
      <p className="font-mono text-[10px] text-neutral-600 mt-4 max-w-4xl leading-relaxed">Crypto from CoinGecko, stocks from Yahoo Finance, refreshed every minute through the StockForge server. Last prices are saved so the app still opens offline. Bands are a ±1σ envelope from the last 7 days of hourly prices. No model can predict price reliably.</p>
    </section>
  );
}

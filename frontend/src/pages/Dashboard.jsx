import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSF } from "@/context/SFContext";
import { Hero, Stat, Chg } from "@/components/sf/ui";
import { Locked } from "@/components/sf/Locked";
import { AIInsights } from "@/components/sf/AIInsights";
import { money, pct, priceFmt } from "@/lib/theme";

const heatColor = (c) => {
  const a = Math.min(Math.abs(c) / 2.2, 1) * 0.75 + 0.12;
  return c >= 0 ? `rgba(16,185,129,${a})` : `rgba(239,68,68,${a})`;
};
// Model bias → predicted direction (+1 up, -1 down, 0 flat).
const dirOf = (bias) => (/bear|cautious/i.test(bias) ? -1 : /bull/i.test(bias) ? 1 : 0);
const hit = (t) => { const d = dirOf(t.bias); return d === 0 ? Math.abs(t.chg) < 0.5 : Math.sign(t.chg) === d; };
const TIP = { background: "#0D131F", border: "1px solid #1E293B", borderRadius: 6, fontFamily: "JetBrains Mono Variable", fontSize: 12 };
const AX = { fill: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono Variable" };

const PriceChart = () => {
  const { snap, markets, me } = useSF();
  const series = useMemo(() => {
    const out = {};
    me.watch.forEach((s) => { const t = snap.tickers.find((x) => x.sym === s); if (t) out[s] = { label: "session", pts: t.hist }; });
    (markets?.crypto || []).slice(0, 3).forEach((c) => { if (c.spark?.length) out[c.sym] = { label: "7d hourly · live", pts: c.spark.filter((_, i) => i % 3 === 0) }; });
    return out;
  }, [snap, markets, me.watch]);
  const keys = Object.keys(series);
  const [sel, setSel] = useState(keys[0]);
  const cur = series[sel] || series[keys[0]];
  const data = (cur?.pts || []).map((v, i) => ({ i: i + 1, v }));
  const up = data.length > 1 && data[data.length - 1].v >= data[0].v;
  const col = up ? "#10B981" : "#EF4444";
  return (
    <div className="sf-panel p-5 lg:col-span-8" data-testid="dash-price-chart">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="lab !mb-0">PRICE · {sel || "—"} <span className="text-neutral-600 normal-case tracking-normal">{cur?.label}</span></div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {keys.map((k) => (
            <button key={k} role="tab" aria-selected={k === sel} onClick={() => setSel(k)} data-testid={`chart-sym-${k}`}
              className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors duration-150 ${k === sel ? "border-[var(--a)] text-white bg-[var(--a-soft)]" : "border-slate-800 text-neutral-400 hover:text-white"}`}>{k}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={0.35} /><stop offset="100%" stopColor={col} stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="i" tick={AX} axisLine={false} tickLine={false} />
          <YAxis domain={["auto", "auto"]} tick={AX} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => priceFmt(v)} />
          <Tooltip contentStyle={TIP} formatter={(v) => [priceFmt(v), sel]} labelFormatter={(l) => `point ${l}`} />
          <Area type="monotone" dataKey="v" stroke={col} strokeWidth={2} fill="url(#pc)" isAnimationActive animationDuration={600} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function Dashboard() {
  const { snap, me, openTicker, notes } = useSF();
  const moves = snap.tickers.map((t) => ({ sym: t.sym, chg: t.chg }));
  const sorted = [...snap.tickers].sort((a, b) => b.chg - a.chg);
  const watched = snap.tickers.filter((t) => me.watch.includes(t.sym));
  const watchAvg = watched.length ? watched.reduce((s, t) => s + t.chg, 0) / watched.length : 0;
  const hits = snap.tickers.filter(hit).length;
  const acc = (hits / snap.tickers.length) * 100;
  const alerts = Object.values(me.alerts || {});
  const armed = alerts.filter((a) => !a.triggered_at).length;
  return (
    <section data-testid="page-dash">
      <Hero kicker="DESK OVERVIEW" title="Dashboard" sub="Movers · watchlist performance · prediction accuracy · AI insights" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <Stat label="Top gainer" value={sorted[0].sym} sub={pct(sorted[0].chg)} tone="bull" testid="kpi-top-gainer" />
        <Stat label="Top loser" value={sorted[sorted.length - 1].sym} sub={pct(sorted[sorted.length - 1].chg)} tone="bear" testid="kpi-top-loser" />
        <Stat label="Watchlist avg" value={pct(watchAvg)} sub={`${watched.length} names`} tone={watchAvg >= 0 ? "bull" : "bear"} testid="kpi-watch-avg" />
        <Stat label="Prediction accuracy" value={`${acc.toFixed(0)}%`} sub={`${hits}/${snap.tickers.length} bias calls matched the move`} tone="accent" testid="kpi-prediction-accuracy" />
        <Stat label="Alerts" value={armed} sub={`${alerts.length - armed} triggered · ${notes.unread} unread`} testid="kpi-alerts" />
        <Stat label="Paper equity" value={money(me.equity_now, 0)} sub={`${me.positions.length} positions`} testid="kpi-equity" />
      </div>
      <div className="grid lg:grid-cols-12 gap-4">
        <PriceChart />
        <div className="sf-panel p-5 lg:col-span-4" data-testid="dash-movers">
          <div className="lab">MARKET MOVERS</div>
          {[["GAINERS", sorted.slice(0, 3)], ["LAGGARDS", sorted.slice(-3).reverse()]].map(([h, rows]) => (
            <div key={h} className="mb-4 last:mb-0">
              <p className="font-mono text-[10px] text-neutral-500 mb-1.5">{h}</p>
              {rows.map((t) => (
                <button key={t.sym} onClick={() => openTicker(t.sym)} className="w-full flex items-center justify-between py-2 border-b border-slate-800/70 last:border-0 hover:bg-white/[0.03] transition-colors duration-150 px-1 rounded" data-testid={`mover-${t.sym}`}>
                  <span className="text-left"><b className="font-mono">{t.sym}</b> <span className="text-xs text-neutral-500">{t.name}</span></span>
                  <span className="flex items-center gap-3"><span className="font-mono text-sm">{money(t.price)}</span><Chg v={t.chg} className="text-xs w-16 text-right" /></span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="lg:col-span-7"><AIInsights /></div>
        <div className="sf-panel p-5 lg:col-span-5" data-testid="dash-moves-chart">
          <div className="lab">SESSION MOVES</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={moves}>
              <XAxis dataKey="sym" tick={AX} axisLine={false} tickLine={false} />
              <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={TIP} formatter={(v) => pct(v)} />
              <Bar dataKey="chg" radius={[3, 3, 0, 0]}>{moves.map((m) => <Cell key={m.sym} fill={m.chg >= 0 ? "#10B981" : "#EF4444"} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Locked gate="heat" label="Heat map" className="lg:col-span-5">
          <div className="sf-panel p-5 h-full">
            <div className="lab">HEAT MAP</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5 gap-1.5" data-testid="dash-heat-map">
              {snap.tickers.map((t) => (
                <button key={t.sym} onClick={() => openTicker(t.sym)} className="aspect-square rounded flex flex-col items-center justify-center transition-transform duration-150 hover:scale-105" style={{ background: heatColor(t.chg) }} data-testid={`heat-cell-${t.sym}`}>
                  <span className="font-disp font-bold">{t.sym}</span><span className="font-mono text-[10px]">{pct(t.chg)}</span>
                </button>
              ))}
            </div>
          </div>
        </Locked>
        <Locked gate="intel" label="Session intel" className="lg:col-span-7">
          <div className="sf-panel p-5 h-full">
            <div className="lab">SESSION INTEL</div>
            <p className="text-neutral-300 leading-relaxed max-w-4xl" data-testid="dash-intel">{snap.dashboard.intel}</p>
          </div>
        </Locked>
      </div>
    </section>
  );
}

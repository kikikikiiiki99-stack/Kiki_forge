import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, Bot, Crosshair, Eye, EyeOff, Radar, ShieldAlert, TrendingDown, TrendingUp, X, Zap } from "lucide-react";
import {
  fmtPct, fmtPrice, fmtProb, useForgeApi, type Level, type Prediction, type Timeframe,
} from "@/lib/forge";

const TFS: { id: Timeframe; label: string; sub: string }[] = [
  { id: "1D", label: "1D", sub: "Intraday quantum" },
  { id: "1W", label: "1W", sub: "Swing forecast" },
  { id: "1M", label: "1M", sub: "Macro surface" },
  { id: "3M", label: "3M", sub: "Quarter horizon" },
];

const C = { best: "#34D399", avg: "#38BDF8", worst: "#F87171", mean: "#E2E8F0", sup: "#38BDF8", res: "#F472B6", pivot: "#FBBF24", cyan: "#00F0FF" };

interface ChartRow {
  t: number;
  c?: number;
  p5?: number; p25?: number; p50?: number; p75?: number; p95?: number; mean?: number;
  band95?: [number, number];
  band50?: [number, number];
}

const tickTime = (tf: Timeframe) => (t: number) => {
  const d = new Date(t * 1000);
  return tf === "1D" ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function buildRows(p: Prediction): ChartRow[] {
  const hist: ChartRow[] = p.history.map((h) => ({ t: h.t, c: h.c }));
  const proj: ChartRow[] = p.projection.map((q, i) => ({
    t: q.t, p5: q.p5, p25: q.p25, p50: q.p50, p75: q.p75, p95: q.p95, mean: q.mean,
    band95: [q.p5, q.p95], band50: [q.p25, q.p75], c: i === 0 ? p.price : undefined,
  }));
  if (hist.length && proj.length) proj[0].t = hist[hist.length - 1].t;
  hist.pop();
  return [...hist, ...proj];
}

const levelColor = (l: Level) => (l.kind === "support" ? C.sup : l.kind === "resistance" ? C.res : C.pivot);

interface TipProps { active?: boolean; payload?: { payload: ChartRow }[]; tf: Timeframe }
const ChartTip = ({ active, payload, tf }: TipProps) => {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="font-mono text-[11px] bg-[#0B0F19]/95 border border-[#00F0FF]/40 px-3 py-2 shadow-[0_0_20px_rgba(0,240,255,0.15)]">
      <p className="text-slate-400 mb-1">{tickTime(tf)(r.t)}</p>
      {r.c != null && r.p50 == null && <p className="text-white">PRICE {fmtPrice(r.c)}</p>}
      {r.p95 != null && <p style={{ color: C.best }}>BEST {fmtPrice(r.p95)}</p>}
      {r.p50 != null && <p style={{ color: C.avg }}>AVG {fmtPrice(r.p50)}</p>}
      {r.p5 != null && <p style={{ color: C.worst }}>WORST {fmtPrice(r.p5)}</p>}
    </div>
  );
};

const ProbBar = ({ label, value, tone, testid }: { label: string; value: number | null; tone: "bull" | "bear" | "cyan"; testid: string }) => {
  const col = tone === "bull" ? C.best : tone === "bear" ? C.worst : C.cyan;
  const v = value ?? 0;
  return (
    <div data-testid={testid}>
      <div className="flex justify-between font-mono text-[10px] tracking-widest uppercase text-slate-400 mb-1">
        <span>{label}</span><span style={{ color: col }}>{value == null ? "—" : fmtProb(v)}</span>
      </div>
      <div className="h-1.5 bg-white/5 relative overflow-hidden flex gap-[2px]">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.span key={i} className="flex-1 h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{ background: i < Math.round(v * 20) ? col : "rgba(255,255,255,0.04)", boxShadow: i < Math.round(v * 20) ? `0 0 6px ${col}` : "none" }} />
        ))}
      </div>
    </div>
  );
};

const Hud = ({ children, className = "", testid }: { children: React.ReactNode; className?: string; testid?: string }) => (
  <div className={`fx-hud-box relative bg-[#0D1117]/85 backdrop-blur-xl border border-[#1E293B] p-4 ${className}`} data-testid={testid}>{children}</div>
);

export interface PredictionDialogProps {
  sym: string | null;
  onClose: () => void;
  onTrade: (sym: string) => void;
  onToggleWatch: (sym: string) => void;
  watching: boolean;
  canTrade: boolean;
}

export default function PredictionDialog({ sym, onClose, onTrade, onToggleWatch, watching, canTrade }: PredictionDialogProps) {
  const api = useForgeApi();
  const [tf, setTf] = useState<Timeframe>("1W");
  const [show, setShow] = useState({ levels: true, cone: true, paths: true });
  const [brief, setBrief] = useState("");
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefErr, setBriefErr] = useState("");

  useEffect(() => { setBrief(""); setBriefErr(""); }, [sym, tf]);
  useEffect(() => {
    if (!sym) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sym, onClose]);

  const q = useQuery({
    queryKey: ["predict", sym, tf],
    queryFn: () => api.get<Prediction>(`/predict/${encodeURIComponent(sym ?? "")}?tf=${tf}`),
    enabled: !!sym,
    staleTime: 240_000,
    retry: 1,
  });
  const p = q.data && !q.isError ? q.data : undefined;
  const rows = useMemo(() => (p ? buildRows(p) : []), [p]);
  const yDomain = useMemo<[number, number]>(() => {
    if (!p) return [0, 1];
    const vals = [...p.history.map((h) => h.c), ...p.projection.flatMap((x) => [x.p5, x.p95])];
    const lv = show.levels ? p.levels.filter((l) => Math.abs(l.dist_pct) < 40).map((l) => l.price) : [];
    const all = [...vals, ...lv];
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }, [p, show.levels]);

  const runBrief = async () => {
    if (!sym) return;
    setBriefBusy(true); setBriefErr(""); setBrief("");
    try { await api.stream(`/predict/${encodeURIComponent(sym)}/narrative`, { tf }, setBrief); }
    catch (e) { setBriefErr(e instanceof Error ? e.message : "AI briefing failed"); }
    finally { setBriefBusy(false); }
  };

  const sig = p?.signals.signal;
  const sigCol = sig === "BULLISH" ? C.best : sig === "BEARISH" ? C.worst : C.pivot;

  return (
    <AnimatePresence>
      {sym && (
        <motion.div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/75 backdrop-blur-sm p-2 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          data-testid="prediction-overlay">
          <motion.div role="dialog" aria-modal="true" aria-label={`${sym} prediction`}
            className="forecast-shell relative w-full max-w-[1280px] bg-[#0B0F19] border border-[#00F0FF]/30 shadow-[0_0_60px_-10px_rgba(0,240,255,0.35)]"
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }} data-testid="prediction-dialog">
            <span className="hud-corner tl" /><span className="hud-corner tr" /><span className="hud-corner bl" /><span className="hud-corner br" />
            {/* header */}
            <div className="flex flex-wrap items-start gap-4 justify-between px-5 pt-5 pb-4 border-b border-[#1E293B]">
              <div>
                <p className="font-mono text-[10px] tracking-[0.3em] text-[#00F0FF] flex items-center gap-2"><Radar size={12} /> QUANTUM FORECAST ENGINE</p>
                <h2 className="font-forecast text-3xl sm:text-4xl font-bold tracking-wider mt-1 flex items-baseline gap-3" data-testid="prediction-symbol">
                  {sym}<span className="text-sm sm:text-base font-sans font-normal text-slate-400 tracking-normal truncate max-w-[50vw]">{p?.name}</span>
                </h2>
                {p && <p className="font-mono text-xs text-slate-500 mt-1">{p.kind === "crypto" ? "CRYPTO · 24/7" : "NASDAQ EQUITY"} · {p.model} · src {p.source}</p>}
              </div>
              <div className="flex items-center gap-3">
                {p && (
                  <div className="text-right">
                    <p className="font-mono text-2xl font-bold tabular-nums" data-testid="prediction-price">{fmtPrice(p.price)}</p>
                    <p className="font-mono text-[11px] tracking-widest" style={{ color: sigCol }} data-testid="prediction-signal">
                      {sig === "BULLISH" ? "▲" : sig === "BEARISH" ? "▼" : "◆"} {sig} · CONF {p.signals.confidence}
                    </p>
                  </div>
                )}
                <button className="sf-btn sf-btn-sm" onClick={onClose} aria-label="Close prediction" data-testid="prediction-close-button"><X size={14} /></button>
              </div>
            </div>
            {/* timeframe + toggles */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#1E293B] bg-[#07090E]/60">
              <div className="flex gap-1" role="tablist" aria-label="Forecast timeframe">
                {TFS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tf === t.id} onClick={() => setTf(t.id)} data-testid={`timeframe-${t.id.toLowerCase()}-tab`}
                    className={`font-mono text-xs px-3 py-2 border transition-[background-color,border-color,color,box-shadow] duration-150 ${tf === t.id ? "border-[#00F0FF] text-[#00F0FF] bg-[#00F0FF]/10 shadow-[0_0_14px_rgba(0,240,255,0.25)]" : "border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-500"}`}>
                    <b>{t.label}</b><span className="hidden md:inline text-[10px] ml-2 opacity-70">{t.sub}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-1 ml-auto">
                {(["cone", "paths", "levels"] as const).map((k) => (
                  <button key={k} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} data-testid={`toggle-${k}-button`}
                    className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1.5 border flex items-center gap-1.5 transition-colors duration-150 ${show[k] ? "border-slate-500 text-white" : "border-[#1E293B] text-slate-600"}`}>
                    {show[k] ? <Eye size={11} /> : <EyeOff size={11} />}{k === "levels" ? "S/R rails" : k}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 sm:p-5">
              {/* chart */}
              <Hud className="lg:col-span-8 !p-0 overflow-hidden" testid="prediction-chart">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 font-mono text-[10px] tracking-widest uppercase">
                  <span className="text-slate-400">{p ? `${p.tf_label} · ${p.horizon_bars} × ${p.bar} bars · ${p.paths.toLocaleString()} paths` : "SIMULATING…"}</span>
                  <span style={{ color: C.best }}>— — BEST</span><span style={{ color: C.avg }}>━ AVERAGE</span><span style={{ color: C.worst }}>— — WORST</span>
                  <span style={{ color: C.res }}>┄ RESISTANCE</span><span style={{ color: C.sup }}>┄ SUPPORT</span>
                </div>
                <div className="relative h-[360px] sm:h-[440px] scan-viewport">
                  {q.isLoading && (
                    <div className="absolute inset-0 grid place-items-center" data-testid="prediction-loading">
                      <div className="text-center">
                        <div className="forecast-spinner mx-auto" />
                        <p className="font-mono text-xs text-[#00F0FF] mt-4 tracking-[0.3em]">RUNNING 4,000 MONTE CARLO PATHS</p>
                      </div>
                    </div>
                  )}
                  {q.isError && (
                    <div className="absolute inset-0 grid place-items-center p-6 text-center" data-testid="prediction-error">
                      <div><ShieldAlert className="mx-auto text-[#F87171]" /><p className="font-mono text-sm text-slate-300 mt-3">{(q.error as Error).message}</p>
                        <button className="sf-btn sf-btn-sm mt-4" onClick={() => q.refetch()} data-testid="prediction-retry-button">Retry</button></div>
                    </div>
                  )}
                  {p && (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={rows} margin={{ top: 16, right: 64, bottom: 8, left: 8 }}>
                        <defs>
                          <linearGradient id="cone95" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={C.cyan} stopOpacity={0.18} /><stop offset="1" stopColor={C.cyan} stopOpacity={0.05} /></linearGradient>
                          <linearGradient id="cone50" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={C.cyan} stopOpacity={0.3} /><stop offset="1" stopColor={C.cyan} stopOpacity={0.1} /></linearGradient>
                          <linearGradient id="histFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F1F5F9" stopOpacity={0.12} /><stop offset="1" stopColor="#F1F5F9" stopOpacity={0} /></linearGradient>
                          <filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                        </defs>
                        <CartesianGrid stroke="#1E293B" strokeDasharray="2 6" />
                        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tickTime(tf)} tick={{ fill: "#64748B", fontSize: 10, fontFamily: "JetBrains Mono Variable" }} stroke="#1E293B" minTickGap={40} />
                        <YAxis orientation="right" domain={yDomain} tickFormatter={(v: number) => fmtPrice(v)} tick={{ fill: "#64748B", fontSize: 10, fontFamily: "JetBrains Mono Variable" }} stroke="#1E293B" width={78} allowDataOverflow />
                        <Tooltip content={<ChartTip tf={tf} />} cursor={{ stroke: C.cyan, strokeOpacity: 0.4, strokeDasharray: "3 3" }} />
                        {show.cone && <Area dataKey="band95" stroke="none" fill="url(#cone95)" isAnimationActive animationDuration={800} connectNulls />}
                        {show.cone && <Area dataKey="band50" stroke="none" fill="url(#cone50)" isAnimationActive animationDuration={800} connectNulls />}
                        <Area dataKey="c" stroke="#F1F5F9" strokeWidth={1.6} fill="url(#histFill)" dot={false} isAnimationActive={false} connectNulls />
                        {show.paths && <Line dataKey="p95" stroke={C.best} strokeWidth={1.8} strokeDasharray="4 3" dot={false} filter="url(#glow)" animationDuration={800} connectNulls />}
                        <Line dataKey="p50" stroke={C.avg} strokeWidth={2.6} dot={false} filter="url(#glow)" animationDuration={800} connectNulls />
                        {show.paths && <Line dataKey="p5" stroke={C.worst} strokeWidth={1.8} strokeDasharray="4 3" dot={false} filter="url(#glow)" animationDuration={800} connectNulls />}
                        {show.paths && <Line dataKey="mean" stroke={C.mean} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="1 4" dot={false} connectNulls />}
                        <ReferenceLine x={p.projection[0] ? rows[p.history.length - 1]?.t : undefined} stroke={C.cyan} strokeOpacity={0.6} strokeDasharray="2 2"
                          label={{ value: "NOW", position: "insideTopLeft", fill: C.cyan, fontSize: 10, fontFamily: "JetBrains Mono Variable" }} />
                        {show.levels && p.levels.filter((l) => Math.abs(l.dist_pct) < 40).map((l) => (
                          <ReferenceLine key={l.label} y={l.price} stroke={levelColor(l)} strokeOpacity={0.4 + l.strength / 250} strokeDasharray="6 4"
                            label={{ value: `${l.label} ${fmtPrice(l.price)}`, position: "insideLeft", fill: levelColor(l), fontSize: 10, fontFamily: "JetBrains Mono Variable" }} />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Hud>

              {/* scenarios + probabilities */}
              <div className="lg:col-span-4 space-y-3">
                <Hud testid="prediction-scenarios">
                  <p className="hud-lab"><Crosshair size={11} /> SCENARIOS · {p?.tf_label ?? "—"}</p>
                  {p ? (
                    <div className="space-y-1.5">
                      {([["best", C.best, TrendingUp], ["bull", "#6EE7B7", TrendingUp], ["base", C.avg, Activity], ["bear", "#FCA5A5", TrendingDown], ["worst", C.worst, TrendingDown]] as const).map(([k, col, Icon]) => {
                        const s = p.scenarios[k];
                        return (
                          <div key={k} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0" data-testid={`scenario-${k}`}>
                            <Icon size={14} style={{ color: col }} />
                            <span className="text-xs text-slate-400 flex-1">{s.label}</span>
                            <span className="font-mono text-sm tabular-nums">{fmtPrice(s.price)}</span>
                            <span className="font-mono text-xs w-16 text-right tabular-nums" style={{ color: col }}>{fmtPct(s.ret)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="h-44 sk-pulse" />}
                </Hud>
                <Hud testid="prediction-probabilities">
                  <p className="hud-lab"><Zap size={11} /> PROBABILITY MATRIX</p>
                  {p ? (
                    <div className="space-y-3">
                      <div className="flex h-7 font-mono text-[10px] overflow-hidden border border-[#1E293B]" data-testid="prob-split-bar">
                        <span className="grid place-items-center text-black font-bold" style={{ width: `${p.probabilities.bull * 100}%`, background: C.best }}>{p.probabilities.bull > 0.12 ? `BULL ${fmtProb(p.probabilities.bull)}` : ""}</span>
                        <span className="grid place-items-center text-slate-300" style={{ width: `${p.probabilities.neutral * 100}%`, background: "#1E293B" }}>{p.probabilities.neutral > 0.15 ? "RANGE" : ""}</span>
                        <span className="grid place-items-center text-black font-bold" style={{ width: `${p.probabilities.bear * 100}%`, background: C.worst }}>{p.probabilities.bear > 0.12 ? `BEAR ${fmtProb(p.probabilities.bear)}` : ""}</span>
                      </div>
                      <ProbBar label="Close higher" value={p.probabilities.up} tone="bull" testid="prob-up" />
                      <ProbBar label={`Touch R1 ${fmtPrice(p.probabilities.r1)}`} value={p.probabilities.touch_r1} tone="cyan" testid="prob-touch-r1" />
                      <ProbBar label={`Touch S1 ${fmtPrice(p.probabilities.s1)}`} value={p.probabilities.touch_s1} tone="bear" testid="prob-touch-s1" />
                      <ProbBar label={`Gain > ${fmtPct(p.probabilities.move_pct, true, 1)} (1σ)`} value={p.probabilities.gain_1sigma} tone="bull" testid="prob-gain-sigma" />
                      <ProbBar label={`Loss > ${fmtPct(p.probabilities.move_pct, true, 1).replace("+", "")} (1σ)`} value={p.probabilities.loss_1sigma} tone="bear" testid="prob-loss-sigma" />
                    </div>
                  ) : <div className="h-52 sk-pulse" />}
                </Hud>
              </div>

              {/* levels, risk, signals, distribution */}
              <Hud className="lg:col-span-4" testid="prediction-levels">
                <p className="hud-lab">SUPPORT / RESISTANCE RAILS</p>
                {p ? p.levels.map((l) => (
                  <div key={l.label} className="flex items-center gap-2 py-1 font-mono text-xs border-b border-white/5 last:border-0" data-testid={`level-${l.label.toLowerCase()}`}>
                    <span className="w-12 font-bold" style={{ color: levelColor(l) }}>{l.label}</span>
                    <span className="flex-1 tabular-nums">{fmtPrice(l.price)}</span>
                    <span className="text-slate-500 w-16 text-right">{fmtPct(l.dist_pct, false, 1)}</span>
                    <span className="w-14 h-1 bg-white/5"><i className="block h-full" style={{ width: `${l.strength}%`, background: levelColor(l) }} /></span>
                    <span className="text-slate-500 w-8 text-right" title="touches">{l.touches}×</span>
                  </div>
                )) : <div className="h-40 sk-pulse" />}
              </Hud>
              <Hud className="lg:col-span-4" testid="prediction-risk">
                <p className="hud-lab"><ShieldAlert size={11} /> RISK TELEMETRY · SIGNAL STACK</p>
                {p ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[["VaR 95%", fmtPct(-p.risk.var95)], ["CVaR 95%", fmtPct(-p.risk.cvar95)], ["Ann. vol", `${(p.risk.ann_vol * 100).toFixed(0)}%`], ["Median drawdown", fmtPct(p.risk.max_dd_median)]].map(([k, v]) => (
                        <div key={k} className="bg-[#07090E] border border-[#1E293B] px-2.5 py-2"><p className="font-mono text-[9px] tracking-widest uppercase text-slate-500">{k}</p><p className="font-mono text-sm tabular-nums">{v}</p></div>
                      ))}
                    </div>
                    {p.signals.stack.map((s) => (
                      <div key={s.k} className="flex justify-between py-1 text-xs border-b border-white/5 last:border-0">
                        <span className="text-slate-400">{s.k}</span>
                        <span className={`font-mono ${s.tone === "bull" ? "text-emerald-400" : s.tone === "bear" ? "text-rose-400" : "text-slate-300"}`}>{s.v}</span>
                      </div>
                    ))}
                  </>
                ) : <div className="h-40 sk-pulse" />}
              </Hud>
              <Hud className="lg:col-span-4" testid="prediction-distribution">
                <p className="hud-lab">TERMINAL PRICE DISTRIBUTION</p>
                {p ? (
                  <div className="h-[170px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={p.distribution} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                        <XAxis dataKey="price" tickFormatter={(v: number) => fmtPrice(v)} tick={{ fill: "#64748B", fontSize: 9 }} stroke="#1E293B" minTickGap={30} />
                        <YAxis hide />
                        <Tooltip formatter={(v: number) => fmtProb(v)} labelFormatter={(l: string) => fmtPrice(Number(l))} contentStyle={{ background: "#0B0F19", border: "1px solid #1E293B", fontFamily: "JetBrains Mono Variable", fontSize: 11 }} />
                        <ReferenceLine x={p.distribution.reduce((a, b) => (Math.abs(b.price - p.price) < Math.abs(a.price - p.price) ? b : a)).price} stroke={C.cyan} strokeDasharray="2 2" />
                        <Bar dataKey="prob" fill={C.cyan} fillOpacity={0.55} animationDuration={700} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="h-40 sk-pulse" />}
              </Hud>

              {/* AI narrative + actions */}
              <Hud className="lg:col-span-12" testid="prediction-ai-panel">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <p className="hud-lab !mb-0"><Bot size={11} /> CLAUDE FORECAST BRIEFING</p>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button className="sf-btn sf-btn-sm" onClick={() => onToggleWatch(sym)} data-testid="prediction-watch-button">{watching ? "Unwatch" : "+ Watchlist"}</button>
                    <button className="sf-btn sf-btn-sm" onClick={() => onTrade(sym)} data-testid="prediction-trade-button">{canTrade ? "Invest / trade" : "Unlock trading"}</button>
                    <button className="sf-btn sf-btn-sm sf-btn-p" onClick={runBrief} disabled={briefBusy || !p} data-testid="prediction-ai-button">{briefBusy ? "Analyzing…" : brief ? "Regenerate" : "Generate AI briefing"}</button>
                  </div>
                </div>
                {briefErr && <p className="font-mono text-xs text-rose-400" data-testid="prediction-ai-error">{briefErr}</p>}
                {brief ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200" data-testid="prediction-ai-text">{brief}</p>
                  : !briefErr && <p className="text-sm text-slate-500">Claude reads the simulation, levels and signal stack and writes a plain-language verdict with triggers and risk. Uses 1 AI credit.</p>}
                <p className="font-mono text-[10px] text-slate-600 mt-3">Probabilistic model output from historical volatility — not investment advice. Past behaviour does not guarantee future results.</p>
              </Hud>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState } from "react";
import { publicGet } from "@/lib/sfapi";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSF } from "@/context/SFContext";
import { Hero, Stat } from "@/components/sf/ui";
import { Locked } from "@/components/sf/Locked";
import { money } from "@/lib/theme";

const csv = (orders) =>
  ["time,side,qty,symbol,price", ...orders.map((o) => `${o.time},${o.side},${o.qty},${o.sym},${o.price}`)].join("\n");

const Ticket = () => {
  const { api, setMe, snap, tradeSym, setTradeSym, openPredict } = useSF();
  const [sym, setSym] = useState(tradeSym || "NVDA");
  const [quote, setQuote] = useState(null);
  useEffect(() => { if (tradeSym) { setSym(tradeSym); setTradeSym(null); } }, [tradeSym, setTradeSym]);
  useEffect(() => {
    const s = sym.trim().toUpperCase();
    if (!s) return setQuote(null);
    const id = setTimeout(() => publicGet(`/universe/${encodeURIComponent(s)}`).then(setQuote).catch(() => setQuote(false)), 250);
    return () => clearTimeout(id);
  }, [sym]);
  const [side, setSide] = useState("BUY");
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.post("/paper/order", { sym: sym.trim().toUpperCase(), side, qty: Number(qty) }); setMe(r.me); toast.success(`${side} ${qty} ${r.order.sym} @ ${money(r.order.price)}`); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="sf-panel p-5 space-y-3" data-testid="paper-ticket">
      <div className="lab">TICKET</div>
      <label className="block"><span className="font-mono text-[10px] text-neutral-500 tracking-widest">SYMBOL</span>
        <input className="sf-input w-full mt-1 uppercase" list="ticketSyms" value={sym} onChange={(e) => setSym(e.target.value)} placeholder="Any NASDAQ or top-100 crypto" data-testid="ticket-symbol-select" />
        <datalist id="ticketSyms">{snap.tickers.map((t) => <option key={t.sym} value={t.sym}>{t.name}</option>)}</datalist></label>
      <div className="font-mono text-xs min-h-[34px]" data-testid="ticket-quote">
        {quote ? (<div className="flex items-center justify-between gap-2"><span className="text-neutral-400 truncate">{quote.name}</span><span><b className="text-white">{money(quote.price, quote.price < 1 ? 6 : 2)}</b> <span className={quote.chg >= 0 ? "bull" : "bear"}>{quote.chg >= 0 ? "+" : ""}{quote.chg.toFixed(2)}%</span></span></div>)
          : quote === false ? <span className="bear">Unknown symbol</span> : <span className="text-neutral-600">Live quote…</span>}
        {quote && <div className="flex justify-between text-neutral-500 mt-1"><span>Est. value {money(quote.price * (Number(qty) || 0))}</span><button type="button" className="accent" onClick={() => openPredict(quote.sym)} data-testid="ticket-predict-button">◎ Forecast</button></div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["BUY", "SELL"].map((s) => (
          <button type="button" key={s} onClick={() => setSide(s)} data-testid={`ticket-side-${s.toLowerCase()}`}
            className={`font-mono text-sm py-2.5 border ${side === s ? (s === "BUY" ? "bg-green-500 text-black border-green-500" : "bg-red-500 text-black border-red-500") : "border-white/10 text-neutral-400"}`}>{s}</button>
        ))}
      </div>
      <label className="block"><span className="font-mono text-[10px] text-neutral-500 tracking-widest">QTY</span>
        <input className="sf-input w-full mt-1" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="ticket-qty-input" /></label>
      <button className="sf-btn sf-btn-p w-full !py-3" disabled={busy || !(Number(qty) > 0) || !quote} data-testid="ticket-submit-button">Execute order at live price</button>
    </form>
  );
};

const Positions = () => {
  const { me, openPredict } = useSF();
  const pnl = me.positions.reduce((s, p) => s + ((p.last ?? p.entry) - p.entry) * p.qty, 0);
  return (
    <div className="sf-panel p-5" data-testid="paper-positions">
      <div className="lab">POSITIONS · {me.positions.length}</div>
      {me.positions.map((p) => {
        const px = p.last ?? p.entry, u = (px - p.entry) * p.qty;
        return (
          <div key={p.sym} className="flex items-center gap-3 py-2 border-b border-white/5 font-mono text-sm" data-testid={`position-${p.sym}`}>
            <button className="font-disp font-bold w-14 text-left hover:accent" onClick={() => openPredict(p.sym)} data-testid={`position-predict-${p.sym}`}>{p.sym}</button><span className={`w-16 ${p.qty > 0 ? "bull" : "bear"}`}>{p.qty > 0 ? "LONG" : "SHORT"}</span>
            <span className="w-16">{+Math.abs(p.qty).toFixed(6)}</span><span className="text-neutral-500 flex-1">@ {money(p.entry, p.entry < 1 ? 6 : 2)} → {money(px, px < 1 ? 6 : 2)}</span><span className={u >= 0 ? "bull" : "bear"}>{money(u)}</span>
          </div>
        );
      })}
      {!me.positions.length && <p className="text-sm text-neutral-500 font-mono">Flat. Place an order from the ticket.</p>}
      <div className="flex justify-between mt-3 font-mono text-sm"><span className="text-neutral-500">Unrealized</span><span className={pnl >= 0 ? "bull" : "bear"} data-testid="paper-unrealized">{money(pnl)}</span></div>
    </div>
  );
};

const Equity = () => {
  const { me } = useSF();
  const data = me.equity.map((e, i) => ({ i, v: Math.round(e.v * 100) / 100 }));
  return (
    <div className="sf-panel p-5" data-testid="paper-equity-chart">
      <div className="lab">EQUITY CURVE</div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs><linearGradient id="eq" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--a)" stopOpacity={0.45} /><stop offset="1" stopColor="var(--a)" stopOpacity={0} /></linearGradient></defs>
          <XAxis dataKey="i" hide /><YAxis domain={["auto", "auto"]} tick={{ fill: "#737373", fontSize: 10 }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
          <Tooltip contentStyle={{ background: "#0D131F", border: "1px solid #1E293B", borderRadius: 6, fontFamily: "JetBrains Mono Variable" }} formatter={(v) => money(v)} labelFormatter={() => ""} />
          <Area type="monotone" dataKey="v" stroke="var(--a)" strokeWidth={2} fill="url(#eq)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const OrderLog = () => {
  const { me } = useSF();
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(me.orders)], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "stockforge-orders.csv" }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="sf-panel p-5" data-testid="paper-order-log">
      <div className="flex justify-between items-center mb-3"><div className="lab !mb-0">ORDER LOG</div><button className="sf-btn sf-btn-sm" onClick={download} disabled={!me.orders.length} data-testid="paper-export-csv-button">Export CSV</button></div>
      <div className="max-h-56 overflow-y-auto font-mono text-xs space-y-1">
        {[...me.orders].reverse().map((o) => (
          <p key={o.id} className="text-neutral-400"><span className="text-neutral-600">{new Date(o.time).toLocaleTimeString()}</span> <span className={o.side === "BUY" ? "bull" : "bear"}>{o.side}</span> {o.qty} {o.sym} @ {money(o.price)}</p>
        ))}
        {!me.orders.length && <p className="text-neutral-600">No orders yet.</p>}
      </div>
    </div>
  );
};

export default function Paper() {
  const { me, setMe, api, can, setDepositOpen } = useSF();
  const base = 100000 + (me.deposits_total || 0) - (me.withdrawals_total || 0);
  const ret = ((me.equity_now - base) / base) * 100;
  const open = me.equity_now - me.cash;
  const reset = async () => {
    try { setMe(await api.post("/paper/reset")); toast.success("Paper account reset to $100,000"); } catch (e) { toast.error(e.message); }
  };
  return (
    <section data-testid="page-trade">
      <Hero kicker="INVEST" title="Paper Desk" sub="Trade any NASDAQ stock or top-100 crypto at live prices · fund with instant or card deposits">
        <button className="sf-btn sf-btn-p" onClick={() => setDepositOpen(true)} data-testid="paper-deposit-button">$ Deposit funds</button>
        {can("paper") && <button className="sf-btn" onClick={reset} data-testid="paper-reset-button">Reset account</button>}
      </Hero>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Cash" value={money(me.cash, 0)} testid="paper-cash" />
        <Stat label="Equity" value={money(me.equity_now, 0)} testid="paper-equity" />
        <Stat label="Open exposure" value={money(open, 0)} testid="paper-exposure" />
        <Stat label="Return" value={`${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`} tone={ret >= 0 ? "bull" : "bear"} testid="paper-return" />
      </div>
      <Locked gate="paper" label="Paper trading desk">
        <div className="grid lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4"><Ticket /></div>
          <div className="lg:col-span-8 space-y-4"><Equity /><Positions /></div>
          <Locked gate="orderLog" label="Order log" className="lg:col-span-12"><OrderLog /></Locked>
        </div>
      </Locked>
    </section>
  );
}

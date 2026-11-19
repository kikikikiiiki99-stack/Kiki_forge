import { useEffect, useState } from "react";
import { publicGet } from "@/lib/sfapi";
import { toast } from "sonner";
import { Bell, BellOff, FileSpreadsheet, X } from "lucide-react";
import { ImportExport } from "@/components/sf/ImportExport";
import { useSF } from "@/context/SFContext";
import { Hero, Chg } from "@/components/sf/ui";
import { Sparkline } from "@/components/sf/Sparkline";
import { money } from "@/lib/theme";

const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};

const livePrice = (sym, bySym, markets) => (markets?.stocks || []).find((s) => s.sym === sym && !s.stale)?.price ?? bySym[sym]?.price;

const AlertEditor = ({ sym, alert, onSave, onClear }) => {
  const [price, setPrice] = useState(alert?.price ?? "");
  const [dir, setDir] = useState(alert?.dir ?? "above");
  return (
    <div className="flex gap-1.5 items-center">
      <select className="sf-input !py-1 !text-xs" value={dir} onChange={(e) => setDir(e.target.value)} data-testid={`alert-dir-${sym}`}><option value="above">≥</option><option value="below">≤</option></select>
      <input className="sf-input !py-1 !text-xs w-24" type="number" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} data-testid={`alert-price-${sym}`} />
      <button className="sf-btn sf-btn-sm" onClick={() => price > 0 && onSave(Number(price), dir)} data-testid={`alert-save-${sym}`}><Bell size={12} /></button>
      {alert && <button className="sf-btn sf-btn-sm" onClick={onClear} data-testid={`alert-clear-${sym}`}><BellOff size={12} /></button>}
    </div>
  );
};

export default function Watchlist() {
  const { me, setMe, api, bySym, snap, can, upgrade, openTicker, markets } = useSF();
  const [sym, setSym] = useState("");
  const [io, setIo] = useState(false);
  const [uni, setUni] = useState({});
  const { openPredict } = useSF();
  useEffect(() => {
    const extra = me.watch.filter((s) => !bySym[s]);
    if (!extra.length) return;
    publicGet(`/universe/batch?syms=${encodeURIComponent(extra.join(","))}`).then(setUni).catch(() => {});
  }, [me.watch, bySym]);

  useEffect(() => {
    Object.entries(me.alerts || {}).forEach(([s, a]) => {
      const p = livePrice(s, bySym, markets);
      if (p && (a.dir === "above" ? p >= a.price : p <= a.price)) toast(`ALERT · ${s} ${a.dir === "above" ? "≥" : "≤"} ${money(a.price)} · now ${money(p)}`, { id: `alert-${s}` });
    });
  }, [me.alerts, bySym, markets]);

  const add = async (e) => {
    e.preventDefault();
    try { const r = await api.post("/watchlist", { sym }); setMe((m) => ({ ...m, watch: r.watch })); setSym(""); toast.success(`${sym.toUpperCase()} added`); }
    catch (err) { toast.error(err.message); }
  };
  const remove = async (s) => { const r = await api.del(`/watchlist/${s}`); setMe((m) => { const al = { ...m.alerts }; delete al[s]; return { ...m, watch: r.watch, alerts: al }; }); };
  const saveAlert = async (s, price, dir) => {
    try { const r = await api.put(`/alerts/${s}`, { price, dir }); setMe((m) => ({ ...m, alerts: { ...m.alerts, [s]: r.alert } })); toast.success(`Alert set on ${s}`); }
    catch (err) { toast.error(err.message); }
  };
  const clearAlert = async (s) => { await api.del(`/alerts/${s}`); setMe((m) => { const al = { ...m.alerts }; delete al[s]; return { ...m, alerts: al }; }); };
  const exportList = async () => {
    if (!can("export")) return upgrade(snap.gates.export);
    try { const d = await api.get("/export"); download("stockforge-watchlist.json", JSON.stringify(d, null, 2), "application/json"); toast.success("Watchlist exported"); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <section data-testid="page-watch">
      <Hero kicker="TRACKING" title="Watchlist" sub={`${me.watch.length} tracked names · ${Object.keys(me.alerts || {}).length} price alerts`}>
        <form onSubmit={add} className="flex gap-2">
          <input className="sf-input w-40" list="symList" placeholder="Add symbol…" value={sym} onChange={(e) => setSym(e.target.value)} data-testid="watch-add-input" />
          <datalist id="symList">{snap.tickers.map((t) => <option key={t.sym} value={t.sym}>{t.name}</option>)}</datalist>
          {/* any NASDAQ listing or top-100 crypto is accepted */}
          <button className="sf-btn sf-btn-p" type="submit" disabled={!sym} data-testid="watch-add-button">+ Add</button>
        </form>
        <button className="sf-btn" onClick={() => setIo(true)} data-testid="watch-import-export-button"><FileSpreadsheet size={14} />{can("export") ? "Import / Export" : `Import / Export · T${snap.gates.export}`}</button>
        <button className="sf-btn" onClick={exportList} data-testid="watch-export-button">JSON</button>
      </Hero>
      <ImportExport open={io} onOpenChange={setIo} />
      <div className="space-y-2">
        {me.watch.map((s) => {
          const u = uni[s];
          const t = bySym[s] || (u && { ...u, hist: null });
          if (!t) return null;
          const al = me.alerts?.[s];
          return (
            <div key={s} className="sf-panel p-4 flex flex-wrap items-center gap-4 rise" data-testid={`watch-row-${s}`}>
              <button onClick={() => (bySym[s] ? openTicker(s) : openPredict(s))} className="text-left w-40"><b className="font-disp text-lg">{s}</b><p className="text-xs text-neutral-500">{t.name}</p></button>
              <div className="w-28 hidden sm:block">{t.hist ? <Sparkline data={t.hist} w={110} h={30} /> : <span className="font-mono text-[10px] text-neutral-600">{u?.kind === "crypto" ? "CRYPTO" : "NASDAQ"}</span>}</div>
              <span className="font-mono w-24">{money(livePrice(s, bySym, markets) ?? t.price)}</span>
              <Chg v={t.chg} className="text-sm w-20" />
              {al && <span className={`font-mono text-[11px] ${al.triggered_at ? "text-amber-400" : "accent"}`} data-testid={`alert-badge-${s}`}>{al.triggered_at ? "TRIGGERED" : "ALERT"} {al.dir === "above" ? "≥" : "≤"} {money(al.price)}</span>}
              <div className="ml-auto flex items-center gap-2">
                <button className="sf-btn sf-btn-sm sf-btn-p" onClick={() => openPredict(s)} data-testid={`watch-predict-${s}`}>Predict</button>
                <AlertEditor sym={s} alert={al} onSave={(p, d) => saveAlert(s, p, d)} onClear={() => clearAlert(s)} />
                <button className="sf-btn sf-btn-sm" onClick={() => remove(s)} aria-label={`Remove ${s}`} data-testid={`watch-remove-${s}`}><X size={12} /></button>
              </div>
            </div>
          );
        })}
        {!me.watch.length && <p className="sf-panel p-8 text-center text-neutral-500" data-testid="watch-empty">Your watchlist is empty — add a symbol above.</p>}
      </div>
    </section>
  );
}

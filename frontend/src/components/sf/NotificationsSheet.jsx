import { useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSF } from "@/context/SFContext";
import { money } from "@/lib/theme";

const ago = (t) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(t)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

export const BellButton = ({ onClick }) => {
  const { notes } = useSF();
  return (
    <button className="sf-btn sf-btn-sm relative" onClick={onClick} aria-label="Alerts and notifications" data-testid="alerts-bell-btn">
      {notes.unread ? <BellRing size={14} /> : <Bell size={14} />}
      {notes.unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--a)] text-black font-mono text-[10px] font-bold grid place-items-center" data-testid="alerts-unread-badge">{notes.unread > 99 ? "99+" : notes.unread}</span>
      )}
    </button>
  );
};

const AlertForm = () => {
  const { api, snap, markets, setMe, refreshNotes } = useSF();
  const syms = [...snap.tickers.map((t) => t.sym), ...(markets?.crypto || []).map((c) => c.sym)];
  const [sym, setSym] = useState(syms[0]);
  const [dir, setDir] = useState("above");
  const [price, setPrice] = useState("");
  const save = async (e) => {
    e.preventDefault();
    try {
      const r = await api.put(`/alerts/${sym}`, { price: Number(price), dir });
      setMe((m) => ({ ...m, alerts: { ...m.alerts, [sym]: r.alert } }));
      setPrice(""); toast.success(`Alert armed on ${sym}`); refreshNotes();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <form onSubmit={save} className="grid grid-cols-[1fr_auto] gap-2" data-testid="alert-create-form">
      <select className="sf-input !text-xs" value={sym} onChange={(e) => setSym(e.target.value)} data-testid="alert-create-symbol">{[...new Set(syms)].map((s) => <option key={s}>{s}</option>)}</select>
      <select className="sf-input !text-xs" value={dir} onChange={(e) => setDir(e.target.value)} data-testid="alert-create-dir"><option value="above">Above ≥</option><option value="below">Below ≤</option></select>
      <input className="sf-input !text-xs" type="number" step="any" min="0" placeholder="Target price" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="alert-create-price" />
      <button className="sf-btn sf-btn-p sf-btn-sm" type="submit" disabled={!(Number(price) > 0)} data-testid="alert-create-submit">Arm</button>
    </form>
  );
};

export const NotificationsSheet = ({ open, onOpenChange }) => {
  const { me, setMe, api, notes, markRead } = useSF();
  const alerts = Object.entries(me?.alerts || {});
  const del = async (s) => {
    await api.del(`/alerts/${s}`);
    setMe((m) => { const al = { ...m.alerts }; delete al[s]; return { ...m, alerts: al }; });
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-[#0D131F] border-l border-slate-800 w-full sm:max-w-md overflow-y-auto" data-testid="alerts-drawer">
        <SheetTitle className="font-disp text-xl">Alerts</SheetTitle>
        <SheetDescription className="text-xs text-neutral-400">Get notified in-app when a price crosses your target. Checked every 30s while you're signed in.</SheetDescription>
        <div className="mt-5 space-y-5">
          <section>
            <div className="lab">NEW PRICE ALERT</div>
            {me && <AlertForm />}
          </section>
          <section data-testid="alerts-active-list">
            <div className="lab">YOUR ALERTS · {alerts.length}</div>
            <div className="space-y-1.5">
              {alerts.map(([s, a]) => (
                <div key={s} className="flex items-center gap-3 rounded-md border border-slate-800 bg-[#111927] px-3 py-2" data-testid={`alert-item-${s}`}>
                  <b className="font-mono w-14">{s}</b>
                  <span className="font-mono text-xs text-neutral-300 flex-1">{a.dir === "above" ? "≥" : "≤"} {money(a.price)}</span>
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${a.triggered_at ? "border-amber-500/40 text-amber-400" : "border-emerald-500/30 text-emerald-400"}`} data-testid={`alert-status-${s}`}>{a.triggered_at ? "TRIGGERED" : "ARMED"}</span>
                  <button className="text-neutral-500 hover:text-red-400 transition-colors" onClick={() => del(s)} aria-label={`Delete alert ${s}`} data-testid={`alert-delete-${s}`}><Trash2 size={14} /></button>
                </div>
              ))}
              {!alerts.length && <p className="text-sm text-neutral-500">No alerts yet.</p>}
            </div>
          </section>
          <section data-testid="notifications-history">
            <div className="flex items-center justify-between mb-3"><div className="lab !mb-0">HISTORY</div>
              {notes.unread > 0 && <button className="font-mono text-[10px] accent hover:underline" onClick={markRead} data-testid="notifications-mark-read">Mark all read</button>}</div>
            <div className="space-y-1.5">
              {notes.items.map((n) => (
                <div key={n.id} className={`rounded-md border px-3 py-2 ${n.read ? "border-slate-800" : "border-[var(--a-line)] bg-[var(--a-soft)]"}`} data-testid={`notification-${n.id}`}>
                  <div className="flex justify-between gap-2"><p className="text-sm font-medium">{n.title}</p><span className="font-mono text-[10px] text-neutral-500 shrink-0">{ago(n.t)}</span></div>
                  {n.body && <p className="text-xs text-neutral-400 mt-0.5">{n.body}</p>}
                </div>
              ))}
              {!notes.items.length && <p className="text-sm text-neutral-500" data-testid="notifications-empty">Nothing yet — triggered alerts and payment updates land here.</p>}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bitcoin, Check, Download, ExternalLink, FileArchive, RefreshCw, Save, Trash2, X } from "lucide-react";
import SiteSettingsTab from "@/components/admin/SiteSettingsTab";
import ItemsTab from "@/components/admin/ItemsTab";
import AgentTab from "@/components/admin/AgentTab";
import HistoryTab from "@/components/admin/HistoryTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSF } from "@/context/SFContext";
import { Hero, Stat } from "@/components/sf/ui";
import { useSourceDownload } from "@/components/sf/AdminAccess";
import { useFiles } from "@/lib/files";
import { money } from "@/lib/theme";

const when = (t) => (t ? new Date(t).toLocaleString() : "—");
const STATUS = ["pending", "seen", "confirmed", "approved", "rejected", "expired"];
const TONE = { pending: "border-slate-600 text-neutral-300", seen: "border-sky-500/40 text-sky-300", confirmed: "border-emerald-500/40 text-emerald-400",
  approved: "border-emerald-500/40 text-emerald-400", rejected: "border-red-500/40 text-red-400", expired: "border-neutral-700 text-neutral-500" };
const TH = "px-3 py-2 font-mono text-[10px] tracking-widest text-neutral-500 text-left font-semibold";
const TD = "px-3 py-2";

const Badge = ({ s, testid }) => <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${TONE[s] || TONE.pending}`} data-testid={testid}>{s}</span>;

const ExportButtons = ({ kind }) => {
  const { download } = useFiles();
  const go = async (fmt) => { try { await download(`/admin/export/${kind}?fmt=${fmt}`, `stockforge-${kind}.${fmt}`); } catch (e) { toast.error(e.message); } };
  return ["csv", "xlsx"].map((f) => <button key={f} className="sf-btn sf-btn-sm" onClick={() => go(f)} data-testid={`admin-export-${kind}-${f}`}><Download size={12} />{kind} {f}</button>);
};

const DeleteUser = ({ u, meId, onDelete }) => {
  const [ask, setAsk] = useState(false);
  if (u.user_id === meId) return null;
  return ask ? (
    <span className="inline-flex items-center gap-1.5">
      <button className="sf-btn sf-btn-sm sf-btn-danger" onClick={() => { setAsk(false); onDelete(u.user_id); }} data-testid={`admin-user-delete-confirm-${u.user_id}`}>Delete</button>
      <button className="sf-btn sf-btn-sm" onClick={() => setAsk(false)} data-testid={`admin-user-delete-cancel-${u.user_id}`}>Keep</button>
    </span>
  ) : <button className="sf-icon-btn hover:!text-red-400" onClick={() => setAsk(true)} aria-label="Delete user" data-testid={`admin-user-delete-${u.user_id}`}><Trash2 size={14} /></button>;
};

const UsersTab = ({ users, tiers, onTier, onAdmin, onDelete, meId }) => (
  <div className="sf-panel overflow-x-auto" data-testid="admin-users-table">
    <div className="flex flex-wrap items-center justify-between gap-2 p-4"><div className="lab !mb-0">USERS & ROLES · {users.length}</div><div className="flex gap-2"><ExportButtons kind="users" /></div></div>
    <div className="md:hidden divide-y divide-white/5 border-t border-white/5">
      {users.map((u) => (
        <div key={u.user_id} className="p-4 space-y-3" data-testid={`admin-user-card-${u.user_id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate">{u.name || u.email || "—"}</p><p className="font-mono text-[10px] text-neutral-500 truncate">{u.email || u.user_id}</p></div>
            <DeleteUser u={u} meId={meId} onDelete={onDelete} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="sf-input !py-1 !text-xs" value={u.tier} onChange={(e) => onTier(u.user_id, Number(e.target.value))} aria-label="Tier">
              {tiers.map((t) => <option key={t.id} value={t.id}>T{t.id} {t.name}</option>)}
            </select>
            <button className={`sf-btn sf-btn-sm ${u.is_admin ? "sf-btn-p" : ""}`} disabled={u.user_id === meId} onClick={() => onAdmin(u.user_id, !u.is_admin)}>{u.is_admin ? "Admin" : "Make admin"}</button>
            <span className="font-mono text-[10px] text-neutral-500 ml-auto">{when(u.last_login)}</span>
          </div>
        </div>
      ))}
    </div>
    <table className="w-full text-sm hidden md:table">
      <thead><tr className="border-y border-slate-800"><th className={TH}>USER</th><th className={TH}>TIER</th><th className={TH}>PAID UNTIL</th><th className={TH}>LAST LOGIN</th><th className={TH}>ROLE</th><th className={TH}></th></tr></thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.user_id} className="border-b border-slate-800/60 hover:bg-white/[0.03] transition-colors duration-150" data-testid={`admin-user-row-${u.user_id}`}>
            <td className={TD}><p>{u.name || u.email || "—"}</p><p className="font-mono text-[10px] text-neutral-500">{u.email || u.user_id}</p></td>
            <td className={TD}>
              <select className="sf-input !py-1 !text-xs" value={u.tier} onChange={(e) => onTier(u.user_id, Number(e.target.value))} data-testid={`admin-tier-select-${u.user_id}`}>
                {tiers.map((t) => <option key={t.id} value={t.id}>T{t.id} {t.name}</option>)}
              </select>
            </td>
            <td className={`${TD} font-mono text-xs text-neutral-400`}>{u.tier_expires_at ? new Date(u.tier_expires_at).toLocaleDateString() : u.tier > 1 ? "no expiry" : "—"}</td>
            <td className={`${TD} font-mono text-xs text-neutral-400`}>{when(u.last_login)}</td>
            <td className={TD}>
              <button className={`sf-btn sf-btn-sm ${u.is_admin ? "sf-btn-p" : ""}`} disabled={u.user_id === meId} onClick={() => onAdmin(u.user_id, !u.is_admin)} data-testid={`admin-toggle-${u.user_id}`}>{u.is_admin ? "Admin" : "Member · make admin"}</button>
            </td>
            <td className={TD}><DeleteUser u={u} meId={meId} onDelete={onDelete} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const PaymentsTab = ({ legacy }) => {
  const { api } = useSF();
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api.get(`/admin/btc-payments${filter ? `?status=${filter}` : ""}`).then(setRows).catch((e) => toast.error(e.message)), [api, filter]);
  useEffect(() => { load(); }, [load]);
  const act = async (p, action) => {
    try {
      const body = action === "reject" ? { note: window.prompt("Reason for rejecting (shown to the member)", "") || "" } : undefined;
      const r = await api.post(`/admin/btc-payments/${p.id}/${action}`, body);
      toast.success(`Payment ${r.status}`); load();
    } catch (e) { toast.error(e.message); }
  };
  const open = (s) => ["pending", "seen", "expired"].includes(s);
  return (
    <div className="space-y-4">
      <div className="sf-panel overflow-x-auto" data-testid="admin-btc-payments-table">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="lab !mb-0 flex items-center gap-2"><Bitcoin size={12} className="text-[#F7931A]" /> BITCOIN PAYMENTS · {rows?.length ?? "…"}</div>
          <div className="flex flex-wrap gap-2">
            <select className="sf-input !py-1 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="admin-payments-filter">
              <option value="">All statuses</option>{STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="sf-btn sf-btn-sm" onClick={load} data-testid="admin-payments-refresh"><RefreshCw size={12} /></button>
            <ExportButtons kind="payments" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-y border-slate-800"><th className={TH}>DATE</th><th className={TH}>USER</th><th className={TH}>TIER</th><th className={TH}>AMOUNT</th><th className={TH}>TXID</th><th className={TH}>STATUS</th><th className={TH}>ACTIONS</th></tr></thead>
          <tbody>
            {(rows || []).map((p) => (
              <tr key={p.id} className="border-b border-slate-800/60 hover:bg-white/[0.03] transition-colors duration-150" data-testid={`admin-payment-row-${p.id}`}>
                <td className={`${TD} font-mono text-xs text-neutral-400 whitespace-nowrap`}>{when(p.created_at)}</td>
                <td className={`${TD} text-xs`}>{p.email || p.user_id}</td>
                <td className={`${TD} font-mono text-xs`}>T{p.tier} {p.tier_name}</td>
                <td className={`${TD} font-mono text-xs whitespace-nowrap`}><span className="text-[#F7931A]">{p.amount_btc}</span><span className="text-neutral-500"> · {money(p.usd_cents / 100)}</span>
                  {p.received_sats != null && <p className={p.underpaid ? "bear" : "text-neutral-500"}>got {(p.received_sats / 1e8).toFixed(8)}{p.underpaid ? " · short" : ""}</p>}</td>
                <td className={`${TD} font-mono text-[11px]`}>{p.txid ? <a className="accent inline-flex items-center gap-1 hover:underline" href={`https://mempool.space/tx/${p.txid}`} target="_blank" rel="noreferrer">{p.txid.slice(0, 10)}…<ExternalLink size={10} /></a> : <span className="text-neutral-600">—</span>}</td>
                <td className={TD}><Badge s={p.status} testid={`admin-payment-status-${p.id}`} />{p.note && <p className="text-[10px] text-neutral-500 mt-1">{p.note}</p>}</td>
                <td className={TD}>
                  {open(p.status) ? (
                    <div className="flex gap-1">
                      <button className="sf-btn sf-btn-sm" onClick={() => act(p, "approve")} aria-label="Approve" data-testid={`admin-payment-approve-${p.id}`}><Check size={12} /></button>
                      <button className="sf-btn sf-btn-sm" onClick={() => act(p, "reject")} aria-label="Reject" data-testid={`admin-payment-reject-${p.id}`}><X size={12} /></button>
                      {p.txid && <button className="sf-btn sf-btn-sm" onClick={() => act(p, "recheck")} aria-label="Re-check on chain" data-testid={`admin-payment-recheck-${p.id}`}><RefreshCw size={12} /></button>}
                    </div>
                  ) : <span className="font-mono text-[10px] text-neutral-600">{p.period_ends_at ? `until ${new Date(p.period_ends_at).toLocaleDateString()}` : "—"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <p className="p-6 text-sm text-neutral-500" data-testid="admin-payments-empty">No Bitcoin payments{filter ? ` with status ${filter}` : ""} yet.</p>}
      </div>
      {legacy.length > 0 && (
        <div className="sf-panel p-5" data-testid="admin-legacy-payments">
          <div className="lab">EARLIER CARD PAYMENTS (STRIPE, RETIRED)</div>
          <div className="max-h-60 overflow-y-auto space-y-1 font-mono text-xs">
            {legacy.map((p) => <p key={p.session_id} className="text-neutral-400"><span className="text-neutral-600">{when(p.created_at)}</span> T{p.tier} {money(p.amount)} <span className={p.payment_status === "paid" ? "bull" : "text-neutral-500"}>{p.payment_status}</span></p>)}
          </div>
        </div>
      )}
    </div>
  );
};

const TiersTab = () => {
  const { api, refreshSnap } = useSF();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/admin/tiers").then((t) => setRows(t.map((x) => ({ id: x.id, name: x.name, usd: String(x.amount_cents / 100) })))).catch((e) => toast.error(e.message)); }, [api]);
  const set = (id, k, v) => setRows((r) => r.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const save = async () => {
    try {
      const tiers = rows.map((r) => ({ id: r.id, name: r.name, amount_cents: Math.round(Number(r.usd || 0) * 100) }));
      await api.put("/admin/tiers", { tiers }); toast.success("Tiers saved"); refreshSnap();
    } catch (e) { toast.error(e.message); }
  };
  if (!rows) return <div className="sk h-72" data-testid="admin-tiers-loading" />;
  return (
    <div className="sf-panel p-5" data-testid="admin-tier-editor">
      <div className="flex items-center justify-between mb-4"><div className="lab !mb-0">TIER EDITOR · NAMES & MONTHLY USD PRICE</div>
        <button className="sf-btn sf-btn-p sf-btn-sm" onClick={save} data-testid="admin-tiers-save"><Save size={12} /> Save tiers</button></div>
      <div className="grid sm:grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-[#111927] p-2">
            <span className="font-mono text-[10px] text-neutral-500 w-8">T{r.id}</span>
            <input className="sf-input !py-1.5 !text-xs flex-1 min-w-0" value={r.name} maxLength={24} onChange={(e) => set(r.id, "name", e.target.value)} aria-label={`Tier ${r.id} name`} data-testid={`admin-tier-name-${r.id}`} />
            <span className="font-mono text-xs text-neutral-500">$</span>
            <input className="sf-input !py-1.5 !text-xs w-24" type="number" min="0" step="0.01" value={r.usd} disabled={r.id === 1} onChange={(e) => set(r.id, "usd", e.target.value)} aria-label={`Tier ${r.id} price`} data-testid={`admin-tier-price-${r.id}`} />
            <span className="font-mono text-[10px] text-neutral-500">/mo</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500 mt-3">T1 stays free. Features unlocked by each tier don't change — only the label and price members see and pay in BTC.</p>
    </div>
  );
};

const BitcoinTab = () => {
  const { api } = useSF();
  const [cfg, setCfg] = useState(null);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/billing").then((c) => { setCfg(c); setAddr(c.btc_address || ""); }).catch((e) => toast.error(e.message)); }, [api]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const c = await api.put("/admin/billing", { btc_address: addr }); setCfg(c); setAddr(c.btc_address); toast.success("Receiving address saved & validated"); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="sf-panel p-5 max-w-2xl" data-testid="admin-btc-settings">
      <div className="lab flex items-center gap-2"><Bitcoin size={12} className="text-[#F7931A]" /> BITCOIN RECEIVING ADDRESS</div>
      <p className="text-sm text-neutral-400 mb-4">Paste an address from your own wallet. Members pay straight to it; the app only reads the public blockchain to confirm payments — it never holds coins or keys.</p>
      <form onSubmit={save} className="flex flex-col sm:flex-row gap-2">
        <input className="sf-input flex-1 !text-xs" placeholder="bc1… / 1… / 3…" value={addr} onChange={(e) => setAddr(e.target.value)} data-testid="admin-btc-address-input" />
        <button className="sf-btn sf-btn-p" type="submit" disabled={busy || addr.trim().length < 14} data-testid="admin-btc-address-save">{busy ? "Checking…" : "Save address"}</button>
      </form>
      <p className="font-mono text-[11px] mt-3 text-neutral-500" data-testid="admin-btc-address-status">
        {cfg?.btc_address ? <>Active · updated {when(cfg.updated_at)} · <a className="accent hover:underline" href={`https://mempool.space/address/${cfg.btc_address}`} target="_blank" rel="noreferrer">view on mempool</a></> : <span className="text-amber-400">No address yet — Bitcoin checkout is off until you add one.</span>}
      </p>
      <p className="text-xs text-neutral-500 mt-4">Quotes hold for 15 minutes at the live Coinbase rate. A tier unlocks after 1 confirmation and lasts 30 days.</p>
    </div>
  );
};

export default function Admin() {
  const { api, snap, me, refreshMe } = useSF();
  const [d, setD] = useState(null);
  const { download, busy } = useSourceDownload();

  const load = useCallback(async () => {
    try {
      const [stats, users, logins, payments] = await Promise.all(["/admin/stats", "/admin/users", "/admin/logins", "/admin/payments"].map((p) => api.get(p)));
      setD({ stats, users, logins, payments });
    } catch (e) { toast.error(e.message); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const onTier = async (uid, tier) => {
    try { await api.patch(`/admin/users/${uid}/tier`, { tier }); toast.success(`Tier set to T${tier}`); load(); if (uid === me.user_id) refreshMe(); }
    catch (e) { toast.error(e.message); }
  };
  const onDelete = async (uid) => {
    try { await api.del(`/admin/users/${uid}`); toast.success("User deleted"); load(); } catch (e) { toast.error(e.message); }
  };
  const onAdmin = async (uid, is_admin) => {
    try { await api.patch(`/admin/users/${uid}/admin`, { is_admin }); load(); } catch (e) { toast.error(e.message); }
  };

  if (!me.is_admin) return <p className="font-mono text-neutral-500" data-testid="admin-denied">Admin only.</p>;
  const s = d?.stats;
  return (
    <section data-testid="page-admin">
      <Hero kicker="CONTROL CENTRE" title="Admin" sub="Site settings · featured items · users · AI agent · payments · tiers">
        <button className="sf-btn" onClick={load} data-testid="admin-refresh-button"><RefreshCw size={14} /> Refresh</button>
        <button className="sf-btn" onClick={download} disabled={busy} data-testid="admin-page-download-button"><FileArchive size={14} />{busy ? "Packing…" : "Source .zip"}</button>
      </Hero>
      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-nowrap sm:flex-wrap justify-start overflow-x-auto max-w-full h-auto p-1 gap-1 bg-[#0D131F]/90 border border-white/[0.06] rounded-xl" data-testid="admin-tabs">
          {[["overview", "Overview"], ["site", "Site settings"], ["items", "Featured items"], ["users", "Users & roles"], ["agent", "AI agent"], ["history", "History"], ["payments", `Payments${s?.btc_pending ? ` · ${s.btc_pending}` : ""}`], ["tiers", "Tier editor"], ["bitcoin", "Bitcoin wallet"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="font-mono text-[11px] uppercase tracking-wider rounded-lg shrink-0" data-testid={`admin-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          {!s && <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4" data-testid="admin-stats-loading">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="sk h-24" />)}</div>}
          {s && (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
              <Stat label="Users" value={s.users} sub={`${s.admins} admins`} testid="admin-stat-users" />
              <Stat label="Active 24h" value={s.active_24h} sub={`${s.logins_24h} logins`} testid="admin-stat-active" />
              <Stat label="Logins 7d" value={s.logins_7d} testid="admin-stat-logins7d" />
              <Stat label="Revenue" value={money(s.revenue)} sub={`${s.payments} paid · ${s.btc_pending} awaiting review`} tone="bull" testid="admin-stat-revenue" />
              <Stat label="AI questions" value={s.ai_messages} testid="admin-stat-ai" />
              <Stat label="Paper orders" value={s.paper_orders} testid="admin-stat-orders" />
            </div>
          )}
          {s && (
            <div className="sf-panel p-5 mb-4" data-testid="admin-tier-breakdown">
              <div className="lab">USERS PER TIER</div>
              <div className="grid grid-cols-5 lg:grid-cols-10 gap-2">
                {s.per_tier.map((t) => (
                  <div key={t.tier} className="rounded border border-slate-800 p-2 text-center"><p className="font-mono text-[10px] text-neutral-500">T{t.tier}</p><p className="font-disp text-xl accent">{t.users}</p><p className="font-mono text-[9px] text-neutral-500 truncate">{snap.tiers[t.tier - 1]?.name}</p></div>
                ))}
              </div>
            </div>
          )}
          {d && (
            <div className="sf-panel p-5" data-testid="admin-logins-feed">
              <div className="lab">RECENT LOGINS</div>
              <div className="max-h-80 overflow-y-auto space-y-1 font-mono text-xs">
                {d.logins.map((l, i) => <p key={i} className="text-neutral-400"><span className="text-neutral-600">{when(l.t)}</span> <span className="accent">{l.email || l.user_id}</span> · {l.ip} · <span className="text-neutral-600">{l.ua.slice(0, 50)}</span></p>)}
                {!d.logins.length && <p className="text-neutral-600">No logins yet.</p>}
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="site"><SiteSettingsTab /></TabsContent>
        <TabsContent value="items"><ItemsTab /></TabsContent>
        <TabsContent value="agent"><AgentTab onChanged={load} /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="users">{d ? <UsersTab users={d.users} tiers={snap.tiers} onTier={onTier} onAdmin={onAdmin} onDelete={onDelete} meId={me.user_id} /> : <div className="sk h-64" />}</TabsContent>
        <TabsContent value="payments"><PaymentsTab legacy={d?.payments || []} /></TabsContent>
        <TabsContent value="tiers"><TiersTab /></TabsContent>
        <TabsContent value="bitcoin"><BitcoinTab /></TabsContent>
      </Tabs>
    </section>
  );
}

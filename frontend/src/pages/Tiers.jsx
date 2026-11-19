import { useEffect, useState } from "react";
import { Bitcoin, Check, Crown, Eye } from "lucide-react";
import { useSF } from "@/context/SFContext";
import { Hero } from "@/components/sf/ui";
import { themeVars } from "@/lib/theme";

const TierCard = ({ t, i }) => {
  const { me, themeTier, setTheme, setPreview, upgrade, snap } = useSF();
  const owned = t.id <= me.tier;
  const active = t.id === themeTier;
  const unlocks = Object.entries(snap.gates).filter(([, v]) => v === t.id).map(([k]) => k);
  return (
    <div style={themeVars(t.id)} className={`sf-panel p-5 flex flex-col rise ${active ? "!border-[var(--a)]" : ""}`} data-testid={`tier-card-${t.id}`}>
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, var(--a), var(--a2))`, boxShadow: "0 0 18px var(--a)" }} />
      <div className="flex justify-between items-start">
        <span className="font-mono text-[10px] tracking-widest" style={{ color: "var(--a)" }}>T{String(t.id).padStart(2, "0")} · {t.tag.toUpperCase()}</span>
        {t.id === me.tier && <Crown size={14} style={{ color: "var(--a)" }} />}
      </div>
      <p className="font-disp text-2xl font-bold mt-3" style={{ color: "var(--a)", textShadow: "0 0 24px var(--a-glow)" }}>{t.name}</p>
      <p className="font-mono text-xl mt-1">{t.price}</p>
      <p className="text-xs text-neutral-500 mt-1">{t.look}</p>
      <ul className="mt-4 space-y-1.5 text-sm text-neutral-300 flex-1">
        {t.perks.map((p) => <li key={p} className="flex gap-2"><Check size={14} style={{ color: "var(--a)" }} className="shrink-0 mt-0.5" />{p}</li>)}
        {unlocks.length > 0 && <li className="font-mono text-[10px] text-neutral-600 pt-1">UNLOCKS · {unlocks.join(" · ")}</li>}
      </ul>
      <div className="flex gap-2 mt-5">
        {t.id === me.tier && t.id > 1 && (
          <button className="sf-btn sf-btn-sm" onClick={() => upgrade(t.id)} data-testid={`tier-renew-${t.id}`}><Bitcoin size={12} />Renew</button>
        )}
        {owned ? (
          <button className="sf-btn flex-1" style={{ borderColor: "var(--a)" }} disabled={active} onClick={() => setTheme(t.id)} data-testid={`tier-apply-${t.id}`}>{active ? "Active look" : "Apply look"}</button>
        ) : (
          <>
            <button className="sf-btn sf-btn-p flex-1" onClick={() => upgrade(t.id)} data-testid={`tier-upgrade-${t.id}`}><Bitcoin size={14} />Upgrade</button>
            <button className="sf-btn" onClick={() => { setPreview(t.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`Preview ${t.name}`} data-testid={`tier-preview-${t.id}`}><Eye size={14} /></button>
          </>
        )}
      </div>
      <span className="sr-only">{i}</span>
    </div>
  );
};

const MyPayments = () => {
  const { api, upgrade, me } = useSF();
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/billing/payments").then(setRows).catch(() => {}); }, [api, me.tier]);
  if (!rows.length) return null;
  return (
    <div className="sf-panel p-5 mt-6" data-testid="my-btc-payments">
      <div className="lab">YOUR BITCOIN PAYMENTS</div>
      <div className="space-y-1.5">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-[#111927] px-3 py-2 text-sm" data-testid={`my-payment-${p.id}`}>
            <span className="font-mono text-xs text-neutral-500 w-36">{new Date(p.created_at).toLocaleString()}</span>
            <span className="font-mono">T{p.tier} {p.tier_name}</span>
            <span className="font-mono text-[#F7931A]">{p.amount_btc} BTC</span>
            <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border border-slate-700" data-testid={`my-payment-status-${p.id}`}>{p.status}</span>
            {["pending", "seen"].includes(p.status) && <button className="sf-btn sf-btn-sm ml-auto" onClick={() => upgrade(p.tier, p)} data-testid={`my-payment-resume-${p.id}`}>Resume</button>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Tiers() {
  const { snap, me } = useSF();
  return (
    <section data-testid="page-tiers">
      <Hero kicker="MEMBERSHIP" title="Tiers" sub={`You're on T${me.tier} ${me.tier_name}${me.tier_expires_at ? ` · paid through ${new Date(me.tier_expires_at).toLocaleDateString()}` : ""}. Higher tiers · denser HUD · richer glow · more panels · more AI.`} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {snap.tiers.map((t, i) => <TierCard key={t.id} t={t} i={i} />)}
      </div>
      <p className="text-sm text-neutral-500 mt-6">Each card previews its own look. Tap the eye to try a look before upgrading. Press <kbd className="font-mono accent">[</kbd> / <kbd className="font-mono accent">]</kbd> to step between looks you own. Paid tiers are bought with Bitcoin: you get an exact BTC amount (held 15 min), pay from your own wallet, paste the transaction ID, and the tier unlocks after 1 confirmation for 30 days.</p>
      <MyPayments />
    </section>
  );
}

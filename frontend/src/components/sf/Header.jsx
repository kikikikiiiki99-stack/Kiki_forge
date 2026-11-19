import { useEffect, useState } from "react";
import { Download, Search, Wifi, WifiOff } from "lucide-react";
import { UserButton } from "@clerk/react";
import { useSF } from "@/context/SFContext";
import { PAGES, pct, priceFmt } from "@/lib/theme";
import { BellButton } from "@/components/sf/NotificationsSheet";
import { sectionOn, useSite } from "@/lib/site";

const Clock = () => {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <span className="hidden xl:flex items-center gap-2 font-mono text-xs text-neutral-400" data-testid="header-clock">
      <span className="pulse-dot" />{t.toLocaleTimeString("en-US", { hour12: false })}
    </span>
  );
};

const NetPill = () => {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => setOn(navigator.onLine);
    window.addEventListener("online", f); window.addEventListener("offline", f);
    return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); };
  }, []);
  return (
    <span className={`hidden md:flex items-center gap-1.5 font-mono text-[10px] tracking-widest px-2 py-1 border ${on ? "border-green-500/30 text-green-400" : "border-red-500/40 text-red-400"}`} data-testid="network-status">
      {on ? <Wifi size={12} /> : <WifiOff size={12} />}{on ? "ONLINE" : "OFFLINE"}
    </span>
  );
};

const TierSwitch = () => {
  const { snap, me, themeTier, setTheme } = useSF();
  if (!snap || !me) return null;
  return (
    <select
      className="sf-input !py-1.5 !text-xs hidden sm:block"
      value={Math.min(themeTier, me.tier)}
      onChange={(e) => setTheme(Number(e.target.value))}
      aria-label="Terminal look"
      data-testid="tier-theme-select"
    >
      {snap.tiers.filter((t) => t.id <= me.tier).map((t) => <option key={t.id} value={t.id}>T{t.id} {t.name}</option>)}
    </select>
  );
};

export const TickerTape = () => {
  const { snap, markets } = useSF();
  const items = [
    ...(markets?.crypto || []).map((c) => ({ s: c.sym, p: c.price, c: c.chg })),
    ...(snap?.tickers || []).map((t) => ({ s: t.sym, p: t.price, c: t.chg })),
  ];
  return (
    <div className="tape overflow-hidden border-t border-[var(--a-line)] bg-[#080B11]/70 py-1.5" data-testid="ticker-tape">
      <div className="tape-track font-mono text-xs whitespace-nowrap">
        {[...items, ...items].map((i, k) => (
          <span key={k} className="inline-flex gap-2"><b className="text-neutral-200">{i.s}</b><span className="text-neutral-400">{priceFmt(i.p)}</span><span className={i.c >= 0 ? "bull" : "bear"}>{pct(i.c)}</span></span>
        ))}
      </div>
    </div>
  );
};

export const navPages = (me, settings) => (me?.is_admin ? [...PAGES, { id: "admin", label: "Admin" }] : PAGES).filter((p) => sectionOn(settings, p.id));
export const useNavPages = () => { const { me } = useSF(); const settings = useSite().data?.settings; return navPages(me, settings); };

export const Header = ({ onCmd, onInstall, onBell }) => {
  const { page, setPage, snap, me, themeTier, setDepositOpen } = useSF();
  const tier = snap?.tiers[(me?.tier || 1) - 1];
  const pages = useNavPages();
  const site = useSite().data?.settings;
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#080B11]/85 border-b border-white/[0.06]">
      <div className="max-w-[1600px] mx-auto flex items-center gap-4 px-4 lg:px-8 h-16">
        <button className="flex items-center gap-3 shrink-0" onClick={() => setPage("home")} data-testid="brand-home-button">
          <span className="relative w-8 h-8 grid place-items-center">
            <span className="absolute inset-0 rounded-full blur-md" style={{ background: "var(--a)", opacity: 0.6 }} />
            <span className="relative w-5 h-5 rotate-45 border-2" style={{ borderColor: "var(--a)" }} />
          </span>
          <span className="text-left leading-none">
            <span className="font-disp font-bold tracking-[0.18em] text-lg block" data-testid="header-site-name">{site?.site_name || "STOCKFORGE"}</span>
            <span className="font-mono text-[9px] tracking-[0.3em] accent" data-testid="header-tier-sub">{snap?.tiers[themeTier - 1]?.name} TERMINAL</span>
          </span>
        </button>
        <nav className="hidden lg:flex items-center gap-0.5 mx-auto" aria-label="Primary">
          {pages.map((p) => (
            <button key={p.id} onClick={() => setPage(p.id)} data-testid={`nav-${p.id}`}
              className={`nav-pill ${page === p.id ? "nav-pill-on" : ""}`}>
              {p.id === "live" ? "● " : ""}{p.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          <button className="sf-btn sf-btn-sm" onClick={onCmd} data-testid="command-palette-button" aria-label="Open command palette"><Search size={14} /><span className="hidden md:inline">Search</span><kbd className="hidden md:inline text-[10px] text-neutral-500">⌘K</kbd></button>
          <button className="sf-btn sf-btn-sm" onClick={() => setDepositOpen(true)} data-testid="header-deposit-button"><span className="accent">$</span><span className="hidden sm:inline">Deposit</span></button>
          <BellButton onClick={onBell} />
          <NetPill />
          <button className="sf-btn sf-btn-sm sf-btn-p" onClick={onInstall} data-testid="get-app-button"><Download size={14} /><span className="hidden sm:inline">Get app</span></button>
          <Clock />
          <TierSwitch />
          {tier && <span className="hidden md:inline font-mono text-[10px] px-2 py-1 border border-[var(--a)] accent tracking-widest" data-testid="tier-badge">T{tier.id} {tier.name}</span>}
          <UserButton />
        </div>
      </div>
      <TickerTape />
    </header>
  );
};

export const MobileNav = () => {
  const { page, setPage } = useSF();
  const pages = useNavPages();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 mobile-dock overflow-x-auto" aria-label="Primary mobile">
      <div className="flex min-w-max gap-1 px-2 py-2">
        {pages.map((p) => (
          <button key={p.id} onClick={() => setPage(p.id)} data-testid={`mobile-nav-${p.id}`}
            className={`dock-btn ${page === p.id ? "dock-btn-on" : ""}`}>{p.label}</button>
        ))}
      </div>
    </nav>
  );
};

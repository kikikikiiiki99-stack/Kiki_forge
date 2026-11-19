import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { SFProvider, useSF } from "@/context/SFContext";
import { Background } from "@/components/sf/Background";
import { Header, MobileNav } from "@/components/sf/Header";
import { CommandPalette } from "@/components/sf/CommandPalette";
import { InstallDrawer } from "@/components/sf/InstallDrawer";
import { TickerDialog } from "@/components/sf/TickerDialog";
import { useNavPages } from "@/components/sf/Header";
import { AnnouncementBanner } from "@/components/sf/AnnouncementBanner";
import { sectionOn, useSite } from "@/lib/site";
const Feed = lazy(() => import("@/pages/Feed"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Quotes = lazy(() => import("@/pages/Quotes"));
const Live = lazy(() => import("@/pages/Live"));
const Scanner = lazy(() => import("@/pages/Scanner"));
const Watchlist = lazy(() => import("@/pages/Watchlist"));
const Advisor = lazy(() => import("@/pages/Advisor"));
const Paper = lazy(() => import("@/pages/Paper"));
const Tiers = lazy(() => import("@/pages/Tiers"));
const Admin = lazy(() => import("@/pages/Admin"));
import { AdminAccess } from "@/components/sf/AdminAccess";
import { BtcCheckout } from "@/components/sf/BtcCheckout";
import { NotificationsSheet } from "@/components/sf/NotificationsSheet";
const Markets = lazy(() => import("@/pages/Markets"));
const PredictionDialog = lazy(() => import("@/components/forge/PredictionDialog"));
const DepositDialog = lazy(() => import("@/components/forge/DepositDialog"));

// Warm every route chunk once the browser is idle so navigation never waits on the network.
const prefetchRoutes = () => {
  const run = () => [
    import("@/pages/Dashboard"), import("@/pages/Markets"), import("@/pages/Quotes"), import("@/pages/Live"), import("@/pages/Scanner"),
    import("@/pages/Watchlist"), import("@/pages/Advisor"), import("@/pages/Paper"), import("@/pages/Tiers"),
    import("@/components/forge/PredictionDialog"), import("@/components/forge/DepositDialog"),
  ];
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(run);
};

// Skeleton placeholder shaped like a page: hero line + a card grid.
const PageFallback = ({ testid = "page-loading" }) => (
  <div className="space-y-6" data-testid={testid} aria-busy="true">
    <div className="space-y-3"><div className="sk h-3 w-28" /><div className="sk h-10 w-72 max-w-full" /><div className="sk h-4 w-96 max-w-full" /></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map((k) => <div key={k} className="sk h-56" />)}</div>
  </div>
);

const goTrade = (sf, sym) => {
  sf.openPredict(null);
  if (sf.can("paper")) { sf.setTradeSym(sym); sf.setPage("trade"); } else { sf.setPage("tiers"); }
};

const MarketsView = () => {
  const sf = useSF();
  return <Markets watch={sf.me.watch} onPredict={sf.openPredict} onTrade={(s) => goTrade(sf, s)} onToggleWatch={sf.toggleWatch} />;
};

const ForgeOverlays = () => {
  const sf = useSF();
  return (
    <>
      <Suspense fallback={null}>
      <PredictionDialog sym={sf.predictSym} onClose={() => sf.openPredict(null)} onTrade={(s) => goTrade(sf, s)}
        onToggleWatch={sf.toggleWatch} watching={!!sf.me?.watch.includes(sf.predictSym)} canTrade={sf.can("paper")} />
      <DepositDialog open={sf.depositOpen} onClose={() => sf.setDepositOpen(false)} onFunds={sf.refreshMe} />
      </Suspense>
    </>
  );
};

const VIEWS = { home: Feed, markets: MarketsView, dash: Dashboard, quotes: Quotes, live: Live, scan: Scanner, watch: Watchlist, ai: Advisor, trade: Paper, tiers: Tiers, admin: Admin };

const Boot = () => {
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem("sf_booted"); } catch { return false; } });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!show) return;
    const a = setTimeout(() => setLeaving(true), 900);
    const b = setTimeout(() => { try { sessionStorage.setItem("sf_booted", "1"); } catch { /* ignore */ } setShow(false); }, 1150);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [show]);
  if (!show) return null;
  return (
    <div className={`fixed inset-0 z-[100] bg-[#080B11] grid place-items-center ${leaving ? "boot-out" : ""}`} data-testid="boot-screen">
      <div className="w-72">
        <p className="font-disp text-4xl font-bold tracking-[0.2em]">{(() => { try { return JSON.parse(localStorage.getItem("sf_site_name") || "null"); } catch { return null; } })() || "STOCKFORGE"}</p>
        <p className="font-mono text-[10px] tracking-[0.35em] accent mt-1">NEURAL TERMINAL · v3</p>
        <p className="font-mono text-xs text-neutral-500 mt-6 caret">linking market feeds</p>
        <div className="boot-bar h-[2px] bg-white/5 mt-3"><i /></div>
      </div>
    </div>
  );
};

const PreviewBar = () => {
  const { preview, setPreview, me, snap, upgrade } = useSF();
  if (!preview || !me || preview <= me.tier) return null;
  const t = snap.tiers[preview - 1];
  return (
    <div className="sticky top-[97px] z-30 flex flex-wrap items-center justify-center gap-3 px-4 py-2 bg-[var(--a)] text-black font-mono text-xs" data-testid="preview-bar">
      Previewing the T{t.id} {t.name} look · features stay at your current tier
      <button className="px-2 py-1 bg-black text-white" onClick={() => upgrade(preview)} data-testid="preview-upgrade-button">Upgrade {t.price}</button>
      <button className="px-2 py-1 border border-black" onClick={() => setPreview(null)} data-testid="preview-exit-button">Exit preview</button>
    </div>
  );
};

const Shell = () => {
  const { page, setPage, themeTier, snap, me, setTheme } = useSF();
  const [cmd, setCmd] = useState(false);
  const [install, setInstall] = useState(false);
  const [bell, setBell] = useState(false);
  const pages = useNavPages();
  const site = useSite().data?.settings;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((c) => !c); return; }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || e.metaKey || e.ctrlKey) return;
      if (/^[1-9]$/.test(e.key) && pages[Number(e.key) - 1]) setPage(pages[Number(e.key) - 1].id);
      if (me && e.key === "]" && themeTier < me.tier) setTheme(themeTier + 1);
      if (me && e.key === "[" && themeTier > 1) setTheme(Math.min(themeTier, me.tier) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPage, me, themeTier, setTheme, pages]);

  useEffect(() => { prefetchRoutes(); }, []);
  useEffect(() => { if (site?.site_name) try { localStorage.setItem("sf_site_name", JSON.stringify(site.site_name)); } catch { /* ignore */ } }, [site?.site_name]);
  const View = (sectionOn(site, page) && VIEWS[page]) || Feed;
  return (
    <div className="min-h-screen relative">
      <Boot />
      <Background tier={themeTier} />
      <div className="relative z-10">
        <Header onCmd={() => setCmd(true)} onInstall={() => setInstall(true)} onBell={() => setBell(true)} />
        <AnnouncementBanner />
        <PreviewBar />
        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-32 lg:pb-16">
          <p className="font-mono text-[10px] tracking-widest text-neutral-500 mb-6 hidden sm:block" data-testid="snapshot-note">
            SESSION SNAPSHOT · {snap?.snapshotDate} · <span className="accent">MARKETS</span> covers every NASDAQ listing + top 100 crypto live · not investment advice
          </p>
          {snap && me ? <Suspense fallback={<PageFallback />}><div key={page} className="page-in"><View /></div></Suspense> : <PageFallback testid="terminal-loading" />}
        </main>
        <footer className="hidden lg:flex max-w-[1600px] mx-auto px-8 py-6 justify-between font-mono text-[10px] tracking-widest text-neutral-600 border-t border-white/5">
          <span>STOCKFORGE · {snap?.snapshotDate}</span>
          <span>⌘K palette · 1–9 pages · [ ] tier look · esc close</span>
          <span>NOT INVESTMENT ADVICE</span>
        </footer>
        <MobileNav />
      </div>
      <CommandPalette open={cmd} onOpenChange={setCmd} onInstall={() => setInstall(true)} />
      <InstallDrawer open={install} onOpenChange={setInstall} extra={<AdminAccess onDone={() => setInstall(false)} />} />
      <TickerDialog />
      <BtcCheckout />
      <NotificationsSheet open={bell} onOpenChange={setBell} />
      <ForgeOverlays />
    </div>
  );
};

export default function Terminal() {
  return (
    <SFProvider>
      <Shell />
      <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#0D131F", border: "1px solid var(--a-line)", borderRadius: 8, color: "#F1F5F9", fontFamily: "JetBrains Mono Variable, monospace", fontSize: 12 } }} />
    </SFProvider>
  );
}

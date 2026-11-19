import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSF } from "@/context/SFContext";
import { Hero, Chg } from "@/components/sf/ui";
import { Sparkline } from "@/components/sf/Sparkline";
import { Locked } from "@/components/sf/Locked";
import { money } from "@/lib/theme";
import { sectionOn, useSite } from "@/lib/site";
import { FeaturedStrip } from "@/components/sf/FeaturedStrip";

const SORTS = { movers: (a, b) => Math.abs(b.chg) - Math.abs(a.chg), conf: (a, b) => b.conf - a.conf, cap: (a, b) => b.capN - a.capN, sym: (a, b) => a.sym.localeCompare(b.sym) };

export const FeedCard = ({ t, i }) => {
  const { openTicker } = useSF();
  return (
    <button onClick={() => openTicker(t.sym)} className="sf-panel sf-hover p-5 text-left rise" style={{ animationDelay: `${i * 50}ms` }} data-testid={`feed-card-${t.sym}`}>
      <div className="flex justify-between items-start">
        <div><p className="font-disp text-2xl font-bold">{t.sym}</p><p className="text-xs text-neutral-500">{t.name}</p></div>
        <div className="text-right"><p className="font-mono text-lg">{money(t.price)}</p><Chg v={t.chg} className="text-xs" /></div>
      </div>
      <p className="text-sm text-neutral-400 mt-3 min-h-[20px]">{t.note}</p>
      <div className="my-4"><Sparkline data={t.hist} w={300} h={44} /></div>
      <div className="flex justify-between font-mono text-[10px] tracking-widest text-neutral-500 mb-1.5"><span>CONFIDENCE</span><span className="accent">{t.conf}</span></div>
      <div className="h-1 bg-white/5"><div className="h-full" style={{ width: `${t.conf}%`, background: "linear-gradient(90deg, var(--a2), var(--a))", boxShadow: "0 0 12px var(--a-glow)" }} /></div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        <span className="font-mono text-[10px] px-2 py-0.5 border border-[var(--a-line)] accent">{t.bias}</span>
        {t.catalysts.slice(0, 2).map(([c]) => <span key={c} className="font-mono text-[10px] px-2 py-0.5 bg-white/5 text-neutral-300">{c}</span>)}
      </div>
    </button>
  );
};

export default function Feed() {
  const { snap, can, setPage } = useSF();
  const [sort, setSort] = useState(() => localStorage.getItem("sf_sort") || "movers");
  const list = useMemo(() => [...snap.tickers].sort(SORTS[sort]), [snap, sort]);
  const full = can("fullFeed");
  const site = useSite();
  const s = site.data?.settings;
  const pick = (s) => { setSort(s); localStorage.setItem("sf_sort", s); };
  return (
    <section data-testid="page-home">
      <Hero kicker="SESSION TAPE" title={s?.home_headline || "Market Feed"} sub={s?.home_sub ?? "Session momentum · tap any name for a deep dive"}>
        <div className="seg" role="group">
          {Object.keys(SORTS).map((s) => (
            <button key={s} onClick={() => pick(s)} data-testid={`feed-sort-${s}`}
              className={`seg-btn ${sort === s ? "seg-btn-on" : ""}`}>{s === "sym" ? "A–Z" : s}</button>
          ))}
        </div>
        <button className="sf-btn" onClick={() => toast.success("Feed refreshed from the session snapshot")} data-testid="feed-refresh-button">Refresh</button>
        {sectionOn(s, "scan") && <button className="sf-btn sf-btn-p" onClick={() => setPage("scan")} data-testid="feed-scanner-button">Scanner</button>}
      </Hero>
      {!site.isError && <FeaturedStrip items={site.data?.items} loading={site.isLoading} />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(full ? list : list.slice(0, 4)).map((t, i) => <FeedCard key={t.sym} t={t} i={i} />)}
      </div>
      {!full && (
        <Locked gate="fullFeed" label="Full feed" className="mt-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{list.slice(4, 8).map((t, i) => <FeedCard key={t.sym} t={t} i={i} />)}</div>
        </Locked>
      )}
    </section>
  );
}

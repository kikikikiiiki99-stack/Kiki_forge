import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Radar, Search, Star } from "lucide-react";
import { fmtCap, fmtPct, fmtPrice, publicFetch, type Asset, type UniversePage, type UniverseStats } from "@/lib/forge";

type Tab = "stock" | "crypto" | "gainers" | "losers" | "mega" | "watch";
const TABS: { id: Tab; label: string }[] = [
  { id: "stock", label: "NASDAQ equities" },
  { id: "crypto", label: "Top 100 crypto" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "mega", label: "Mega caps" },
  { id: "watch", label: "Watchlist" },
];
const SORTS = [
  { id: "cap", label: "Market cap" }, { id: "chg", label: "24h change" }, { id: "price", label: "Price" }, { id: "vol", label: "Volume" }, { id: "sym", label: "Symbol" },
];

const useDebounced = (v: string, ms = 250) => {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
};

export interface MarketsProps {
  watch: string[];
  onPredict: (sym: string) => void;
  onTrade: (sym: string) => void;
  onToggleWatch: (sym: string) => void;
}

export default function Markets({ watch, onPredict, onTrade, onToggleWatch }: MarketsProps) {
  const [tab, setTab] = useState<Tab>("stock");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState("cap");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [tab, dq, sector, sort, dir]);

  const kind = tab === "crypto" ? "crypto" : tab === "stock" ? "stock" : "all";
  const filter = tab === "gainers" || tab === "losers" || tab === "mega" ? tab : "";
  const stats = useQuery({ queryKey: ["universe-stats"], queryFn: () => publicFetch<UniverseStats>("/universe/stats"), staleTime: 120_000 });
  const list = useQuery({
    queryKey: ["universe", kind, dq, sector, filter, sort, dir, page],
    queryFn: () => publicFetch<UniversePage>(`/universe?kind=${kind}&q=${encodeURIComponent(dq)}&sector=${encodeURIComponent(sector)}&filter=${filter}&sort=${sort}&dir=${dir}&page=${page}&limit=50`),
    enabled: tab !== "watch",
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const watchQ = useQuery({
    queryKey: ["universe-batch", watch.join(",")],
    queryFn: () => publicFetch<Record<string, Asset>>(`/universe/batch?syms=${encodeURIComponent(watch.join(","))}`),
    enabled: tab === "watch" && watch.length > 0,
  });

  const rows: Asset[] = tab === "watch" ? Object.values(watchQ.data ?? {}) : (list.data && !list.isError ? list.data.rows : []);
  const total = tab === "watch" ? rows.length : list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const s = stats.data && !stats.isError ? stats.data : undefined;

  return (
    <section data-testid="page-markets">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6 rise">
        <div>
          <p className="kicker mb-2">FULL UNIVERSE</p>
          <h2 className="font-disp sf-title text-4xl sm:text-5xl font-bold tracking-tight">Markets</h2>
          <p className="text-neutral-400 mt-2 text-sm md:text-base">Every NASDAQ listing and the top 100 cryptos by market cap · tap any row for the quantum forecast</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs" data-testid="markets-stats">
          {[["NASDAQ", s ? s.stocks.toLocaleString() : "—"], ["CRYPTO", s ? String(s.crypto) : "—"], ["ADV / DEC", s ? `${s.advancers} / ${s.decliners}` : "—"], ["CRYPTO CAP", s ? fmtCap(s.crypto_cap) : "—"]].map(([k, v]) => (
            <div key={k} className="sf-panel px-3 py-2"><p className="text-[9px] tracking-widest text-neutral-500">{k}</p><p className="text-base font-bold text-white">{v}</p></div>
          ))}
        </div>
      </div>

      {s && (
        <div className="grid md:grid-cols-3 gap-3 mb-6">
          {([["TOP NASDAQ GAINERS", s.stock_gainers], ["TOP NASDAQ LOSERS", s.stock_losers], ["CRYPTO LEADERS 24H", s.crypto_gainers]] as const).map(([title, list_]) => (
            <div key={title} className="sf-panel p-3" data-testid={`movers-${title.split(" ")[1].toLowerCase()}-${title.split(" ").pop()?.toLowerCase()}`}>
              <div className="lab !mb-2">{title}</div>
              {list_.map((m) => (
                <button key={m.sym} onClick={() => onPredict(m.sym)} className="w-full flex items-center gap-2 py-1 font-mono text-xs hover:bg-white/5 px-1 transition-colors duration-150" data-testid={`mover-${m.sym}`}>
                  <b className="w-16 text-left accent">{m.sym}</b><span className="flex-1 text-left text-neutral-500 truncate">{m.name}</span>
                  <span>{fmtPrice(m.price)}</span><span className={`w-16 text-right ${m.chg >= 0 ? "bull" : "bear"}`}>{fmtPct(m.chg, false)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="sf-panel p-3 mb-3 flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`markets-tab-${t.id}`}
              className={`font-mono text-[11px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors duration-150 ${tab === t.id ? "border-[var(--a)] text-white bg-[var(--a-soft)]" : "border-transparent text-neutral-400 hover:text-white"}`}>{t.label}</button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input className="sf-input w-full !pl-9" placeholder="Search symbol or company…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="symbol-search-input" />
        </div>
        {tab !== "watch" && (
          <>
            <select className="sf-input !py-2 !text-xs" value={sector} onChange={(e) => setSector(e.target.value)} data-testid="markets-sector-select">
              <option value="">All sectors</option>
              {(list.data?.sectors ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="sf-input !py-2 !text-xs" value={sort} onChange={(e) => setSort(e.target.value)} data-testid="markets-sort-select">
              {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <button className="sf-btn sf-btn-sm" onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))} data-testid="markets-sort-dir-button">{dir === "desc" ? "↓ DESC" : "↑ ASC"}</button>
          </>
        )}
      </div>

      <div className="sf-panel overflow-x-auto" data-testid="markets-table">
        <table className="w-full min-w-[760px] font-mono text-sm">
          <thead>
            <tr className="text-[10px] tracking-widest uppercase text-neutral-500 border-b border-white/10">
              <th className="text-left px-3 py-2.5 w-10">#</th><th className="text-left px-2">Symbol</th><th className="text-left px-2">Name</th><th className="text-left px-2 hidden xl:table-cell">Sector</th>
              <th className="text-right px-2">Price</th><th className="text-right px-2">24h</th><th className="text-right px-2">Mkt cap</th><th className="text-right px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const w = watch.includes(r.sym);
              return (
                <tr key={`${r.kind}-${r.sym}`} style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
                  className="row-in border-b border-white/5 hover:bg-[var(--a-soft)] cursor-pointer transition-colors duration-150" onClick={() => onPredict(r.sym)} data-testid={`markets-row-${r.sym}`}>
                  <td className="px-3 py-2 text-neutral-600 text-xs">{r.kind === "crypto" ? r.rank : (page - 1) * 50 + i + 1}</td>
                  <td className="px-2 py-2"><span className="flex items-center gap-2">{r.image && <img src={r.image} alt="" className="w-4 h-4 rounded-full" loading="lazy" />}<b className="accent tracking-wider">{r.sym}</b></span></td>
                  <td className="px-2 py-2 text-neutral-300 max-w-[260px] truncate font-sans text-[13px]">{r.name}</td>
                  <td className="px-2 py-2 text-neutral-500 text-xs hidden xl:table-cell">{r.sector}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPrice(r.price)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${r.chg >= 0 ? "bull" : "bear"}`}>{r.chg >= 0 ? "▲" : "▼"} {Math.abs(r.chg).toFixed(2)}%</td>
                  <td className="px-2 py-2 text-right text-neutral-400 tabular-nums">{fmtCap(r.cap)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button className="sf-btn sf-btn-sm !px-2" onClick={() => onToggleWatch(r.sym)} aria-label={w ? `Unwatch ${r.sym}` : `Watch ${r.sym}`} data-testid={`watch-btn-${r.sym}`}><Star size={12} fill={w ? "currentColor" : "none"} /></button>
                    <button className="sf-btn sf-btn-sm ml-1" onClick={() => onTrade(r.sym)} data-testid={`trade-btn-${r.sym}`}>Trade</button>
                    <button className="sf-btn sf-btn-sm sf-btn-p ml-1" onClick={() => onPredict(r.sym)} data-testid={`predict-btn-${r.sym}`}><Radar size={12} />Predict</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(list.isLoading || watchQ.isLoading) && <p className="p-6 text-center font-mono text-xs text-neutral-500 caret" data-testid="markets-loading">Loading universe</p>}
        {list.isError && tab !== "watch" && <p className="p-6 text-center font-mono text-xs text-rose-400" data-testid="markets-error">Market directory unreachable — retrying shortly.</p>}
        {!rows.length && !list.isLoading && !watchQ.isLoading && <p className="p-6 text-center font-mono text-xs text-neutral-500" data-testid="markets-empty">{tab === "watch" ? "Star symbols to build your watchlist." : "No symbols match."}</p>}
      </div>
      {tab !== "watch" && (
        <div className="flex items-center justify-between mt-3 font-mono text-xs text-neutral-500">
          <span data-testid="markets-total">{total.toLocaleString()} symbols · {list.data?.sources ? Object.values(list.data.sources).join(" · ") : ""}</span>
          <div className="flex items-center gap-2">
            <button className="sf-btn sf-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" data-testid="markets-prev-button"><ChevronLeft size={12} /></button>
            <span data-testid="markets-page">{page} / {pages}</span>
            <button className="sf-btn sf-btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page" data-testid="markets-next-button"><ChevronRight size={12} /></button>
          </div>
        </div>
      )}
    </section>
  );
}

import { useDeferredValue, useMemo, useState } from "react";
import { useSF } from "@/context/SFContext";
import { Hero, Chg } from "@/components/sf/ui";
import { money } from "@/lib/theme";

const COLS = [["sym", "Name"], ["price", "Last"], ["chg", "1D"], ["capN", "Cap"], [null, "52W"], ["conf", "Rank"]];

export default function Quotes() {
  const { snap, bySym, openTicker } = useSF();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: "conf", dir: -1 });
  const dq = useDeferredValue(q); // typing stays responsive; the table catches up
  const rows = useMemo(() => {
    const f = snap.tickers.filter((t) => `${t.sym} ${t.name}`.toLowerCase().includes(dq.toLowerCase()));
    return f.sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : -1) * sort.dir);
  }, [snap, dq, sort]);
  const click = (k) => k && setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }));
  return (
    <section data-testid="page-quotes">
      <Hero kicker="SNAPSHOT BOARD" title="Quotes" sub="Mag7 · ETFs · session levels · tap a column to sort">
        <input className="sf-input w-56" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="quote-filter-input" />
      </Hero>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        {snap.mag7.map((s) => (
          <button key={s} onClick={() => openTicker(s)} className="sf-panel sf-hover p-3 text-left" data-testid={`mag7-${s}`}>
            <p className="font-disp font-bold">{s}</p><p className="font-mono text-sm">{money(bySym[s].price)}</p><Chg v={bySym[s].chg} className="text-[11px]" />
          </button>
        ))}
      </div>
      <div className="sf-panel overflow-x-auto">
        <table className="w-full text-sm" data-testid="quotes-table">
          <thead>
            <tr className="border-b border-[var(--a-line)]">
              {COLS.map(([k, l]) => (
                <th key={l} onClick={() => click(k)} className={`text-left font-mono text-[10px] tracking-widest uppercase px-4 py-3 text-neutral-500 ${k ? "cursor-pointer hover:text-white" : ""}`} data-testid={`quotes-sort-${l.toLowerCase()}`}>
                  {l}{sort.k === k ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.sym} onClick={() => openTicker(t.sym)} className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors" data-testid={`quote-row-${t.sym}`}>
                <td className="px-4 py-3"><b className="font-disp">{t.sym}</b> <span className="text-neutral-500 ml-2">{t.name}</span></td>
                <td className="px-4 py-3 font-mono">{money(t.price)}</td>
                <td className="px-4 py-3"><Chg v={t.chg} /></td>
                <td className="px-4 py-3 font-mono text-neutral-400">{t.cap}</td>
                <td className="px-4 py-3 font-mono text-neutral-400">{t.range52}</td>
                <td className="px-4 py-3 font-mono accent">{t.conf}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-neutral-500 font-mono text-sm" data-testid="quotes-empty">No names match “{q}”.</p>}
      </div>
    </section>
  );
}

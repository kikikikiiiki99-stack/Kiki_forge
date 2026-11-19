import { useSF } from "@/context/SFContext";
import { Hero, Chg } from "@/components/sf/ui";
import { Locked } from "@/components/sf/Locked";
import { money } from "@/lib/theme";

export default function Scanner() {
  const { snap, openTicker } = useSF();
  const leaders = [...snap.tickers].map((t) => ({ ...t, score: Math.round(t.conf + t.chg * 6) })).sort((a, b) => b.score - a.score);
  const cats = snap.tickers.flatMap((t) => t.catalysts.map(([c, w]) => ({ sym: t.sym, c, w, bias: t.bias })));
  return (
    <section data-testid="page-scan">
      <Hero kicker="SIGNALS" title="Scanner" sub="Strength & catalysts" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="sf-panel p-5" data-testid="scanner-leaders">
          <div className="lab">STRENGTH LEADERS</div>
          {leaders.map((t, i) => (
            <button key={t.sym} onClick={() => openTicker(t.sym)} className="w-full flex items-center gap-4 py-2.5 border-b border-white/5 hover:bg-white/5 px-2 transition-colors" data-testid={`leader-${t.sym}`}>
              <span className="font-mono text-xs text-neutral-600 w-5">{String(i + 1).padStart(2, "0")}</span>
              <b className="font-disp w-16 text-left">{t.sym}</b>
              <div className="flex-1 h-1.5 bg-white/5"><div className="h-full" style={{ width: `${Math.max(5, Math.min(100, t.score))}%`, background: "var(--a)", boxShadow: "0 0 10px var(--a-glow)" }} /></div>
              <span className="font-mono text-sm accent w-8 text-right">{t.score}</span>
              <span className="font-mono text-sm w-24 text-right">{money(t.price)}</span>
              <Chg v={t.chg} className="text-xs w-20 text-right" />
            </button>
          ))}
        </div>
        <Locked gate="catalysts" label="Catalyst radar">
          <div className="sf-panel p-5 h-full" data-testid="scanner-catalysts">
            <div className="lab">CATALYST RADAR</div>
            <div className="space-y-2">
              {cats.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border border-white/5 hover:border-[var(--a-line)] transition-colors">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.w.includes("Oct") || c.w === "Today" ? "var(--a)" : "#525252" }} />
                  <b className="font-disp w-14">{c.sym}</b><span className="flex-1 text-sm text-neutral-300">{c.c}</span>
                  <span className="font-mono text-[11px] accent">{c.w}</span>
                </div>
              ))}
            </div>
          </div>
        </Locked>
      </div>
    </section>
  );
}

import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSF } from "@/context/SFContext";
import { Sparkline } from "@/components/sf/Sparkline";
import { Chg } from "@/components/sf/ui";
import { money } from "@/lib/theme";

const Row = ({ k, v }) => (
  <div className="flex justify-between py-1.5 border-b border-white/5 text-sm"><span className="text-neutral-500">{k}</span><span className="font-mono">{v}</span></div>
);

export const TickerDialog = () => {
  const { ticker, openTicker, bySym, api, me, setMe, setPage, can, openPredict, setTradeSym } = useSF();
  const t = bySym[ticker];
  if (!t) return null;
  const watching = me?.watch.includes(t.sym);
  const watch = async () => {
    try {
      const r = watching ? await api.del(`/watchlist/${t.sym}`) : await api.post("/watchlist", { sym: t.sym });
      setMe((m) => ({ ...m, watch: r.watch }));
      toast.success(watching ? `${t.sym} removed` : `${t.sym} added to watchlist`);
    } catch (e) { toast.error(e.message); }
  };
  return (
    <Dialog open={!!ticker} onOpenChange={(o) => !o && openTicker(null)}>
      <DialogContent className="bg-[#080808] border-[var(--a-line)] max-w-lg" data-testid="ticker-dialog">
        <DialogHeader>
          <p className="kicker">DEEP DIVE</p>
          <DialogTitle className="font-disp text-3xl flex items-baseline gap-3">{t.sym}<span className="text-base text-neutral-400 font-sans">{t.name}</span></DialogTitle>
          <DialogDescription>{t.note}</DialogDescription>
        </DialogHeader>
        <div className="flex items-end justify-between">
          <span className="font-mono text-3xl font-bold" data-testid="ticker-dialog-price">{money(t.price)}</span><Chg v={t.chg} className="text-lg" />
        </div>
        <Sparkline data={t.hist} w={460} h={80} />
        <div className="grid grid-cols-2 gap-x-6">
          <Row k="Market cap" v={t.cap} /><Row k="Avg volume" v={t.avgVol} />
          <Row k="Day range" v={t.range1d} /><Row k="52W range" v={t.range52} />
          <Row k="Confidence" v={`${t.conf}/100`} /><Row k="Bias" v={t.bias} />
          <Row k="Volatility" v={t.vol} /><Row k="Insider" v={t.insider} />
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {t.catalysts.map(([c, w]) => <span key={c} className="font-mono text-[11px] px-2 py-1 border border-[var(--a-line)]">{c} · <span className="accent">{w}</span></span>)}
        </div>
        <div className="flex gap-2 mt-3">
          <button className="sf-btn sf-btn-p" onClick={watch} data-testid="ticker-dialog-watch-button">{watching ? "Unwatch" : "+ Watchlist"}</button>
          <button className="sf-btn" onClick={() => { openTicker(null); setTradeSym(t.sym); setPage(can("paper") ? "trade" : "tiers"); }} data-testid="ticker-dialog-trade-button">Paper trade</button>
          <button className="sf-btn sf-btn-p ml-auto" onClick={() => { openTicker(null); openPredict(t.sym); }} data-testid="ticker-dialog-predict-button">◎ Advanced prediction</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

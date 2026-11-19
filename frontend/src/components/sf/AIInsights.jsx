import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, TrendingUp } from "lucide-react";
import { useSF } from "@/context/SFContext";

const KINDS = [["summary", "Market summary", Sparkles], ["prediction", "Prediction commentary", TrendingUp]];

export const AIInsights = () => {
  const { api, snap, markets, me, refreshMe } = useSF();
  const syms = [...new Set([...me.watch, ...snap.tickers.map((t) => t.sym), ...(markets?.crypto || []).map((c) => c.sym)])];
  const [sym, setSym] = useState(syms[0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (kind) => {
    setBusy(true); setText("");
    try { await api.stream("/insights", { sym, kind }, setText); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); refreshMe(); }
  };
  const limit = me.ai_limit;
  const used = me.ai_used || 0;
  return (
    <div className="sf-panel p-5 space-y-4" data-testid="ai-insights-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="lab !mb-0">AI INSIGHTS · CLAUDE</div>
        <div className="flex items-center gap-2 min-w-[180px]" data-testid="ai-usage-meter">
          <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[var(--a)] transition-[width] duration-500" style={{ width: limit ? `${Math.min(100, (used / limit) * 100)}%` : "8%" }} />
          </div>
          <span className="font-mono text-[10px] text-neutral-400">{limit ? `${used}/${limit} today` : `${used} today · unlimited`}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <select className="sf-input !py-1.5 !text-xs" value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Symbol" data-testid="ai-insight-symbol">{syms.map((s) => <option key={s}>{s}</option>)}</select>
        {KINDS.map(([k, label, Icon]) => (
          <button key={k} className="sf-btn sf-btn-sm" onClick={() => run(k)} disabled={busy || (limit && used >= limit)} data-testid={`ai-insight-${k}-button`}><Icon size={12} />{label}</button>
        ))}
      </div>
      <div aria-live="polite" className={`min-h-[96px] rounded-md bg-[#080E18] border border-slate-800 p-4 text-sm leading-relaxed text-neutral-200 whitespace-pre-wrap ${busy ? "caret" : ""}`} data-testid="ai-insight-output">
        {text || <span className="text-neutral-500">{limit && used >= limit ? "You've used today's AI insights for your tier — upgrade for more." : `Pick a symbol and ask for a plain-language summary or a read on the ${sym} prediction.`}</span>}
      </div>
    </div>
  );
};

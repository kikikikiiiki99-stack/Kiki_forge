import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Lock, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSF } from "@/context/SFContext";
import { useFiles } from "@/lib/files";

const EXPORTS = [["watchlist", "Watchlist"], ["alerts", "Alerts"], ["history", "Price history"]];

export const ImportExport = ({ open, onOpenChange }) => {
  const { can, snap, upgrade, refreshMe } = useSF();
  const { download, upload } = useFiles();
  const [mode, setMode] = useState("watchlist");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const allowed = can("export");
  const need = snap?.gates.export;

  const doExport = async (kind, fmt) => {
    try { await download(`/export/${kind}?fmt=${fmt}`, `stockforge-${kind}.${fmt}`); toast.success(`${kind} exported as ${fmt.toUpperCase()}`); }
    catch (e) { toast.error(e.message); }
  };
  const doImport = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await upload(`/import?mode=${mode}`, file);
      toast.success(`Imported ${r.imported.length} ${mode === "watchlist" ? "symbols" : "positions"}`, { description: r.skipped.length ? `Skipped unknown: ${r.skipped.join(", ")}` : undefined });
      refreshMe();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0B101B] border border-slate-800 rounded-xl max-w-lg" data-testid="import-export-dialog">
        <DialogTitle className="font-disp text-lg flex items-center gap-2"><FileSpreadsheet size={18} className="accent" /> Import & export</DialogTitle>
        <DialogDescription className="text-xs text-neutral-400">CSV or Excel (.xlsx). Imports need a <code className="accent">sym</code> column; portfolios also need <code className="accent">qty</code> and optionally <code className="accent">entry</code>.</DialogDescription>
        {!allowed ? (
          <div className="text-center py-6 space-y-3" data-testid="import-export-locked">
            <Lock className="mx-auto accent" size={20} />
            <p className="text-sm text-neutral-300">Import & export unlock at <b className="accent">T{need} {snap?.tiers[need - 1]?.name}</b> · {snap?.tiers[need - 1]?.price}</p>
            <button className="sf-btn sf-btn-p" onClick={() => { onOpenChange(false); upgrade(need); }} data-testid="import-export-upgrade-button">Upgrade with Bitcoin</button>
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <div className="lab">EXPORT</div>
              <div className="space-y-1.5">
                {EXPORTS.map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2 rounded-md border border-slate-800 bg-[#111927] px-3 py-2">
                    <span className="text-sm flex-1">{label}</span>
                    {["csv", "xlsx"].map((f) => <button key={f} className="sf-btn sf-btn-sm" onClick={() => doExport(k, f)} data-testid={`export-${k}-${f}`}><Download size={12} />{f}</button>)}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="lab">IMPORT</div>
              <div className="flex gap-1.5 mb-2" role="radiogroup">
                {[["watchlist", "Watchlist"], ["portfolio", "Portfolio → paper desk"]].map(([m, l]) => (
                  <button key={m} role="radio" aria-checked={mode === m} className={`sf-btn sf-btn-sm ${mode === m ? "sf-btn-p" : ""}`} onClick={() => setMode(m)} data-testid={`import-mode-${m}`}>{l}</button>
                ))}
              </div>
              <label
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); doImport(e.dataTransfer.files[0]); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 cursor-pointer transition-colors duration-150 ${drag ? "border-[var(--a)] bg-[var(--a-soft)]" : "border-slate-700 hover:border-[var(--a)]"}`}
                data-testid="import-dropzone">
                <Upload size={18} className="accent" />
                <span className="text-sm text-neutral-300">{busy ? "Importing…" : "Drop a .csv / .xlsx here or click to choose"}</span>
                <input ref={input} type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => doImport(e.target.files[0])} data-testid="import-file-input" />
              </label>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

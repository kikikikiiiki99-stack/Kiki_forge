import { useEffect, useState } from "react";
import { publicGet } from "@/lib/sfapi";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useSF } from "@/context/SFContext";
import { useNavPages } from "@/components/sf/Header";

export const CommandPalette = ({ open, onOpenChange, onInstall }) => {
  const { setPage, snap, me, setTheme, openTicker, openPredict, setDepositOpen } = useSF();
  const pages = useNavPages();
  const run = (fn) => { onOpenChange(false); fn(); };
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  useEffect(() => {
    if (q.trim().length < 1) { setHits([]); return; }
    const id = setTimeout(() => publicGet(`/universe?kind=all&q=${encodeURIComponent(q.trim())}&limit=12`).then((d) => setHits(d.rows)).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search 4,000+ NASDAQ stocks & top 100 crypto, pages, actions…" value={q} onValueChange={setQ} data-testid="command-input" />
      <CommandList className="font-mono">
        <CommandEmpty>No match.</CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading="Forecast any symbol">
            {hits.map((h) => (
              <CommandItem key={`${h.kind}-${h.sym}`} value={`forecast ${h.sym} ${h.name}`} onSelect={() => run(() => openPredict(h.sym))} data-testid={`cmd-predict-${h.sym}`}>
                <b className="accent">{h.sym}</b><span className="text-neutral-500 ml-2 truncate">{h.name}</span><span className="ml-auto text-[10px] text-neutral-500">{h.kind === "crypto" ? "CRYPTO" : "NASDAQ"} · PREDICT</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {pages.map((p, i) => (
            <CommandItem key={p.id} onSelect={() => run(() => setPage(p.id))} data-testid={`cmd-page-${p.id}`}>
              {p.label}<span className="ml-auto text-xs text-neutral-500">{i + 1}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Tickers">
          {(snap?.tickers || []).map((t) => (
            <CommandItem key={t.sym} value={`${t.sym} ${t.name}`} onSelect={() => run(() => openTicker(t.sym))} data-testid={`cmd-ticker-${t.sym}`}>
              <b>{t.sym}</b><span className="text-neutral-500 ml-2">{t.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(onInstall)} data-testid="cmd-install">Download app</CommandItem>
          <CommandItem onSelect={() => run(() => setDepositOpen(true))} data-testid="cmd-deposit">Deposit funds</CommandItem>
          {(snap?.tiers || []).filter((t) => me && t.id <= me.tier).map((t) => (
            <CommandItem key={t.id} value={`look ${t.name}`} onSelect={() => run(() => setTheme(t.id))}>Apply look · T{t.id} {t.name}</CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

import { useQuery } from "@tanstack/react-query";
import { Bot, History, User } from "lucide-react";
import { useSF } from "@/context/SFContext";
import type { ChangeEntry, SFApi } from "@/lib/site";

const when = (t: string) => (t ? new Date(t).toLocaleString() : "—");

export default function HistoryTab() {
  const { api } = useSF() as unknown as { api: SFApi };
  const q = useQuery({ queryKey: ["admin-history"], queryFn: () => api.get<ChangeEntry[]>("/admin/history") });
  return (
    <div className="sf-panel" data-testid="history-panel">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
        <History size={15} className="accent" />
        <span className="lab !mb-0">CHANGE HISTORY{q.data ? ` · ${q.data.length}` : ""}</span>
        <span className="text-xs text-neutral-500 ml-auto hidden sm:inline">Every change made by an admin or applied from an agent proposal</span>
      </div>
      {q.isLoading && <div className="p-5 space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="sk h-12" />)}</div>}
      {q.isError && <p className="p-5 text-sm text-neutral-500">Couldn't load the history.</p>}
      {q.data?.length === 0 && <p className="p-8 text-center text-sm text-neutral-500" data-testid="history-empty">No changes recorded yet.</p>}
      <ol className="divide-y divide-white/5">
        {q.data?.map((c, k) => (
          <li key={`${c.t}-${k}`} className="flex items-start gap-3 px-5 py-3.5 row-in" style={{ animationDelay: `${Math.min(k, 12) * 25}ms` }} data-testid={`history-row-${k}`}>
            <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${c.source === "agent" ? "bg-[var(--a-soft)] accent" : "bg-white/5 text-neutral-400"}`}>
              {c.source === "agent" ? <Bot size={14} /> : <User size={14} />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm" data-testid={`history-summary-${k}`}>{c.summary}</p>
              <p className="font-mono text-[10px] text-neutral-500 mt-1 truncate">
                {c.by_email || c.by || "system"} · <span className={c.source === "agent" ? "accent" : ""} data-testid={`history-source-${k}`}>{c.source === "agent" ? "via AI agent" : "by admin"}</span>
              </p>
            </div>
            <span className="font-mono text-[10px] text-neutral-500 whitespace-nowrap">{when(c.t)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

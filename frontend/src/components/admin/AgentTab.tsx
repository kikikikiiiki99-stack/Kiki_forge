import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Bot, Check, Eraser, Send, Sparkles, X } from "lucide-react";
import { useSF } from "@/context/SFContext";
import type { AgentMessage, Proposal, ProposalKind, SFApi } from "@/lib/site";
import { SITE_KEY } from "@/lib/site";
import { ITEMS_KEY } from "@/components/admin/ItemsTab";

const MSG_KEY = ["agent-messages"] as const;
const CATEGORY: Record<ProposalKind, string> = {
  update_settings: "Settings", create_item: "Item", update_item: "Item", delete_item: "Item · delete",
  set_user_tier: "User", set_user_admin: "User", delete_user: "User · delete",
};
const STARTERS = [
  "How is the app doing? Give me a quick health summary.",
  "Suggest a sharper homepage headline and banner for this week.",
  "Propose three featured items for the Feed.",
];

const ProposalCard = ({ p, onApply, onDismiss, busy }: { p: Proposal; onApply: () => void; onDismiss: () => void; busy: boolean }) => {
  const open = p.status === "proposed" || p.status === "failed";
  return (
    <div className={`proposal ${p.destructive ? "proposal-danger" : ""} ${p.status === "applied" ? "proposal-done" : ""} ${p.status === "dismissed" ? "opacity-50" : ""}`} data-testid={`proposal-card-${p.id}`}>
      <div className="flex items-center gap-2 mb-2">
        {p.destructive && <AlertTriangle size={13} className="text-red-400" />}
        <span className={`sf-pill ${p.destructive ? "sf-pill-danger" : ""}`}>{CATEGORY[p.kind]}</span>
        <span className={`sf-pill ml-auto sf-pill-${p.status}`} data-testid={`proposal-status-${p.id}`}>{p.status}</span>
      </div>
      <p className="text-sm" data-testid={`proposal-summary-${p.id}`}>{p.summary}</p>
      <pre className="proposal-diff">{JSON.stringify(p.payload, null, 1)}</pre>
      {p.error && <p className="text-xs text-red-400 mt-2" data-testid={`proposal-error-${p.id}`}>{p.error}</p>}
      {open && (
        <div className="flex gap-2 mt-3">
          <button className={`sf-btn sf-btn-sm ${p.destructive ? "sf-btn-danger" : "sf-btn-p"}`} disabled={busy} onClick={onApply} data-testid="proposal-apply-btn"><Check size={12} />{p.destructive ? "Apply delete" : "Apply"}</button>
          <button className="sf-btn sf-btn-sm" disabled={busy} onClick={onDismiss} data-testid="proposal-dismiss-btn"><X size={12} />Dismiss</button>
        </div>
      )}
    </div>
  );
};

export default function AgentTab({ onChanged }: { onChanged: () => void }) {
  const { api } = useSF() as unknown as { api: SFApi };
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const msgs = useQuery({ queryKey: MSG_KEY, queryFn: () => api.get<AgentMessage[]>("/admin/agent/messages") });

  const send = useMutation({
    mutationFn: (t: string) => api.post<AgentMessage>("/admin/agent/chat", { text: t }),
    onMutate: (t) => { setPending(t); setText(""); setFailure(null); },
    onSettled: () => { setPending(null); qc.invalidateQueries({ queryKey: MSG_KEY }); },
    onError: (e: Error) => { setFailure(e.message); toast.error(e.message); },
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "apply" | "dismiss" }) => api.post<Proposal>(`/admin/agent/proposals/${id}/${action}`),
    onSuccess: (p) => {
      toast.success(p.status === "applied" ? "Change applied" : "Proposal dismissed");
      if (p.status === "applied") { qc.invalidateQueries({ queryKey: SITE_KEY }); qc.invalidateQueries({ queryKey: ITEMS_KEY }); qc.invalidateQueries({ queryKey: ["admin-history"] }); onChanged(); }
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: MSG_KEY }),
  });
  const clear = useMutation({ mutationFn: () => api.del("/admin/agent/messages"), onSuccess: () => qc.invalidateQueries({ queryKey: MSG_KEY }) });

  // Scroll only the message list, never the page.
  useEffect(() => { const el = box.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs.data?.length, pending]);
  const submit = (t: string) => { if (t.trim() && !send.isPending) send.mutate(t.trim()); };

  return (
    <div className="sf-panel flex flex-col h-[calc(100vh-260px)] min-h-[520px]" data-testid="agent-panel">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--a-soft)] border border-[var(--a-line)]"><Bot size={17} className="accent" /></span>
        <div className="flex-1 min-w-0"><p className="font-medium">Admin agent</p><p className="text-xs text-neutral-500">Proposes changes — nothing happens until you click Apply. Each message uses LLM credits.</p></div>
        <span className="sf-pill hidden sm:inline-flex" data-testid="agent-model-badge">Claude Sonnet 4.5</span>
        <button className="sf-icon-btn" onClick={() => clear.mutate()} aria-label="Clear conversation" data-testid="agent-clear-button"><Eraser size={14} /></button>
      </div>

      <div ref={box} className="flex-1 overflow-y-auto px-5 py-5 space-y-4" data-testid="agent-messages">
        {msgs.isLoading && <><div className="sk h-14 w-2/3" /><div className="sk h-24 w-3/4 ml-auto" /></>}
        {msgs.data?.length === 0 && !pending && (
          <div className="h-full grid place-items-center text-center">
            <div className="max-w-md space-y-4">
              <Sparkles className="accent mx-auto" size={22} />
              <p className="text-sm text-neutral-400">Ask about your users, settings or featured items, or ask for improvements. Suggested changes arrive as cards you can apply or dismiss.</p>
              <div className="flex flex-col gap-2">{STARTERS.map((s, i) => <button key={s} className="sf-chip !normal-case !tracking-normal text-left" onClick={() => submit(s)} data-testid={`agent-starter-${i}`}>{s}</button>)}</div>
            </div>
          </div>
        )}
        {msgs.data?.map((m) => (
          <div key={m.id} className={`row-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`agent-msg-${m.role}`}>
            <div className={`max-w-[88%] sm:max-w-[75%] ${m.role === "user" ? "bubble-user" : "bubble-ai"}`}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</p>
              {m.proposals.length > 0 && (
                <div className="grid gap-2.5 mt-3">
                  {m.proposals.map((p) => <ProposalCard key={p.id} p={p} busy={act.isPending}
                    onApply={() => act.mutate({ id: p.id, action: "apply" })} onDismiss={() => act.mutate({ id: p.id, action: "dismiss" })} />)}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-end"><div className="bubble-user max-w-[75%]"><p className="text-sm whitespace-pre-wrap">{pending}</p></div></div>
            <div className="bubble-ai w-fit" data-testid="agent-thinking"><span className="typing"><i /><i /><i /></span></div>
          </>
        )}
      </div>

      {failure && (
        <div className="mx-3 mb-0 mt-1 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200" role="alert" data-testid="agent-error">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /><p className="flex-1">{failure}</p>
          <button className="sf-icon-btn !w-6 !h-6" onClick={() => setFailure(null)} aria-label="Dismiss error" data-testid="agent-error-close"><X size={12} /></button>
        </div>
      )}
      <form className="p-3 border-t border-white/5 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <textarea className="sf-input flex-1 min-h-[44px] max-h-32 resize-none" rows={1} placeholder="Ask the agent…" value={text} maxLength={3000}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }} data-testid="agent-input" />
        <button className="sf-btn sf-btn-p" type="submit" disabled={!text.trim() || send.isPending} aria-label="Send" data-testid="agent-send-button"><Send size={14} /></button>
      </form>
    </div>
  );
}

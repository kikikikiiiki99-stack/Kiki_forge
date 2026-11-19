import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Trash2 } from "lucide-react";
import { useSF } from "@/context/SFContext";
import { Hero } from "@/components/sf/ui";
import { Locked } from "@/components/sf/Locked";

const PROMPTS = ["What's leading today's tape?", "Risk check on my paper positions", "Which earnings catalysts matter this week?", "Give me a TSLA bull vs bear case"];

const Bubble = ({ m, live }) => (
  <div className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
    <div className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-[var(--a)] text-black font-medium" : "border border-[var(--a-line)] bg-black/40 text-neutral-200"} ${live ? "caret" : ""}`} data-testid={`chat-msg-${m.role}`}>
      {m.text}
    </div>
  </div>
);

const DeepBrief = () => {
  const { api } = useSF();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setText("");
    try { await api.stream("/advisor/brief", {}, setText); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="sf-panel p-5 h-full" data-testid="deep-brief-panel">
      <div className="flex justify-between items-center mb-3"><div className="lab !mb-0">DEEP BRIEF</div>
        <button className="sf-btn sf-btn-sm sf-btn-p" onClick={run} disabled={busy} data-testid="deep-brief-generate-button"><Sparkles size={12} />{busy ? "Writing…" : "Generate"}</button></div>
      <pre className={`whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-neutral-300 ${busy ? "caret" : ""}`} data-testid="deep-brief-output">{text || "Generate a full-session brief: tape, leaders & laggards, catalysts, portfolio risk and a playbook."}</pre>
    </div>
  );
};

export default function Advisor() {
  const { api } = useSF();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { api.get("/advisor/history").then(setMsgs).catch(() => {}); }, [api]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: t }, { role: "ai", text: "" }]);
    const upd = (full) => setMsgs((m) => [...m.slice(0, -1), { role: "ai", text: full }]);
    try { await api.stream("/advisor/chat", { text: t }, upd); }
    catch (e) { upd(`Advisor error: ${e.message}`); }
    finally { setBusy(false); }
  };
  const clear = async () => { await api.del("/advisor/history"); setMsgs([]); };

  return (
    <section data-testid="page-ai">
      <Hero kicker="NEURAL DESK" title="Advisor" sub="Claude-powered · reads the session snapshot and your paper desk · not advice">
        <button className="sf-btn" onClick={clear} data-testid="chat-clear-button"><Trash2 size={14} /> Clear</button>
      </Hero>
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="sf-panel p-5 lg:col-span-7 flex flex-col h-[600px]">
          <div className="flex-1 overflow-y-auto space-y-3 pr-1" data-testid="chat-log">
            {!msgs.length && <p className="text-neutral-500 text-sm font-mono">Ask anything about the tape, a ticker or your paper positions.</p>}
            {msgs.map((m, i) => <Bubble key={i} m={m} live={busy && i === msgs.length - 1} />)}
            <div ref={end} />
          </div>
          <div className="flex flex-wrap gap-1.5 my-3">
            {PROMPTS.map((p) => <button key={p} className="font-mono text-[11px] px-2.5 py-1 border border-[var(--a-line)] text-neutral-300 hover:bg-[var(--a-soft)] transition-colors" onClick={() => send(p)} data-testid="chat-prompt-chip">{p}</button>)}
          </div>
          <div className="flex gap-2">
            <input className="sf-input flex-1" placeholder="Ask about the tape…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="chat-input" />
            <button className="sf-btn sf-btn-p" onClick={() => send()} disabled={busy || !input.trim()} data-testid="chat-send-button">Send</button>
          </div>
        </div>
        <Locked gate="deepBrief" label="Deep brief" className="lg:col-span-5"><DeepBrief /></Locked>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bitcoin, Check, Copy, ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSF } from "@/context/SFContext";
import { money } from "@/lib/theme";

const STEPS = ["Awaiting payment", "Seen on-chain", "1 confirmation", "Tier unlocked"];
const stepOf = (p) => (!p ? 0 : ["confirmed", "approved"].includes(p.status) ? 4 : p.status === "seen" ? 2 : p.txid ? 1 : 0);
const TXID_RE = /^[0-9a-fA-F]{64}$/;

const Countdown = ({ until }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((new Date(until) - now) / 1000));
  return (
    <span className={`font-mono text-sm tabular-nums ${s < 120 ? "bear" : "text-amber-400"}`} data-testid="btc-checkout-timer">
      {s > 0 ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : "EXPIRED"}
    </span>
  );
};

const CopyRow = ({ label, value, testid }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); toast.success(`${label} copied`); setTimeout(() => setDone(false), 1500); }
    catch { toast.error("Copy failed — select the text and copy it manually"); }
  };
  return (
    <div className="space-y-1">
      <div className="lab !mb-0">{label}</div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 break-all sf-input !py-2 !text-[13px] select-all" data-testid={`${testid}-value`}>{value}</code>
        <button className="sf-btn sf-btn-sm" onClick={copy} aria-label={`Copy ${label}`} data-testid={`${testid}-copy-btn`}>{done ? <Check size={14} /> : <Copy size={14} />}</button>
      </div>
    </div>
  );
};

export const Stepper = ({ step }) => (
  <ol className="grid grid-cols-4 gap-1.5" data-testid="btc-status-stepper">
    {STEPS.map((s, i) => (
      <li key={s} className="space-y-1.5" data-testid={`btc-step-${i}`} data-done={i < step}>
        <div className={`h-1 rounded-full transition-colors duration-300 ${i < step ? "bg-[#F7931A]" : i === step ? "bg-[#F7931A]/40" : "bg-white/10"}`} />
        <p className={`font-mono text-[10px] leading-tight ${i < step ? "text-neutral-200" : "text-neutral-500"}`}>{s}</p>
      </li>
    ))}
  </ol>
);

export const BtcCheckout = () => {
  const { checkout, setCheckout, api, snap, refreshMe, refreshNotes } = useSF();
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);
  const open = !!checkout;
  const tier = snap?.tiers[(checkout?.tier || 1) - 1];

  const newQuote = useCallback(async (t) => {
    setErr(""); setP(null); setTxid(""); setBusy(true);
    try { setP(await api.post("/billing/quote", { tier: t })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [api]);

  useEffect(() => {
    if (!checkout) return;
    if (checkout.payment) { setErr(""); setP(checkout.payment); setTxid(checkout.payment.txid || ""); }
    else newQuote(checkout.tier);
  }, [checkout, newQuote]);

  const verify = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.post(`/billing/payments/${p.id}/verify`, { txid: txid.trim() });
      setP(r);
      if (["confirmed", "approved"].includes(r.status)) { toast.success(`T${r.tier} ${r.tier_name} unlocked`); refreshMe(); refreshNotes(); }
      else if (r.underpaid) toast.warning("Payment seen but below the quoted amount — the admin will review it");
      else toast("Seen on-chain · waiting for 1 confirmation");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const step = stepOf(p);
  const done = step === 4;
  const expired = p && !p.txid && new Date(p.quote_expires_at) < new Date();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && setCheckout(null)}>
      <DialogContent className="bg-[#0B101B] border border-slate-800 rounded-xl max-w-lg max-h-[92vh] overflow-y-auto" data-testid="btc-checkout-dialog">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full grid place-items-center bg-[#1F1A12] border border-[#F7931A]/40"><Bitcoin size={20} className="text-[#F7931A]" /></span>
          <div>
            <DialogTitle className="font-disp text-lg tracking-tight">Pay with Bitcoin</DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              {tier ? `T${tier.id} ${tier.name} · ${tier.price} · 30 days` : ""}
            </DialogDescription>
          </div>
        </div>

        {busy && !p && <p className="flex items-center gap-2 text-sm text-neutral-400 py-6" data-testid="btc-quote-loading"><Loader2 size={14} className="animate-spin" /> Fetching live BTC rate…</p>}
        {err && <p className="text-sm bear border border-red-500/30 bg-red-500/5 rounded-md p-3" data-testid="btc-checkout-error">{err}</p>}

        {p && (
          <div className="space-y-4">
            <Stepper step={step} />
            {!done && (
              <>
                <div className="rounded-lg border border-[#F7931A]/30 bg-[#1F1A12] p-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="lab !mb-1 !text-[#F7931A]/80">SEND EXACTLY</div>
                    <p className="font-mono text-2xl font-bold text-[#F7931A]" data-testid="btc-quoted-amount">{p.amount_btc} BTC</p>
                    <p className="font-mono text-[11px] text-neutral-400 mt-1">{money(p.usd_cents / 100)} at {money(Number(p.btc_usd))}/BTC · {p.price_source}</p>
                  </div>
                  {!p.txid && <div className="text-right"><div className="lab !mb-1">QUOTE HOLDS</div><Countdown until={p.quote_expires_at} /></div>}
                </div>
                <CopyRow label="Amount (BTC)" value={p.amount_btc} testid="btc-amount" />
                <CopyRow label="Receiving address" value={p.btc_address} testid="btc-address" />
                <a className="sf-btn w-full" href={`bitcoin:${p.btc_address}?amount=${p.amount_btc}`} data-testid="btc-open-wallet-link"><Wallet size={14} /> Open in wallet app</a>
                {expired ? (
                  <button className="sf-btn sf-btn-p w-full" onClick={() => newQuote(p.tier)} data-testid="btc-new-quote-button"><RefreshCw size={14} /> Quote expired · get a new amount</button>
                ) : (
                  <div className="space-y-2">
                    <label className="lab !mb-0 block" htmlFor="btc-txid">Transaction ID (after you send)</label>
                    <input id="btc-txid" className="sf-input w-full !text-xs" placeholder="64-character txid" value={txid} onChange={(e) => setTxid(e.target.value)} disabled={!!p.txid} data-testid="btc-txid-input" />
                    <button className="sf-btn sf-btn-p w-full" onClick={verify} disabled={busy || !TXID_RE.test(txid.trim())} data-testid="btc-submit-txid-btn">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : null}{p.txid ? "Check again" : "Verify payment"}
                    </button>
                    {p.status === "seen" && (
                      <p className="text-xs text-neutral-400" data-testid="btc-seen-note">
                        {p.underpaid ? "Received less than the quoted amount — the admin will review and can approve it manually." : "Seen on the blockchain. Your tier unlocks after 1 confirmation (usually ~10 minutes) — tap Check again."}
                        {" "}<a className="underline inline-flex items-center gap-1" href={`https://mempool.space/tx/${p.txid}`} target="_blank" rel="noreferrer">View <ExternalLink size={10} /></a>
                      </p>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-neutral-500 leading-relaxed">Funds go straight to the owner's wallet — StockForge never holds coins or keys. Each payment covers one month; renew with a new payment. If anything goes wrong, the admin can approve your payment by hand.</p>
              </>
            )}
            {done && (
              <div className="text-center py-4 space-y-2" data-testid="btc-checkout-success">
                <p className="font-disp text-2xl accent">T{p.tier} {p.tier_name} unlocked</p>
                <p className="text-sm text-neutral-400">Active until {p.period_ends_at ? new Date(p.period_ends_at).toLocaleDateString() : "—"}</p>
                <button className="sf-btn sf-btn-p" onClick={() => setCheckout(null)} data-testid="btc-done-button">Enter terminal</button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

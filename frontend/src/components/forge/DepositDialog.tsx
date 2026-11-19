import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, CreditCard, Wallet as WalletIcon, X, Zap } from "lucide-react";
import { fmtUsd, useForgeApi, type CardCheckout, type Wallet, type WalletTxn } from "@/lib/forge";

const QUICK = [1000, 5000, 10000, 50000];

export interface DepositDialogProps {
  open: boolean;
  onClose: () => void;
  onFunds: () => void; // refresh the account (cash/equity) after a deposit or withdrawal
}

type Tab = "instant" | "card" | "withdraw";

export default function DepositDialog({ open, onClose, onFunds }: DepositDialogProps) {
  const api = useForgeApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("instant");
  const [amount, setAmount] = useState("10000");
  const [pkg, setPkg] = useState("deposit_500");
  const [busy, setBusy] = useState(false);

  const w = useQuery({ queryKey: ["wallet"], queryFn: () => api.get<Wallet>("/wallet"), enabled: open });
  const wallet = w.data && !w.isError ? w.data : undefined;

  const done = async (msg: string) => {
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: ["wallet"] });
    onFunds();
  };

  const submit = async () => {
    const n = Number(amount);
    if (tab !== "card" && (!n || n <= 0)) return toast.error("Enter an amount above $0");
    setBusy(true);
    try {
      if (tab === "instant") {
        await api.post("/wallet/deposit", { amount: n });
        await done(`${fmtUsd(n, 0)} credited to buying power`);
      } else if (tab === "withdraw") {
        await api.post("/wallet/withdraw", { amount: n });
        await done(`${fmtUsd(n, 0)} withdrawal processed`);
      } else {
        const r = await api.post<CardCheckout>("/wallet/card/checkout", { package_id: pkg, origin_url: window.location.origin });
        window.location.href = r.checkout_url;
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const TabBtn = ({ id, icon, label }: { id: Tab; icon: React.ReactNode; label: string }) => (
    <button onClick={() => setTab(id)} data-testid={`deposit-tab-${id}`} role="tab" aria-selected={tab === id}
      className={`flex-1 font-mono text-[11px] tracking-widest uppercase py-2.5 border flex items-center justify-center gap-2 transition-[background-color,border-color,color] duration-150 ${tab === id ? "border-[var(--a)] text-white bg-[var(--a-soft)]" : "border-white/10 text-neutral-400 hover:text-white"}`}>
      {icon}{label}
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[85] grid place-items-center bg-black/70 backdrop-blur-sm p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="deposit-overlay">
          <motion.div role="dialog" aria-modal="true" aria-label="Deposit funds" className="relative w-full max-w-lg sf-panel !bg-[#0B0F19] p-5 max-h-[92vh] overflow-y-auto"
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ type: "spring", damping: 24, stiffness: 300 }}
            data-testid="deposit-dialog">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="kicker flex items-center gap-2"><WalletIcon size={12} /> FORGE WALLET</p>
                <h3 className="font-disp text-2xl font-bold mt-1">Fund your account</h3>
                <p className="font-mono text-xs text-neutral-500 mt-1">Buying power <b className="text-white" data-testid="deposit-cash">{wallet ? fmtUsd(wallet.cash) : "—"}</b> · deposited {wallet ? fmtUsd(wallet.deposits_total, 0) : "—"}</p>
              </div>
              <button className="sf-btn sf-btn-sm" onClick={onClose} aria-label="Close" data-testid="deposit-close-button"><X size={14} /></button>
            </div>
            <div className="flex gap-1 mb-4" role="tablist">
              <TabBtn id="instant" icon={<Zap size={12} />} label="Instant" />
              <TabBtn id="card" icon={<CreditCard size={12} />} label="Card" />
              <TabBtn id="withdraw" icon={<ArrowUpFromLine size={12} />} label="Withdraw" />
            </div>

            {tab !== "card" ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">{tab === "instant" ? "Paper funds land instantly in your buying power — perfect for testing strategies at scale." : "Move paper cash out of your buying power (simulated bank transfer)."}</p>
                <div className="grid grid-cols-4 gap-2">
                  {QUICK.map((q) => (
                    <button key={q} onClick={() => setAmount(String(q))} data-testid={`deposit-quick-${q}`}
                      className={`font-mono text-xs py-2 border transition-colors duration-150 ${Number(amount) === q ? "border-[var(--a)] text-white" : "border-white/10 text-neutral-400 hover:text-white"}`}>${q >= 1000 ? `${q / 1000}k` : q}</button>
                  ))}
                </div>
                <label className="block"><span className="font-mono text-[10px] text-neutral-500 tracking-widest">AMOUNT (USD)</span>
                  <input className="sf-input w-full mt-1 !text-lg" type="number" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="deposit-amount-input" /></label>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">Pay by card through Stripe (test mode). Use card <b className="font-mono text-white">4242 4242 4242 4242</b>, any future date and CVC. Funds credit after payment is confirmed.</p>
                <div className="grid grid-cols-2 gap-2">
                  {(wallet?.packages ?? [{ id: "deposit_100", amount: 100 }, { id: "deposit_500", amount: 500 }, { id: "deposit_1000", amount: 1000 }, { id: "deposit_5000", amount: 5000 }]).map((p) => (
                    <button key={p.id} onClick={() => setPkg(p.id)} data-testid={`card-package-${p.id}`}
                      className={`font-mono py-3 border transition-colors duration-150 ${pkg === p.id ? "border-[var(--a)] text-white bg-[var(--a-soft)]" : "border-white/10 text-neutral-400 hover:text-white"}`}>{fmtUsd(p.amount, 0)}</button>
                  ))}
                </div>
              </div>
            )}

            <button className="sf-btn sf-btn-p w-full !py-3 mt-4" onClick={submit} disabled={busy} data-testid="deposit-submit-btn">
              {tab === "withdraw" ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
              {busy ? "Processing…" : tab === "instant" ? `Deposit ${fmtUsd(Number(amount) || 0, 0)}` : tab === "withdraw" ? `Withdraw ${fmtUsd(Number(amount) || 0, 0)}` : "Continue to secure checkout"}
            </button>

            <div className="mt-5">
              <div className="lab">RECENT ACTIVITY</div>
              <div className="max-h-40 overflow-y-auto space-y-1" data-testid="wallet-txns">
                {(wallet?.txns ?? []).map((t: WalletTxn) => (
                  <div key={t.id} className="flex items-center gap-2 font-mono text-xs py-1 border-b border-white/5">
                    <span className="text-neutral-600 w-20">{new Date(t.t).toLocaleDateString()}</span>
                    <span className="flex-1 text-neutral-400">{t.note}</span>
                    <span className={t.amount >= 0 ? "bull" : "bear"}>{t.amount >= 0 ? "+" : ""}{fmtUsd(t.amount, 0)}</span>
                  </div>
                ))}
                {wallet && !wallet.txns.length && <p className="font-mono text-xs text-neutral-600">No deposits yet.</p>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

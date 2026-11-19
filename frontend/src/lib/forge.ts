// Typed client for the StockForge upgrade endpoints. Auth is Clerk: the session token rides
// as a Bearer header (same contract as the original lib/sfapi.js). Interfaces mirror the
// dicts returned by backend/universe.py, predict.py and wallet.py — keep them in sync.
import { useMemo } from "react";
import { useAuth } from "@clerk/react";

export type Kind = "stock" | "crypto";
export type Timeframe = "1D" | "1W" | "1M" | "3M";

export interface Asset {
  sym: string;
  name: string;
  kind: Kind;
  price: number;
  chg: number;
  chg7?: number;
  cap: number;
  vol: number;
  sector: string;
  industry?: string;
  country?: string;
  exchange: string;
  rank?: number;
  image?: string;
  cg_id?: string;
  high?: number | null;
  low?: number | null;
}

export interface UniversePage {
  total: number;
  page: number;
  limit: number;
  rows: Asset[];
  sectors: string[];
  sources: Record<string, string>;
  updated: number;
}

export interface MoverRow { sym: string; name: string; price: number; chg: number; kind: Kind }
export interface UniverseStats {
  stocks: number;
  crypto: number;
  advancers: number;
  decliners: number;
  crypto_cap: number;
  stock_gainers: MoverRow[];
  stock_losers: MoverRow[];
  crypto_gainers: MoverRow[];
  sources: Record<string, string>;
}

export interface ProjPoint { t: number; p5: number; p25: number; p50: number; p75: number; p95: number; mean: number }
export interface Level {
  label: string;
  price: number;
  kind: "support" | "resistance" | "pivot";
  touches: number;
  source: "pivot" | "swing";
  strength: number;
  dist_pct: number;
}
export interface Scenario { price: number; ret: number; label: string }
export interface SignalRow { k: string; v: string; tone: "bull" | "bear" | "muted" }
export interface Prediction {
  sym: string;
  name: string;
  kind: Kind;
  tf: Timeframe;
  tf_label: string;
  bar: string;
  price: number;
  horizon_bars: number;
  paths: number;
  history: { t: number; c: number }[];
  projection: ProjPoint[];
  levels: Level[];
  scenarios: Record<"best" | "bull" | "base" | "bear" | "worst" | "mean", Scenario>;
  probabilities: {
    up: number; down: number; bull: number; bear: number; neutral: number;
    gain_1sigma: number; loss_1sigma: number; gain_10: number; loss_10: number;
    touch_r1: number | null; touch_s1: number | null; r1: number | null; s1: number | null; move_pct: number;
  };
  risk: {
    var95: number; cvar95: number; var95_usd_per_1k: number; ann_vol: number; sigma_bar: number;
    vol_regime: string; vol_ratio: number; max_dd_median: number;
  };
  signals: {
    signal: "BULLISH" | "BEARISH" | "NEUTRAL"; confidence: number; score: number; rsi: number; macd_hist: number;
    sma20: number; sma50: number; trend: string; momentum: number; stack: SignalRow[];
  };
  distribution: { price: number; prob: number }[];
  model: string;
  source: string;
  updated: number;
}

export interface WalletTxn { id: string; t: string; kind: "instant" | "card" | "withdraw"; amount: number; note: string; balance: number }
export interface Wallet {
  cash: number;
  deposits_total: number;
  withdrawals_total: number;
  txns: WalletTxn[];
  packages: { id: string; amount: number }[];
  card_enabled: boolean;
}
export interface CardCheckout { checkout_url: string; session_id: string }
export interface PayStatus { session_id: string; status: string; payment_status: string; amount?: number }

export class ForgeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE = "/api";

async function parse<T>(r: Response): Promise<T> {
  const data: unknown = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = (data as { detail?: unknown }).detail;
    throw new ForgeError(r.status, typeof d === "string" ? d : `Error ${r.status}`);
  }
  return data as T;
}

export async function publicFetch<T>(path: string): Promise<T> {
  return parse<T>(await fetch(BASE + path));
}

export function useForgeApi() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const headers = async (): Promise<Record<string, string>> => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await getToken()) ?? ""}`,
    });
    const req = async <T,>(method: string, path: string, body?: unknown): Promise<T> =>
      parse<T>(await fetch(BASE + path, { method, headers: await headers(), body: body === undefined ? undefined : JSON.stringify(body) }));
    const stream = async (path: string, body: unknown, onDelta: (full: string) => void): Promise<string> => {
      const r = await fetch(BASE + path, { method: "POST", headers: await headers(), body: JSON.stringify(body ?? {}) });
      if (!r.ok || !r.body) await parse(r);
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.replace(/^data: /, "");
          if (line === "[DONE]") return full;
          const msg = JSON.parse(line) as { delta?: string; error?: string };
          if (msg.error) throw new Error(msg.error);
          full += msg.delta ?? "";
          onDelta(full);
        }
      }
      return full;
    };
    return {
      get: <T,>(p: string) => req<T>("GET", p),
      post: <T,>(p: string, b?: unknown) => req<T>("POST", p, b ?? {}),
      stream,
    };
  }, [getToken]);
}

// ---------- formatting ----------
export const fmtPrice = (p: number | null | undefined): string => {
  if (p == null || Number.isNaN(p)) return "—";
  const d = p >= 1000 ? 2 : p >= 1 ? 2 : p >= 0.01 ? 4 : 6;
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
export const fmtPct = (r: number | null | undefined, isRatio = true, d = 2): string => {
  if (r == null || Number.isNaN(r)) return "—";
  const v = isRatio ? r * 100 : r;
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
};
export const fmtProb = (p: number | null | undefined): string => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);
export const fmtCap = (n: number | null | undefined): string => {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString("en-US")}`;
};
export const fmtUsd = (n: number, d = 2): string =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

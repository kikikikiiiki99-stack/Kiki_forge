import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { publicGet, useApi } from "@/lib/sfapi";
import { applyTheme } from "@/lib/theme";
import { useSite } from "@/lib/site";

const Ctx = createContext(null);

// Poll only while the tab is visible; catch up immediately when it becomes visible again.
const usePolling = (fn, ms) => {
  useEffect(() => {
    fn();
    let id = null;
    const start = () => { if (id == null) id = setInterval(fn, ms); };
    const stop = () => { clearInterval(id); id = null; };
    const onVis = () => { if (document.hidden) stop(); else { fn(); start(); } };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [fn, ms]);
};

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
export const useSF = () => useContext(Ctx);

const useMarkets = () => {
  const [markets, setMarkets] = useState(() => readJSON("sf_markets"));
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const d = await publicGet(`/markets${force ? "?force=true" : ""}`);
      // Identical payload -> keep the same object so nothing downstream re-renders.
      setMarkets((prev) => (prev && prev.updated === d.updated ? prev : d));
      try { localStorage.setItem("sf_markets", JSON.stringify(d)); } catch { /* quota / private mode */ }
    } catch {
      toast.error("Live feed unreachable — showing last saved prices");
    } finally {
      setLoading(false);
    }
  }, []);
  const tick = useCallback(() => refresh(), [refresh]);
  usePolling(tick, 60000);
  return { markets, marketsLoading: loading, refreshMarkets: refresh };
};

const useNotifications = (api, onPayment) => {
  const [notes, setNotes] = useState({ unread: 0, items: [] });
  const seen = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const d = await api.get("/notifications");
      if (seen.current) {
        const fresh = d.items.filter((n) => !n.read && !seen.current.has(n.id));
        fresh.forEach((n) => toast(n.title, { description: n.body, id: n.id }));
        if (fresh.some((n) => n.kind === "payment")) onPayment();
      }
      seen.current = new Set(d.items.map((n) => n.id));
      // Skip the state update (and a full-tree re-render) when nothing changed.
      setNotes((prev) => (prev.unread === d.unread && prev.items.length === d.items.length && prev.items.every((i, k) => i.id === d.items[k].id && i.read === d.items[k].read) ? prev : d));
    } catch { /* offline or static preview: keep last list */ }
  }, [api, onPayment]);
  usePolling(refresh, 30000);
  const markRead = useCallback(async () => {
    await api.post("/notifications/read");
    setNotes((n) => ({ unread: 0, items: n.items.map((i) => ({ ...i, read: true })) }));
  }, [api]);
  return { notes, refreshNotes: refresh, markRead };
};

export function SFProvider({ children }) {
  const api = useApi();
  const [snap, setSnap] = useState(null);
  const [me, setMe] = useState(null);
  const [page, setPageState] = useState(() => localStorage.getItem("sf_page") || "home");
  const [preview, setPreview] = useState(null);
  const [ticker, openTicker] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [predictSym, openPredict] = useState(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [tradeSym, setTradeSym] = useState(null);
  const mk = useMarkets();

  const refreshSnap = useCallback(() => publicGet("/snapshot").then(setSnap).catch(() => toast.error("Could not load the session snapshot")), []);
  useEffect(() => { refreshSnap(); }, [refreshSnap]);
  const refreshMe = useCallback(() => api.get("/me").then(setMe).catch((e) => toast.error(e.message)), [api]);
  const nt = useNotifications(api, refreshMe);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const themeTier = preview || me?.theme || 1;
  const site = useSite().data?.settings;
  useEffect(() => applyTheme(themeTier, site), [themeTier, site]);

  const setPage = useCallback((p) => {
    // Instant jump: a smooth scroll fighting the page remount reads as jank.
    window.scrollTo({ top: 0, behavior: "auto" });
    setPageState(p);
    try { localStorage.setItem("sf_page", p); } catch { /* ignore */ }
  }, []);

  const can = useCallback((gate) => !!me && !!snap && me.tier >= snap.gates[gate], [me, snap]);

  const setTheme = useCallback(async (tier) => {
    setPreview(null);
    let prev;
    setMe((m) => { prev = m?.theme; return m && { ...m, theme: tier }; }); // apply instantly, roll back on failure
    try {
      await api.put("/me/theme", { tier });
    } catch (e) {
      setMe((m) => m && { ...m, theme: prev });
      toast.error(e.message);
    }
  }, [api]);

  // Bitcoin checkout dialog: a new quote for `tier`, or resume an existing `payment`.
  const upgrade = useCallback((tier, payment = null) => setCheckout({ tier, payment }), []);

  const toggleWatch = useCallback(async (sym) => {
    const before = me?.watch || [];
    const watching = before.includes(sym);
    // Optimistic: the star flips immediately; the server's list wins when it answers.
    setMe((m) => m && { ...m, watch: watching ? m.watch.filter((x) => x !== sym) : [...m.watch, sym] });
    try {
      const r = watching ? await api.del(`/watchlist/${sym}`) : await api.post("/watchlist", { sym });
      setMe((m) => m && { ...m, watch: r.watch });
      toast.success(watching ? `${sym} removed from watchlist` : `${sym} added to watchlist`);
    } catch (e) {
      setMe((m) => m && { ...m, watch: before });
      toast.error(e.message);
    }
  }, [api, me?.watch]);

  const bySym = useMemo(() => Object.fromEntries((snap?.tickers || []).map((t) => [t.sym, t])), [snap]);

  // Memoized so unrelated provider re-renders don't re-render every consumer.
  const value = useMemo(() => ({
    api, snap, refreshSnap, me, setMe, refreshMe, page, setPage, preview, setPreview, themeTier, can, setTheme, upgrade,
    checkout, setCheckout, bySym, ticker, openTicker, predictSym, openPredict, depositOpen, setDepositOpen, tradeSym, setTradeSym, toggleWatch, ...mk, ...nt,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [api, snap, refreshSnap, me, refreshMe, page, setPage, preview, themeTier, can, setTheme, upgrade, checkout, bySym, ticker, predictSym, depositOpen, tradeSym, toggleWatch, mk.markets, mk.marketsLoading, mk.refreshMarkets, nt.notes, nt.refreshNotes, nt.markRead]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

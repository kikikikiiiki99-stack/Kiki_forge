export const TIER_THEMES = [
  { a: "#d4d4d4", a2: "#737373", glow: 0.12, particles: 14, speed: 0.15, blur: 0 },
  { a: "#3b82f6", a2: "#22d3ee", glow: 0.2, particles: 26, speed: 0.2, blur: 4 },
  { a: "#10b981", a2: "#84cc16", glow: 0.3, particles: 34, speed: 0.28, blur: 6 },
  { a: "#6366f1", a2: "#a855f7", glow: 0.4, particles: 42, speed: 0.32, blur: 8 },
  { a: "#ef4444", a2: "#f97316", glow: 0.5, particles: 52, speed: 0.4, blur: 10 },
  { a: "#f97316", a2: "#facc15", glow: 0.6, particles: 60, speed: 0.48, blur: 12 },
  { a: "#06b6d4", a2: "#a78bfa", glow: 0.7, particles: 70, speed: 0.5, blur: 14 },
  { a: "#d946ef", a2: "#22d3ee", glow: 0.8, particles: 80, speed: 0.55, blur: 20 },
  { a: "#eab308", a2: "#f59e0b", glow: 0.9, particles: 90, speed: 0.45, blur: 16 },
  { a: "#ffffff", a2: "#8b5cf6", glow: 1.0, particles: 120, speed: 0.7, blur: 22 },
];

export const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export const themeVars = (tier) => {
  const t = TIER_THEMES[tier - 1] || TIER_THEMES[0];
  return {
    "--a": t.a,
    "--a2": t.a2,
    "--a-soft": rgba(t.a, 0.1),
    "--a-line": rgba(t.a, 0.18 + t.glow * 0.12),
    "--a-glow": rgba(t.a, 0.15 + t.glow * 0.35),
    "--blur": `${t.blur}px`,
  };
};

// brand = site settings; a set brand_primary / brand_secondary overrides the tier accent for everyone.
export const applyTheme = (tier, brand) => {
  const root = document.documentElement;
  const vars = themeVars(tier);
  const hex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  if (brand && hex(brand.brand_primary)) {
    const glow = (TIER_THEMES[tier - 1] || TIER_THEMES[0]).glow;
    Object.assign(vars, { "--a": brand.brand_primary, "--a-soft": rgba(brand.brand_primary, 0.1),
      "--a-line": rgba(brand.brand_primary, 0.18 + glow * 0.12), "--a-glow": rgba(brand.brand_primary, 0.15 + glow * 0.35) });
  }
  if (brand && hex(brand.brand_secondary)) vars["--a2"] = brand.brand_secondary;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.tier = String(tier);
  root.classList.toggle("fx-scan", tier >= 3);
  root.classList.toggle("fx-hud", tier >= 5);
  root.classList.toggle("fx-irid", tier >= 7 && tier !== 9);
  root.classList.toggle("fx-gold", tier === 9);
};

export const PAGES = [
  { id: "home", label: "Feed" },
  { id: "markets", label: "Markets" },
  { id: "dash", label: "Dashboard" },
  { id: "quotes", label: "Quotes" },
  { id: "live", label: "Live" },
  { id: "scan", label: "Scanner" },
  { id: "watch", label: "Watchlist" },
  { id: "ai", label: "Advisor" },
  { id: "trade", label: "Paper" },
  { id: "tiers", label: "Tiers" },
];

export const fmt = (n, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (n, d = 2) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${fmt(Math.abs(n), d)}`);
export const pct = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`);
export const priceFmt = (p) => (p == null ? "—" : p < 1 ? `$${p.toFixed(4)}` : money(p, 2));

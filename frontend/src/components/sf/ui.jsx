export const Hero = ({ kicker, title, sub, children }) => (
  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-8 rise">
    <div>
      <p className="kicker mb-2">{kicker}</p>
      <h2 className="font-disp sf-title text-4xl sm:text-5xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="text-neutral-400 mt-2 text-sm md:text-base">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

export const Chg = ({ v, className = "" }) => (
  <span className={`font-mono ${v >= 0 ? "bull" : "bear"} ${className}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v ?? 0).toFixed(2)}%</span>
);

export const Stat = ({ label, value, sub, tone, testid }) => (
  <div className="sf-panel p-4 rise" data-testid={testid}>
    <div className="lab !mb-2">{label}</div>
    <div className={`font-mono text-2xl font-bold ${tone === "bull" ? "bull" : tone === "bear" ? "bear" : tone === "accent" ? "accent" : ""}`}>{value}</div>
    {sub && <div className="font-mono text-xs text-neutral-500 mt-1">{sub}</div>}
  </div>
);

import { memo, useId, useMemo } from "react";

export const Sparkline = memo(({ data = [], w = 120, h = 36, up, testid }) => {
  const uid = useId().replace(/:/g, "");
  const { pts, rising } = useMemo(() => {
    if (!data.length) return { pts: "", rising: true };
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const last = data.length - 1 || 1;
    return {
      pts: data.map((v, i) => `${((i / last) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" "),
      rising: data[data.length - 1] >= data[0],
    };
  }, [data, w, h]);
  if (!data.length) return <svg width={w} height={h} />;
  const c = (up ?? rising) ? "#22c55e" : "#ef4444";
  // useId keeps gradient ids unique per instance (the old min/length-derived id could collide between cards).
  const id = `sg${uid}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ maxWidth: w, height: h }} data-testid={testid}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.35" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

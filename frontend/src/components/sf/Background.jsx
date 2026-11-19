import { memo, useEffect, useRef } from "react";
import { TIER_THEMES } from "@/lib/theme";

// Canvas particles: frame-rate independent (delta-time), DPR-aware, paused while the tab is hidden,
// and free of per-frame allocations / Math.random calls so it stays cheap on low-end GPUs.
const Particles = ({ tier }) => {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext("2d", { alpha: true });
    const t = TIER_THEMES[tier - 1];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0, h = 0, raf = 0, last = 0, resizeRaf = 0;

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const count = w < 700 ? Math.round(t.particles / 2) : t.particles;
    const pts = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * t.speed, vy: -Math.random() * t.speed - 0.05, ph: Math.random() * 6.28,
      alt: Math.random() > 0.9, // a fixed minority of particles use the secondary accent
    }));
    const baseAlpha = 0.4 + t.glow * 0.6;

    const draw = (time) => {
      // Speeds are authored per 60fps frame; scale by elapsed time so 120/144Hz screens don't run fast
      // and dropped frames don't make motion stutter.
      const k = last ? Math.min((time - last) / 16.667, 3) : 1;
      last = time;
      ctx.clearRect(0, 0, w, h);
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? t.a2 : t.a;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p.alt !== (pass === 1)) continue;
          p.x += p.vx * k; p.y += p.vy * k;
          if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
          if (p.x < -5) p.x = w + 5; else if (p.x > w + 5) p.x = -5;
          ctx.globalAlpha = (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(time / 900 + p.ph))) * baseAlpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 6.28);
          ctx.fill();
        }
      }
      if (tier >= 8) {
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = t.a;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 3) for (let j = i + 1; j < Math.min(i + 6, pts.length); j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          if (dx * dx + dy * dy < 14000) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); }
        }
        ctx.stroke(); // one stroke call for all links
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time) => { draw(time); raf = requestAnimationFrame(loop); };
    const start = () => { if (!raf && !reduce) { last = 0; raf = requestAnimationFrame(loop); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    const onResize = () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(resize); };

    if (reduce) draw(0); else start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    return () => {
      stop(); cancelAnimationFrame(resizeRaf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, [tier]);
  return <canvas ref={ref} className="fixed inset-0 pointer-events-none z-0" aria-hidden="true" />;
};

const ORBS = [
  { cls: "-top-40 -left-40 w-[620px] h-[620px]", color: "var(--a)", dur: 8, delay: 0 },
  { cls: "top-1/3 -right-52 w-[560px] h-[560px]", color: "var(--a2)", dur: 10, delay: -1.5 },
  { cls: "-bottom-60 left-1/4 w-[700px] h-[700px]", color: "var(--a)", dur: 9, delay: -3 },
];

// Orbs are soft radial gradients animated with transform + opacity only (compositor-driven). The old
// version used `filter: blur(150px)` on three huge animated layers, which forced a re-blur every frame.
export const Background = memo(({ tier }) => {
  const g = TIER_THEMES[tier - 1].glow;
  const style = { "--lo": 0.1 + g * 0.2, "--hi": 0.22 + g * 0.35, "--ring": 0.5 * g + 0.1 };
  return (
    <div aria-hidden="true" data-testid="pulsing-background" style={style}>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {ORBS.map((o, i) => (
          <div
            key={i}
            className={`sf-orb absolute rounded-full ${o.cls}`}
            style={{ background: `radial-gradient(circle closest-side, ${o.color}, transparent 100%)`, animationDuration: `${o.dur}s`, animationDelay: `${o.delay}s` }}
          />
        ))}
        <div
          className="sf-ring absolute left-1/2 top-[38%] w-[340px] h-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ borderColor: "var(--a-line)" }}
        />
      </div>
      <div className="grid-field" />
      <Particles tier={tier} />
      <div className="scanlines" />
      <div className="grain" />
    </div>
  );
});

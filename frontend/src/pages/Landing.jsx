import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Activity, Bot, Download, LineChart, Layers, ShieldCheck } from "lucide-react";
import { Background } from "@/components/sf/Background";
import { InstallDrawer } from "@/components/sf/InstallDrawer";
import { applyTheme } from "@/lib/theme";
import { useSite } from "@/lib/site";
import { AnnouncementBanner } from "@/components/sf/AnnouncementBanner";

const FEATURES = [
  { icon: Activity, t: "Full universe", d: "All ~4,000 NASDAQ listings and the top 100 cryptos, live, searchable and sortable." },
  { icon: Bot, t: "Quantum forecasts", d: "Monte Carlo cones with best / average / worst case, S/R rails, probabilities and a Claude briefing." },
  { icon: LineChart, t: "Deposit & invest", d: "Fund instantly or by card, then trade any stock or coin at live prices with full P&L." },
  { icon: Layers, t: "10 tiers", d: "Every tier re-skins the terminal — from plain ledger to void singularity." },
];

export default function Landing() {
  const [install, setInstall] = useState(false);
  const s = useSite().data?.settings;
  useEffect(() => applyTheme(5, s), [s]);
  const headline = s?.landing_headline;
  return (
    <div className="min-h-screen relative overflow-hidden">
      <Background tier={5} />
      <div className="relative z-20"><AnnouncementBanner /></div>
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <nav className="flex items-center justify-between py-6">
          <span className="font-disp font-bold tracking-[0.2em] text-xl" data-testid="landing-site-name">{s?.site_name || "STOCKFORGE"}</span>
          <div className="flex gap-2">
            <button className="sf-btn" onClick={() => setInstall(true)} data-testid="landing-get-app-button"><Download size={14} /> Get app</button>
            <Link to="/sign-in" className="sf-btn sf-btn-p" data-testid="landing-sign-in-button">Sign in</Link>
          </div>
        </nav>
        <section className="grid lg:grid-cols-12 gap-10 pt-10 sm:pt-16 lg:pt-28 pb-20">
          <motion.div className="lg:col-span-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="kicker mb-5">{s?.tagline || "NEURAL TERMINAL"} · v3</p>
            <h1 className="font-disp text-[2.6rem] sm:text-6xl lg:text-7xl font-bold leading-[0.98] tracking-tight text-balance" data-testid="landing-headline">
              {headline && headline !== "The market, forged into one glowing terminal." ? headline : <>The market,<br /><span className="accent">forged</span> into one<br />glowing terminal.</>}
            </h1>
            <p className="text-neutral-400 text-base md:text-lg max-w-xl mt-6 leading-relaxed" data-testid="landing-sub">
              {s?.landing_sub || "Every NASDAQ company and the top 100 cryptos, futuristic Monte Carlo predictions with support & resistance, deposits to invest, an AI advisor powered by Claude and ten membership tiers that transform the whole interface."}
            </p>
            <div className="flex flex-wrap gap-3 mt-10">
              <Link to="/sign-in" className="sf-btn sf-btn-p !px-6 !py-4 !text-sm" data-testid="landing-cta-button">Enter the terminal</Link>
              <button className="sf-btn !px-6 !py-4 !text-sm" onClick={() => setInstall(true)} data-testid="landing-download-button"><Download size={16} /> Download the app</button>
            </div>
            <p className="font-mono text-[10px] tracking-widest text-neutral-600 mt-6 flex items-center gap-2"><ShieldCheck size={12} /> EMAIL OR GOOGLE SIGN-IN · ROOKIE TIER IS FREE · NOT INVESTMENT ADVICE</p>
          </motion.div>
          <div className="lg:col-span-5 grid sm:grid-cols-2 gap-4 content-end">
            {FEATURES.map((f, i) => (
              <motion.div key={f.t} className="sf-panel sf-hover p-5" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}>
                <f.icon className="accent mb-4" size={20} />
                <p className="font-disp text-lg">{f.t}</p>
                <p className="text-sm text-neutral-400 mt-1">{f.d}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
      <InstallDrawer open={install} onOpenChange={setInstall} />
    </div>
  );
}

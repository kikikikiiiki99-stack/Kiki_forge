import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Palette, RotateCcw, Save } from "lucide-react";
import { useSF } from "@/context/SFContext";
import { applyTheme } from "@/lib/theme";
import type { SFApi, SiteSettings, SiteSettingsUpdate } from "@/lib/site";
import { SECTIONS, SITE_KEY, useSite } from "@/lib/site";

type Draft = Omit<SiteSettings, "updated_at">;

// <input type="datetime-local"> works in the admin's local time; the server stores UTC ISO.
const toLocal = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const toUtc = (local: string) => (local ? new Date(local).toISOString().replace(/\.\d{3}Z$/, "Z") : "");

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5"><span className="lab !mb-0 block">{label}</span>{children}</label>
);

const ColorField = ({ label, value, onChange, testid }: { label: string; value: string; onChange: (v: string) => void; testid: string }) => (
  <Field label={label}>
    <div className="flex items-center gap-2">
      <input type="color" className="sf-swatch" value={value || "#00e5ff"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} data-testid={`${testid}-picker`} />
      <input className="sf-input flex-1 min-w-0 !text-xs" placeholder="Tier colours" value={value} maxLength={7}
        onChange={(e) => onChange(e.target.value.trim())} data-testid={`${testid}-input`} />
    </div>
  </Field>
);

export default function SiteSettingsTab() {
  const sf = useSF() as unknown as { api: SFApi; themeTier: number };
  const qc = useQueryClient();
  const { data, isLoading } = useSite();
  const [d, setD] = useState<Draft | null>(null);

  useEffect(() => { if (data && !d) { const { updated_at: _u, ...rest } = data.settings; setD(rest); } }, [data, d]);
  // Live preview of the colours while editing; Save persists them for everyone.
  useEffect(() => { if (d) applyTheme(sf.themeTier, d); }, [d?.brand_primary, d?.brand_secondary, sf.themeTier]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const s = qc.getQueryData<{ settings: SiteSettings }>(SITE_KEY)?.settings; applyTheme(sf.themeTier, s); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (body: SiteSettingsUpdate) => sf.api.put<SiteSettings>("/admin/site", body),
    onSuccess: () => { toast.success("Site settings saved — live for everyone"); qc.invalidateQueries({ queryKey: SITE_KEY }); qc.invalidateQueries({ queryKey: ["admin-history"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !d) return <div className="grid gap-3" data-testid="site-settings-loading"><div className="sk h-40" /><div className="sk h-56" /></div>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const hexOk = (v: string) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v);
  const datesOk = !d.banner_starts_at || !d.banner_ends_at || d.banner_ends_at > d.banner_starts_at;
  const valid = d.site_name.trim().length > 0 && hexOk(d.brand_primary) && hexOk(d.brand_secondary) && datesOk;

  return (
    <form className="grid lg:grid-cols-2 gap-5" onSubmit={(e) => { e.preventDefault(); save.mutate(d); }} data-testid="site-settings-form">
      <div className="sf-panel p-6 space-y-4">
        <div className="lab">BRAND</div>
        <Field label="Site name"><input className="sf-input w-full" value={d.site_name} maxLength={40} onChange={(e) => set("site_name", e.target.value)} data-testid="site-name-input" /></Field>
        <Field label="Tagline"><input className="sf-input w-full" value={d.tagline} maxLength={60} onChange={(e) => set("tagline", e.target.value)} data-testid="site-tagline-input" /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <ColorField label="Primary colour" value={d.brand_primary} onChange={(v) => set("brand_primary", v)} testid="brand-primary" />
          <ColorField label="Secondary colour" value={d.brand_secondary} onChange={(v) => set("brand_secondary", v)} testid="brand-secondary" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 flex items-center gap-1.5"><Palette size={12} /> Empty = each member keeps their tier colours.</p>
          <button type="button" className="sf-btn sf-btn-sm" onClick={() => setD({ ...d, brand_primary: "", brand_secondary: "" })} data-testid="brand-reset-button"><RotateCcw size={12} /> Tier colours</button>
        </div>
      </div>

      <div className="sf-panel p-6 space-y-4">
        <div className="lab">ANNOUNCEMENT BANNER</div>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm">Show banner across the site</span>
          <input type="checkbox" className="sf-switch" checked={d.banner_enabled} onChange={(e) => set("banner_enabled", e.target.checked)} data-testid="banner-enabled-toggle" />
        </label>
        <Field label="Message"><textarea className="sf-input w-full min-h-[84px]" value={d.banner_text} maxLength={240} onChange={(e) => set("banner_text", e.target.value)} data-testid="banner-text-input" /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Starts (your time)">
            <input type="datetime-local" className="sf-input w-full !text-xs" value={toLocal(d.banner_starts_at)} onChange={(e) => set("banner_starts_at", toUtc(e.target.value))} data-testid="banner-start-input" />
          </Field>
          <Field label="Ends (your time)">
            <input type="datetime-local" className="sf-input w-full !text-xs" value={toLocal(d.banner_ends_at)} onChange={(e) => set("banner_ends_at", toUtc(e.target.value))} data-testid="banner-end-input" />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-neutral-500">Leave empty to show right away / never end.</span>
          {(d.banner_starts_at || d.banner_ends_at) && <button type="button" className="sf-btn sf-btn-sm" onClick={() => setD({ ...d, banner_starts_at: "", banner_ends_at: "" })} data-testid="banner-schedule-clear">Clear dates</button>}
        </div>
        <p className="text-xs" data-testid="banner-live-status">
          Saved status: {data?.settings.banner_live ? <span className="bull">showing now</span> : data?.settings.banner_enabled ? <span className="text-amber-400">scheduled / outside its dates</span> : <span className="text-neutral-500">off</span>}
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="Banner tone">
          {(["info", "warning", "alert"] as const).map((t) => (
            <button type="button" key={t} role="radio" aria-checked={d.banner_tone === t} onClick={() => set("banner_tone", t)}
              className={`sf-chip ${d.banner_tone === t ? "sf-chip-on" : ""}`} data-testid={`banner-tone-${t}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="sf-panel p-6 space-y-4">
        <div className="lab">HOMEPAGE TEXT</div>
        <Field label="Landing headline (signed-out)"><input className="sf-input w-full" value={d.landing_headline} maxLength={140} onChange={(e) => set("landing_headline", e.target.value)} data-testid="landing-headline-input" /></Field>
        <Field label="Landing intro"><textarea className="sf-input w-full min-h-[96px]" value={d.landing_sub} maxLength={400} onChange={(e) => set("landing_sub", e.target.value)} data-testid="landing-sub-input" /></Field>
        <Field label="Feed headline (signed-in)"><input className="sf-input w-full" value={d.home_headline} maxLength={80} onChange={(e) => set("home_headline", e.target.value)} data-testid="home-headline-input" /></Field>
        <Field label="Feed subtitle"><input className="sf-input w-full" value={d.home_sub} maxLength={200} onChange={(e) => set("home_sub", e.target.value)} data-testid="home-sub-input" /></Field>
      </div>

      <div className="sf-panel p-6">
        <div className="lab">APP SECTIONS</div>
        <p className="text-xs text-neutral-500 mb-4">Turned-off sections disappear from navigation for every member. Feed and Admin always stay on.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SECTIONS.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 cursor-pointer">
              <span className="text-sm">{s.label}</span>
              <input type="checkbox" className="sf-switch" checked={d.sections[s.id] !== false}
                onChange={(e) => set("sections", { ...d.sections, [s.id]: e.target.checked })} data-testid={`section-toggle-${s.id}`} />
            </label>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 flex justify-end sticky bottom-20 lg:bottom-4 z-10">
        {!datesOk && <span className="text-xs bear self-center mr-3" data-testid="banner-dates-error">Banner end must be after its start</span>}
        <button className="sf-btn sf-btn-p shadow-2xl" type="submit" disabled={!valid || save.isPending} data-testid="site-settings-save"><Save size={14} />{save.isPending ? "Saving…" : "Save settings"}</button>
      </div>
    </form>
  );
}

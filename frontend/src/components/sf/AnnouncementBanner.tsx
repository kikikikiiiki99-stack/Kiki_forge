import { useState } from "react";
import { AlertTriangle, Info, Megaphone, X } from "lucide-react";
import type { BannerTone } from "@/lib/site";
import { useSite } from "@/lib/site";

const ICON = { info: Info, warning: AlertTriangle, alert: Megaphone } as const;

export const AnnouncementBanner = () => {
  const { data, isError } = useSite();
  const s = data?.settings;
  const key = `sf_banner_closed_${s?.updated_at ?? ""}`;
  const [closed, setClosed] = useState(() => {
    try { return sessionStorage.getItem(key) === "1"; } catch { return false; }
  });
  if (isError || !s || !s.banner_live || closed) return null;
  const tone: BannerTone = s.banner_tone;
  const Icon = ICON[tone];
  return (
    <div className={`sf-banner sf-banner-${tone}`} role="status" data-testid="announcement-banner">
      <div className="max-w-[1600px] mx-auto flex items-center gap-3 px-4 lg:px-8 py-2.5">
        <Icon size={15} className="shrink-0" />
        <p className="text-sm flex-1 min-w-0" data-testid="announcement-banner-text">{s.banner_text}</p>
        <button
          className="sf-icon-btn"
          aria-label="Dismiss announcement"
          onClick={() => { setClosed(true); try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } }}
          data-testid="announcement-banner-close"
        ><X size={14} /></button>
      </div>
    </div>
  );
};

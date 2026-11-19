// Mirrors backend/models/site.py by hand — change both in the same edit.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export type BannerTone = "info" | "warning" | "alert";
export type ItemTone = "bull" | "bear" | "neutral";
export type ItemLink = "forecast" | "markets" | "none";

export interface SiteSettings {
  site_name: string;
  tagline: string;
  brand_primary: string;
  brand_secondary: string;
  landing_headline: string;
  landing_sub: string;
  home_headline: string;
  home_sub: string;
  banner_enabled: boolean;
  banner_text: string;
  banner_tone: BannerTone;
  banner_starts_at: string; // UTC ISO or "" (no limit)
  banner_ends_at: string;
  banner_live: boolean; // computed by the server: enabled + text + inside the window
  sections: Record<string, boolean>;
  updated_at: string | null;
}
export type SiteSettingsUpdate = Partial<Omit<SiteSettings, "updated_at" | "banner_live">>;

export interface FeaturedItemIn {
  sym: string;
  title: string;
  note: string;
  tone: ItemTone;
  link: ItemLink;
  order: number;
  active: boolean;
}
export interface FeaturedItem extends FeaturedItemIn {
  id: string;
  created_at: string;
}
export interface SitePublic {
  settings: SiteSettings;
  items: FeaturedItem[];
}

export type ProposalKind =
  | "update_settings" | "create_item" | "update_item" | "delete_item"
  | "set_user_tier" | "set_user_admin" | "delete_user";
export type ProposalStatus = "proposed" | "applied" | "dismissed" | "failed";
export interface Proposal {
  id: string;
  kind: ProposalKind;
  summary: string;
  payload: Record<string, unknown>;
  destructive: boolean;
  status: ProposalStatus;
  error: string | null;
}
export interface AgentMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  proposals: Proposal[];
  t: string;
}
export interface AdminUserDeleteOut { user_id: string; deleted: boolean }
export interface ChangeEntry {
  t: string;
  by: string;
  by_email: string;
  source: "admin" | "agent" | "system";
  summary: string;
}

// The authed client from SFContext (Clerk bearer token); typed here for TS consumers.
export interface SFApi {
  get: <T = unknown>(p: string) => Promise<T>;
  post: <T = unknown>(p: string, b?: unknown) => Promise<T>;
  put: <T = unknown>(p: string, b?: unknown) => Promise<T>;
  patch: <T = unknown>(p: string, b?: unknown) => Promise<T>;
  del: <T = unknown>(p: string) => Promise<T>;
}

export const SECTIONS: { id: string; label: string }[] = [
  { id: "markets", label: "Markets" }, { id: "dash", label: "Dashboard" }, { id: "quotes", label: "Quotes" },
  { id: "live", label: "Live" }, { id: "scan", label: "Scanner" }, { id: "watch", label: "Watchlist" },
  { id: "ai", label: "Advisor" }, { id: "trade", label: "Paper" }, { id: "tiers", label: "Tiers" },
];

export const SITE_KEY = ["site"] as const;

// Public settings; a failed fetch (static preview, offline) leaves data undefined and callers use defaults.
export const useSite = () =>
  useQuery({ queryKey: SITE_KEY, queryFn: () => apiGet<SitePublic>("/site"), staleTime: 30_000 });

export const sectionOn = (settings: SiteSettings | undefined, id: string) =>
  id === "home" || id === "admin" || !settings || settings.sections[id] !== false;

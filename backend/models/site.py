"""Admin control centre models: site settings, featured items, AI-agent messages + proposals.
Mirrored by hand in frontend/src/lib/site.ts — change both in the same edit."""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

HEX = r"^(#[0-9a-fA-F]{6})?$"  # empty string = use the member's tier colours
SECTION_IDS = ["markets", "dash", "quotes", "live", "scan", "watch", "ai", "trade", "tiers"]
BannerTone = Literal["info", "warning", "alert"]
ItemTone = Literal["bull", "bear", "neutral"]
ItemLink = Literal["forecast", "markets", "none"]
ISO = r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$"  # "" = no limit


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SiteSettings(BaseModel):
    site_name: str = Field("STOCKFORGE", min_length=1, max_length=40)
    tagline: str = Field("NEURAL TERMINAL", max_length=60)
    brand_primary: str = Field("", pattern=HEX)
    brand_secondary: str = Field("", pattern=HEX)
    landing_headline: str = Field("The market, forged into one glowing terminal.", max_length=140)
    landing_sub: str = Field(
        "Every NASDAQ company and the top 100 cryptos, Monte Carlo predictions with support & resistance, "
        "deposits to invest, an AI advisor powered by Claude and ten membership tiers that transform the whole interface.",
        max_length=400)
    home_headline: str = Field("Market Feed", max_length=80)
    home_sub: str = Field("Session momentum · tap any name for a deep dive", max_length=200)
    banner_enabled: bool = False
    banner_text: str = Field("", max_length=240)
    banner_tone: BannerTone = "info"
    banner_starts_at: str = Field("", pattern=ISO)  # UTC ISO; empty = show immediately
    banner_ends_at: str = Field("", pattern=ISO)    # UTC ISO; empty = never ends
    banner_live: bool = False  # computed server-side: enabled + text + inside the window
    sections: Dict[str, bool] = Field(default_factory=lambda: {s: True for s in SECTION_IDS})
    updated_at: Optional[str] = None


class SiteSettingsUpdate(BaseModel):
    site_name: Optional[str] = Field(None, min_length=1, max_length=40)
    tagline: Optional[str] = Field(None, max_length=60)
    brand_primary: Optional[str] = Field(None, pattern=HEX)
    brand_secondary: Optional[str] = Field(None, pattern=HEX)
    landing_headline: Optional[str] = Field(None, max_length=140)
    landing_sub: Optional[str] = Field(None, max_length=400)
    home_headline: Optional[str] = Field(None, max_length=80)
    home_sub: Optional[str] = Field(None, max_length=200)
    banner_enabled: Optional[bool] = None
    banner_text: Optional[str] = Field(None, max_length=240)
    banner_tone: Optional[BannerTone] = None
    banner_starts_at: Optional[str] = Field(None, pattern=ISO)
    banner_ends_at: Optional[str] = Field(None, pattern=ISO)
    sections: Optional[Dict[str, bool]] = None


class FeaturedItemIn(BaseModel):
    sym: str = Field(min_length=1, max_length=12)
    title: str = Field(min_length=1, max_length=80)
    note: str = Field("", max_length=240)
    tone: ItemTone = "neutral"
    link: ItemLink = "forecast"
    order: int = Field(0, ge=0, le=999)
    active: bool = True


class FeaturedItemPatch(BaseModel):
    sym: Optional[str] = Field(None, min_length=1, max_length=12)
    title: Optional[str] = Field(None, min_length=1, max_length=80)
    note: Optional[str] = Field(None, max_length=240)
    tone: Optional[ItemTone] = None
    link: Optional[ItemLink] = None
    order: Optional[int] = Field(None, ge=0, le=999)
    active: Optional[bool] = None


class FeaturedItem(FeaturedItemIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)


class SitePublic(BaseModel):
    settings: SiteSettings
    items: List[FeaturedItem]


ProposalKind = Literal["update_settings", "create_item", "update_item", "delete_item",
                       "set_user_tier", "set_user_admin", "delete_user"]
ProposalStatus = Literal["proposed", "applied", "dismissed", "failed"]


class Proposal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kind: ProposalKind
    summary: str = Field(max_length=300)
    payload: Dict[str, Any] = Field(default_factory=dict)
    destructive: bool = False
    status: ProposalStatus = "proposed"
    error: Optional[str] = None


class AgentMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: Literal["user", "ai"]
    text: str
    proposals: List[Proposal] = Field(default_factory=list)
    t: str = Field(default_factory=now_iso)


class AgentChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=3000)


class AdminUserDeleteOut(BaseModel):
    user_id: str
    deleted: bool


class ChangeEntry(BaseModel):
    t: str
    by: str = ""
    by_email: str = ""
    source: Literal["admin", "agent", "system"] = "admin"
    summary: str

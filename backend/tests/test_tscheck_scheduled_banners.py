"""Scheduled banners: PUT /api/admin/site accepts banner_starts_at/banner_ends_at (UTC ISO
or ''); GET /api/site returns banner_live=false outside the window, true inside it;
end<=start returns 400. Restores the original banner window afterwards (owner's site is live)."""
import json
from datetime import datetime, timedelta, timezone

import pytest

ADMIN_TOKEN = json.load(open("/tmp/admin_tok.json"))["token"]
AUTH = {"Authorization": f"Bearer {ADMIN_TOKEN}"}


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture
def restore_banner(client):
    before = client.get("/admin/site", headers=AUTH).json()
    yield before
    client.put("/admin/site", headers=AUTH, json={
        "banner_starts_at": before.get("banner_starts_at", ""),
        "banner_ends_at": before.get("banner_ends_at", ""),
        "banner_enabled": before.get("banner_enabled", False),
        "banner_text": before.get("banner_text", ""),
    })


def test_banner_future_window_not_live(client, restore_banner):
    now = datetime.now(timezone.utc)
    start = _iso(now + timedelta(days=1))
    end = _iso(now + timedelta(days=2))
    r = client.put("/admin/site", headers=AUTH, json={
        "banner_enabled": True, "banner_text": "tscheck-banner future window",
        "banner_starts_at": start, "banner_ends_at": end,
    })
    assert r.status_code == 200, r.text

    pub = client.get("/site").json()
    assert pub["settings"]["banner_live"] is False, f"Expected not-live for future window: {pub['settings']}"


def test_banner_inside_window_is_live(client, restore_banner):
    now = datetime.now(timezone.utc)
    start = _iso(now - timedelta(hours=1))
    end = _iso(now + timedelta(hours=1))
    r = client.put("/admin/site", headers=AUTH, json={
        "banner_enabled": True, "banner_text": "tscheck-banner active window",
        "banner_starts_at": start, "banner_ends_at": end,
    })
    assert r.status_code == 200, r.text

    pub = client.get("/site").json()
    assert pub["settings"]["banner_live"] is True, f"Expected live inside window: {pub['settings']}"


def test_banner_end_before_start_rejected(client, restore_banner):
    now = datetime.now(timezone.utc)
    start = _iso(now + timedelta(hours=2))
    end = _iso(now + timedelta(hours=1))  # end before start
    r = client.put("/admin/site", headers=AUTH, json={
        "banner_enabled": True, "banner_text": "tscheck-banner bad window",
        "banner_starts_at": start, "banner_ends_at": end,
    })
    assert r.status_code == 400, f"Expected 400 for end<=start, got {r.status_code}: {r.text}"

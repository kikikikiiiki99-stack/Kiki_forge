"""Change history: GET /api/admin/history 200 for admin, 401 without token, 403 for
non-admin. Also checks a setting change produces a readable new entry at the top."""
import json

ADMIN_TOKEN = json.load(open("/tmp/admin_tok.json"))["token"]
MEMBER_TOKEN = json.load(open("/tmp/member_tok.json"))["token"]
AUTH = {"Authorization": f"Bearer {ADMIN_TOKEN}"}


def test_history_auth_gating(client):
    assert client.get("/admin/history").status_code == 401
    assert client.get("/admin/history", headers={"Authorization": f"Bearer {MEMBER_TOKEN}"}).status_code == 403
    r = client.get("/admin/history", headers=AUTH)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_history_records_new_entry(client):
    before = client.get("/admin/site", headers=AUTH).json()
    tagline_before = before.get("tagline", "")
    # tiny no-op-ish round trip: set tagline to itself + restore, but needs an actual change
    # to produce a log entry: toggle to a tscheck marker and back.
    r1 = client.put("/admin/site", headers=AUTH, json={"tagline": "tscheck-history-marker"})
    assert r1.status_code == 200, r1.text

    hist = client.get("/admin/history", headers=AUTH).json()
    assert len(hist) > 0
    top = hist[0]
    assert "tagline" in top["summary"].lower(), f"Expected readable tagline entry, got: {top}"
    assert top["by_email"], "Expected admin email recorded on entry"
    assert top["source"] == "admin"
    assert top["t"]

    # restore original tagline
    r2 = client.put("/admin/site", headers=AUTH, json={"tagline": tagline_before})
    assert r2.status_code == 200, r2.text

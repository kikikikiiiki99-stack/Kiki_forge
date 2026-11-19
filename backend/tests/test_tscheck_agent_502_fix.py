"""Reported bug: admin AI agent failed with a bare 502.

With the Emergent LLM key budget exhausted (current account state), POST
/api/admin/agent/chat should return 402 with a friendly "AI credits..." message
instead of a bare 502. Also checks auth gating (401/403).
"""
import json
import os

import httpx
import pytest

ADMIN_TOKEN = json.load(open("/tmp/admin_tok.json"))["token"]
MEMBER_TOKEN = json.load(open("/tmp/member_tok.json"))["token"]


def test_agent_chat_no_bare_502(client):
    resp = client.post("/admin/agent/chat", json={"text": "tscheck-agent: hello, any suggestions?"},
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert resp.status_code != 502, f"Bug: bare 502 returned: {resp.text[:300]}"
    assert resp.status_code in (200, 402, 503), f"Unexpected status {resp.status_code}: {resp.text[:300]}"
    if resp.status_code == 402:
        detail = resp.json().get("detail", "")
        assert detail.startswith("AI credits for this app are used up"), f"Unexpected 402 detail: {detail!r}"
    elif resp.status_code == 200:
        body = resp.json()
        assert "text" in body and "role" in body


def test_agent_chat_requires_auth(client):
    r_noauth = client.post("/admin/agent/chat", json={"text": "hi"})
    assert r_noauth.status_code == 401

    r_member = client.post("/admin/agent/chat", json={"text": "hi"},
                            headers={"Authorization": f"Bearer {MEMBER_TOKEN}"})
    assert r_member.status_code == 403

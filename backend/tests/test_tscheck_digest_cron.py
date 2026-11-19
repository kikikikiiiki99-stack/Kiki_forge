"""Digest cron endpoint: POST /api/cron/digest without the webhook secret -> 401; with it
-> 202 {accepted:true}; replaying the same X-Webhook-Id -> duplicate:true; the run reaches
db.cron_runs status 'done' (email delivery itself may legitimately 402 on insufficient
account credits - that's a billing state, not a bug, and is not asserted here)."""
import os
import time
import uuid

import httpx
import pytest
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")


def test_digest_requires_secret(client):
    r = client.post("/cron/digest", json={})
    assert r.status_code == 401


def test_digest_accepts_and_dedupes(client):
    assert SECRET, "WEBHOOK_CRON_SECRET must be set in backend/.env for this test"
    webhook_id = f"tscheck-digest-{uuid.uuid4()}"
    headers = {"Authorization": f"Bearer {SECRET}", "X-Webhook-Id": webhook_id}

    r1 = client.post("/cron/digest", json={}, headers=headers)
    assert r1.status_code == 202, r1.text
    body1 = r1.json()
    assert body1.get("accepted") is True

    r2 = client.post("/cron/digest", json={}, headers=headers)
    assert r2.status_code == 202, r2.text
    body2 = r2.json()
    assert body2.get("accepted") is True
    assert body2.get("duplicate") is True, f"Expected duplicate:true on replay, got {body2}"

    # poll db.cron_runs for the background task to reach a terminal status
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    assert mongo_url and db_name, "MONGO_URL/DB_NAME must be set to inspect cron_runs"
    coll = MongoClient(mongo_url)[db_name]["cron_runs"]
    status = None
    for _ in range(20):
        doc = coll.find_one({"run_id": webhook_id})
        status = doc.get("status") if doc else None
        if status in ("done", "failed"):
            break
        time.sleep(1)
    assert status == "done", f"Expected cron_runs status 'done' (stats path always succeeds), got {status!r}"

"""Dev-only helper: create/reuse a Clerk test user and print a session JWT + sign-in ticket.
Usage: python tests/clerk_token.py [email]"""
import json, os, sys, urllib.request, urllib.error
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


email = sys.argv[1] if len(sys.argv) > 1 else "trader+clerk_test@example.com"
found = bapi(f"/users?email_address={urllib.parse.quote(email)}", method="GET") if False else None
import urllib.parse
found = bapi("/users?" + urllib.parse.urlencode({"email_address": email}), method="GET")
user = found[0] if found else bapi("/users", {"email_address": [email], "password": "Forge-test-2026!", "skip_password_checks": True})
session = bapi("/sessions", {"user_id": user["id"]})
token = bapi(f"/sessions/{session['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]
ticket = bapi("/sign_in_tokens", {"user_id": user["id"], "expires_in_seconds": 3600})["token"]
print(json.dumps({"user_id": user["id"], "token": token, "ticket": ticket}))

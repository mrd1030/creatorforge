"""Backend tests for CreatorForge P2 batch:
  - POST /api/generate/block/stream  (SSE)
  - POST /api/send-email             (Resend; domain unverified -> graceful 500)
"""
import json
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
TIMEOUT_LLM = 180


# ---------- /api root sanity ----------
def test_api_root():
    r = requests.get(f"{BASE_URL}/api/", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("app") == "CreatorForge"
    assert "claude" in data.get("model", "").lower()


# ---------- streaming endpoint ----------
class TestGenerateBlockStream:
    payload = {
        "styleId": "real-person",
        "brief": {"topic": "kitten first week"},
        "blockType": "title",
    }

    def test_sse_streams_deltas_and_done(self):
        url = f"{BASE_URL}/api/generate/block/stream"
        with requests.post(url, json=self.payload, stream=True, timeout=TIMEOUT_LLM) as r:
            assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
            ctype = r.headers.get("content-type", "")
            assert "text/event-stream" in ctype, f"Unexpected content-type: {ctype}"
            # Note: backend sets X-Accel-Buffering:no but Cloudflare proxy may strip it.
            # Streaming still works via Transfer-Encoding: chunked.

            deltas = []
            done_seen = False
            error_seen = None
            start = time.time()
            for raw in r.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                if not raw:
                    continue
                if not raw.startswith("data:"):
                    continue
                payload = raw[len("data:"):].strip()
                try:
                    obj = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if "delta" in obj:
                    deltas.append(obj["delta"])
                if obj.get("done") is True:
                    done_seen = True
                    break
                if "error" in obj:
                    error_seen = obj["error"]
                if time.time() - start > TIMEOUT_LLM:
                    break

            assert error_seen is None, f"Stream returned error: {error_seen}"
            assert done_seen, "Did not receive final {done:true} sentinel"
            assert len(deltas) > 0, "No delta chunks received"
            combined = "".join(deltas).strip()
            assert len(combined) > 5, f"Combined deltas too short: {combined!r}"

    def test_sse_invalid_payload(self):
        # Missing required field "brief"
        r = requests.post(f"{BASE_URL}/api/generate/block/stream",
                          json={"styleId": "real-person", "blockType": "title"},
                          timeout=30)
        assert r.status_code == 422


# ---------- send-email endpoint ----------
class TestSendEmail:
    valid_payload = {
        "recipient_email": "TEST_recipient@example.com",
        "subject": "TEST_CreatorForge",
        "html_content": "<p>TEST</p>",
    }

    def test_invalid_email_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/send-email", json={
            "recipient_email": "not-an-email",
            "subject": "x",
            "html_content": "<p>x</p>",
        }, timeout=30)
        assert r.status_code == 422

    def test_unverified_domain_returns_graceful_500(self):
        """Sender domain hello@example.com is NOT verified in Resend.
        Expected: HTTP 500 with detail mentioning 'domain is not verified' (graceful)."""
        r = requests.post(f"{BASE_URL}/api/send-email", json=self.valid_payload, timeout=60)
        # Resend returns a domain-verification error; backend wraps as 500.
        # If by some chance the domain were verified, 200 would also be acceptable.
        assert r.status_code in (200, 500), f"Unexpected status {r.status_code}: {r.text[:300]}"
        if r.status_code == 500:
            body = r.json()
            detail = (body.get("detail") or "").lower()
            # Must surface a meaningful message, not crash
            assert "failed to send email" in detail or "domain" in detail or "verified" in detail, (
                f"Error detail not graceful enough: {detail}"
            )

    def test_missing_field_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/send-email", json={
            "recipient_email": "ok@example.com",
        }, timeout=30)
        assert r.status_code == 422

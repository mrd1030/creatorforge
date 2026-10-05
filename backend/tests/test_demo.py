"""Offline tests for the public demo restrictions in demo.py (demo branch only).

Run from backend/:  python -m pytest tests/test_demo.py
"""
import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import demo  # noqa: E402
import server  # noqa: E402


@pytest.fixture
def client(monkeypatch):
    async def fake_llm(system, user_text, max_tokens=2000):
        return "ok"

    monkeypatch.setattr(server, "llm_complete", fake_llm)
    monkeypatch.setattr(demo, "BUY_URL", "https://example.com/buy")
    app = FastAPI()
    app.include_router(server.api_router)
    app.add_middleware(demo.DemoMiddleware, client_ip=lambda r: r.headers.get("x-test-ip", "1.1.1.1"))
    return TestClient(app)


def polish(c, ip="1.1.1.1", text="hello"):
    return c.post("/api/humanize", json={"text": text}, headers={"x-test-ip": ip})


def test_status_reports_allowances(client):
    s = client.get("/api/demo").json()
    assert s["demo"] is True
    assert s["buyUrl"] == "https://example.com/buy"
    assert s["features"]["generate_all"] == {"label": "article generation", "limit": 1, "remaining": 1}
    assert s["features"]["polish"]["remaining"] == 2
    assert "stream_all" in s["locked"] and "import" in s["hidden"]


def test_feature_allowance_is_per_visitor(client):
    assert [polish(client).status_code for _ in range(3)] == [200, 200, 429]
    assert "https://example.com/buy" in polish(client).json()["detail"]
    assert client.get("/api/demo", headers={"x-test-ip": "1.1.1.1"}).json()["features"]["polish"]["remaining"] == 0
    # Another visitor still has their own allowance.
    assert polish(client, ip="2.2.2.2").status_code == 200


def test_failed_calls_are_refunded(client):
    assert polish(client, text="x" * (server._LONG + 1)).status_code == 422
    assert client.get("/api/demo").json()["features"]["polish"]["remaining"] == 2


def test_disabled_and_unknown_routes_are_refused(client):
    r = client.post("/api/process/article", json={"text": "hi"})
    assert r.status_code == 403 and "Import" in r.json()["detail"]
    r = client.post("/api/send-email", json={"recipient_email": "a@b.co", "subject": "s", "html_content": "h"})
    assert r.status_code == 403
    assert client.post("/api/some-new-route", json={}).status_code == 403


def test_get_requests_pass_through(client):
    assert client.get("/api/").status_code == 200


def test_site_wide_ceiling(client, monkeypatch):
    monkeypatch.setattr(demo, "SITE_DAILY_LIMIT", 3)
    codes = [polish(client, ip=f"3.3.3.{i}").status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]

"""Offline tests for abuse protection: input caps, block cap, rate limiting, client IP parsing,
and niche-aware prompts. Claude is stubbed out, so these need no API key or running server.

Run from backend/:  python -m pytest tests/test_limits.py
"""
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

BRIEF = {"topic": "Senior dog care", "niche": "Pet Care"}


@pytest.fixture
def calls(monkeypatch):
    """Stub llm_complete and record (system, user) for each call."""
    recorded = []

    async def fake_llm(system, user_text, max_tokens=2000):
        recorded.append((system, user_text))
        if "Return a single JSON object mapping block id" in user_text:
            return json.dumps({"b1": "Hello."})
        if "focusKeyword (a 2-4 word" in system:
            return json.dumps({"focusKeyword": "senior dog care", "metaDescription": "x" * 155})
        return "ok"

    monkeypatch.setattr(server, "llm_complete", fake_llm)
    return recorded


_ip_counter = [0]


def client_for_new_ip():
    """Each test gets its own client IP so the shared rate limiter doesn't leak between tests."""
    _ip_counter[0] += 1
    return TestClient(server.app, headers={"x-forwarded-for": f"10.0.0.{_ip_counter[0]}"})


def test_humanize_rejects_oversized_text(calls):
    c = client_for_new_ip()
    r = c.post("/api/humanize", json={"text": "x" * (server._LONG + 1)})
    assert r.status_code == 422
    assert calls == []


def test_article_rejects_too_many_blocks(calls):
    c = client_for_new_ip()
    blocks = [{"id": f"b{i}", "type": "paragraph"} for i in range(server.MAX_ARTICLE_BLOCKS + 1)]
    r = c.post("/api/generate/article", json={"brief": BRIEF, "blocks": blocks})
    assert r.status_code == 400
    assert "Too many blocks" in r.json()["detail"]
    assert calls == []


def test_article_rejects_malformed_block_instead_of_crashing(calls):
    c = client_for_new_ip()
    r = c.post("/api/generate/article", json={"brief": BRIEF, "blocks": [{"id": "b1"}]})
    assert r.status_code == 422


def test_article_happy_path(calls):
    c = client_for_new_ip()
    r = c.post("/api/generate/article", json={"brief": BRIEF, "blocks": [{"id": "b1", "type": "paragraph"}]})
    assert r.status_code == 200
    assert r.json() == {"results": {"b1": "Hello."}}


def test_every_post_route_is_rate_limited(calls):
    # /api/humanize used to fall outside the limited path prefixes.
    c = client_for_new_ip()
    codes = [c.post("/api/humanize", json={"text": "hi"}).status_code
             for _ in range(server.RATE_LIMIT_EXPENSIVE_PER_MINUTE + 1)]
    assert codes[:-1] == [200] * server.RATE_LIMIT_EXPENSIVE_PER_MINUTE
    assert codes[-1] == 429


def test_spoofed_forwarded_for_does_not_change_client_ip(monkeypatch):
    monkeypatch.setattr(server, "TRUSTED_PROXY_HOPS", 1)
    req = type("R", (), {"headers": {"x-forwarded-for": "6.6.6.6, 1.2.3.4"}, "client": None})()
    assert server.RateLimitMiddleware._client_ip(req) == "1.2.3.4"


def test_zero_proxy_hops_ignores_header(monkeypatch):
    monkeypatch.setattr(server, "TRUSTED_PROXY_HOPS", 0)
    client = type("C", (), {"host": "9.9.9.9"})()
    req = type("R", (), {"headers": {"x-forwarded-for": "6.6.6.6"}, "client": client})()
    assert server.RateLimitMiddleware._client_ip(req) == "9.9.9.9"


def test_seo_prompt_uses_selected_niche(calls):
    c = client_for_new_ip()
    r = c.post("/api/generate/seo", json={"title": "Budgeting basics", "niche": "Finance"})
    assert r.status_code == 200
    system = calls[0][0]
    assert "Finance niche" in system
    assert "pet" not in system.lower()


def test_prompts_are_topic_neutral():
    # Writing voices and shared rules must follow the chosen niche, not assume pets.
    import re
    pet_words = re.compile(r"\b(pets?|animals?|vet|veterinar\w*|dogs?|cats?|owners?)\b", re.I)
    for style_id in server.STYLE_SYSTEM_PROMPTS:
        system = server.build_system_prompt(style_id, {"niche": "Finance", "topic": "Budgeting"})
        assert not pet_words.search(system), (style_id, pet_words.search(system).group(0))
    for text in server.BLOCK_INSTRUCTIONS.values():
        assert not pet_words.search(text)


def test_fit_trims_at_word_boundary_without_dangling_words():
    long_title = "How to Start a Simple Monthly Budget That Actually Works for Busy People"
    fitted = server._fit(long_title, server.SEO_TITLE_MAX)
    assert len(fitted) <= server.SEO_TITLE_MAX
    assert fitted == "How to Start a Simple Monthly Budget That Actually Works"
    assert server._fit('  "Already short"  ', 60) == "Already short"


def test_seo_route_enforces_lengths(monkeypatch):
    async def wordy_llm(system, user_text, max_tokens=2000):
        return json.dumps({
            "focusKeyword": "monthly budget",
            "seoTitle": "Monthly Budget Basics: " + "a really long title " * 5,
            "metaDescription": "A monthly budget guide " * 12,
        })

    monkeypatch.setattr(server, "llm_complete", wordy_llm)
    r = client_for_new_ip().post("/api/generate/seo", json={"title": "Budgeting"})
    body = r.json()
    assert len(body["seoTitle"]) <= server.SEO_TITLE_MAX
    assert len(body["metaDescription"]) <= server.META_DESCRIPTION_MAX
    assert not body["metaDescription"].endswith(" ")

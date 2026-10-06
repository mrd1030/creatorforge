"""End-to-end tests against a running CreatorForge backend.

These call the real Claude API (and Resend, for the email checks), so they cost money and
are skipped unless you opt in by pointing them at a server:

    CREATORFORGE_LIVE_URL=http://localhost:8000 python -m pytest tests/test_live_api.py

The backend allows 20 AI requests per minute per IP, so run them against a fresh server or
expect some 429s near the end.
"""
import json
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("CREATORFORGE_LIVE_URL", "").rstrip("/")
TIMEOUT = 180

pytestmark = pytest.mark.skipif(
    not BASE_URL, reason="set CREATORFORGE_LIVE_URL to run live end-to-end tests (they call the real API)"
)

BRIEF = {
    "topic": "Starting a simple monthly budget",
    "audience": "First-time budgeters",
    "length": "medium",
    "keyPoints": "track spending, set limits, review weekly",
    "angle": "Practical and reassuring, no jargon",
    "extra": "Keep it warm and honest",
    "focusKeyword": "simple monthly budget",
    "categories": ["Personal Finance"],
    "tags": ["budgeting", "money-basics"],
    "niche": "Finance",
}

BRIEF_WITH_FACTS = {
    **BRIEF,
    "factsToUse": "- The 50/30/20 rule splits take-home pay into needs, wants, and savings (Source: example.com)",
}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def post(s, path, body, timeout=TIMEOUT):
    return s.post(f"{BASE_URL}/api{path}", json=body, timeout=timeout)


# ---- health ----
def test_root(s):
    r = s.get(f"{BASE_URL}/api/", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["app"] == "CreatorForge"
    assert "claude" in j["model"].lower()


# ---- blocks and articles ----
def test_generate_block_title(s):
    r = post(s, "/generate/block", {"styleId": "real-person", "brief": BRIEF, "blockType": "title", "targetLength": "short"})
    assert r.status_code == 200, r.text
    assert r.json()["text"].strip()


def test_generate_block_with_style_instructions_and_facts(s):
    r = post(s, "/generate/block", {
        "styleId": "real-person", "brief": BRIEF_WITH_FACTS, "blockType": "paragraph",
        "blockNote": "Why a budget helps", "targetLength": "short",
        "styleInstructions": "Write like a calm friend who is good with money. Plain warm prose.",
    })
    assert r.status_code == 200, r.text
    assert len(r.json()["text"]) > 30


def test_generate_article(s):
    r = post(s, "/generate/article", {
        "styleId": "real-person", "brief": BRIEF,
        "blocks": [
            {"id": "b1", "type": "title", "note": ""},
            {"id": "b2", "type": "paragraph", "note": "Intro"},
            {"id": "b3", "type": "tips", "note": "First-week tips"},
        ],
    })
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    for bid in ("b1", "b2", "b3"):
        assert isinstance(results.get(bid), str) and results[bid].strip(), f"missing {bid}"


def test_generate_article_empty_blocks(s):
    r = post(s, "/generate/article", {"styleId": "real-person", "brief": BRIEF, "blocks": []}, timeout=30)
    assert r.status_code == 400


# ---- streaming ----
def test_stream_sends_deltas_then_done():
    url = f"{BASE_URL}/api/generate/block/stream"
    payload = {"styleId": "real-person", "brief": BRIEF, "blockType": "title"}
    with requests.post(url, json=payload, stream=True, timeout=TIMEOUT) as r:
        assert r.status_code == 200, r.text[:300]
        assert "text/event-stream" in r.headers.get("content-type", "")
        deltas, done, error, start = [], False, None, time.time()
        for raw in r.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data:"):
                continue
            obj = json.loads(raw[len("data:"):].strip())
            if "delta" in obj:
                deltas.append(obj["delta"])
            if "error" in obj:
                error = obj["error"]
            if obj.get("done") is True or time.time() - start > TIMEOUT:
                done = obj.get("done") is True
                break
    assert error is None, f"stream returned error: {error}"
    assert done, "no final {done: true} event"
    assert len("".join(deltas).strip()) > 5


def test_stream_rejects_missing_brief():
    r = requests.post(f"{BASE_URL}/api/generate/block/stream",
                      json={"styleId": "real-person", "blockType": "title"}, timeout=30)
    assert r.status_code == 422


# ---- humanize ----
def test_humanize(s):
    r = post(s, "/humanize", {
        "text": "In today's fast-paced world, it's important to note that budgeting is paramount.",
        "styleId": "real-person",
        "styleInstructions": "Sound like a friendly everyday person. Short clear sentences.",
    })
    assert r.status_code == 200, r.text
    text = r.json()["text"]
    assert text and "in today's fast-paced world" not in text.lower()


# ---- SEO ----
def test_generate_seo_respects_length_limits(s):
    r = post(s, "/generate/seo", {
        "title": "Starting a Simple Monthly Budget", "topic": BRIEF["topic"],
        "content": "A budget is a plan for your money. " * 20, "focusKeyword": "", "niche": "Finance",
    })
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["focusKeyword"]
    assert 0 < len(j["seoTitle"]) <= 60
    assert 0 < len(j["metaDescription"]) <= 160


def test_generate_meta(s):
    r = post(s, "/generate/meta", {
        "title": "Starting a Simple Monthly Budget", "content": "A short guide to budgeting. " * 20,
        "focusKeyword": "simple monthly budget", "niche": "Finance",
    })
    assert r.status_code == 200, r.text
    assert 0 < len(r.json()["text"]) <= 160


def test_generate_image_prompt(s):
    r = post(s, "/generate/image-prompt", {
        "topic": "A tidy desk with a notebook budget", "angle": "calm Sunday planning",
        "styleId": "real-person", "blockNote": "header image", "niche": "Finance",
    })
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["prompt"] and "alt" in j


# ---- brief, layout, newsletter, social, YouTube ----
def test_layout_suggest(s):
    r = post(s, "/layout/suggest", {"brief": BRIEF, "styleId": "real-person"})
    assert r.status_code == 200, r.text
    blocks = r.json()["blocks"]
    assert isinstance(blocks, list) and len(blocks) >= 3
    assert all("type" in b for b in blocks)


def test_newsletter_preview(s):
    r = post(s, "/generate/newsletter-preview", {
        "title": "Starting a Simple Monthly Budget",
        "metaDescription": "A calm, practical guide to your first monthly budget.",
        "keyPoints": BRIEF["keyPoints"], "headerImagePrompt": "notebook and coffee", "styleId": "newsletter",
    })
    assert r.status_code == 200, r.text
    for k in ("title", "summary", "ctaText", "imagePrompt", "imageAlt"):
        assert k in r.json(), f"missing {k}"


def test_generate_social(s):
    r = post(s, "/generate/social", {
        "title": "Starting a Simple Monthly Budget", "metaDescription": "A calm guide.",
        "content": "Here is an article about starting a budget. " * 20, "styleId": "real-person",
    })
    assert r.status_code == 200, r.text
    for k in ("x", "instagram", "facebook"):
        assert k in r.json(), f"missing {k}"


def test_generate_youtube(s):
    r = post(s, "/generate/youtube", {
        "title": "Starting a Simple Monthly Budget", "content": "Budgets give money a job. " * 30,
        "styleId": "storyteller",
    })
    assert r.status_code == 200, r.text
    assert len(r.json()["text"]) > 50


# ---- email (validation always; sending only if Resend is configured on the server) ----
def test_email_rejects_invalid_address():
    r = requests.post(f"{BASE_URL}/api/send-email", json={
        "recipient_email": "not-an-email", "subject": "x", "html_content": "<p>x</p>",
    }, timeout=30)
    assert r.status_code == 422


def test_email_rejects_missing_fields():
    r = requests.post(f"{BASE_URL}/api/send-email", json={"recipient_email": "ok@example.com"}, timeout=30)
    assert r.status_code == 422


def test_email_send_fails_gracefully():
    """example.com can't receive mail, so this either sends (200), reports email isn't
    configured (400), or wraps Resend's error in a readable 500. It must never crash."""
    r = requests.post(f"{BASE_URL}/api/send-email", json={
        "recipient_email": "test_recipient@example.com", "subject": "CreatorForge test", "html_content": "<p>Test</p>",
    }, timeout=60)
    assert r.status_code in (200, 400, 500), r.text[:300]
    if r.status_code != 200:
        assert r.json().get("detail"), "error response should explain what went wrong"

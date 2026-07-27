"""Tests for new SEO endpoint and added optional params (styleInstructions, factsToUse).
Iteration 2 additions for CreatorForge."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
TIMEOUT = 120

BRIEF_WITH_FACTS = {
    "topic": "Bearded dragon UVB lighting",
    "audience": "New reptile keepers",
    "length": "medium",
    "keyPoints": "UVB hours, basking temp, calcium dusting",
    "angle": "My first beardie Spike taught me a lot",
    "extra": "Keep practical and gentle",
    "focusKeyword": "bearded dragon uvb",
    "factsToUse": "- Bearded dragons need UVB 10-12 hours per day\n- Basking temp 95-110F\n- Calcium dusting 3x per week per my vet",
    "categories": ["reptiles"],
    "tags": ["bearded-dragon"],
}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---- NEW /generate/seo endpoint ----
def test_generate_seo_returns_both_fields(s):
    body = {
        "title": "First Week with a Bearded Dragon",
        "topic": "Bearded dragon UVB lighting",
        "content": "Bearded dragons need consistent UVB to synthesize vitamin D3. " * 20,
        "focusKeyword": "",
    }
    r = s.post(f"{BASE_URL}/api/generate/seo", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "focusKeyword" in j and "metaDescription" in j
    assert isinstance(j["focusKeyword"], str) and len(j["focusKeyword"]) > 0
    assert isinstance(j["metaDescription"], str) and len(j["metaDescription"]) > 0


def test_generate_seo_with_existing_keyword(s):
    body = {
        "title": "Senior Labrador Care",
        "topic": "Senior Labrador Care",
        "content": "Caring for an older lab. " * 30,
        "focusKeyword": "senior labrador care",
    }
    r = s.post(f"{BASE_URL}/api/generate/seo", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["focusKeyword"]) > 0
    assert len(j["metaDescription"]) > 0


# ---- generate/block with styleInstructions + factsToUse ----
def test_generate_block_with_style_instructions_and_facts(s):
    body = {
        "styleId": "real-person",
        "brief": BRIEF_WITH_FACTS,
        "blockType": "paragraph",
        "blockNote": "Why UVB matters",
        "targetLength": "short",
        "styleInstructions": "Write like a careful first-time reptile keeper sharing lived experience. Plain warm prose.",
    }
    r = s.post(f"{BASE_URL}/api/generate/block", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j.get("text"), str) and len(j["text"]) > 30


# ---- generate/article with styleInstructions + factsToUse ----
def test_generate_article_with_style_and_facts(s):
    body = {
        "styleId": "real-person",
        "brief": BRIEF_WITH_FACTS,
        "styleInstructions": "Use warm conversational voice. Honor the verified facts exactly.",
        "blocks": [
            {"id": "a1", "type": "title", "note": ""},
            {"id": "a2", "type": "paragraph", "note": "Intro about UVB importance"},
        ],
    }
    r = s.post(f"{BASE_URL}/api/generate/article", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "results" in j
    assert "a1" in j["results"] and "a2" in j["results"]
    assert len(j["results"]["a1"]) > 0
    assert len(j["results"]["a2"]) > 0


# ---- humanize with styleInstructions ----
def test_humanize_with_style_instructions(s):
    body = {
        "text": "In today's fast-paced world, it's important to note that proper UVB lighting is paramount.",
        "styleId": "real-person",
        "styleInstructions": "Sound like a warm everyday reptile owner. Short clear sentences.",
    }
    r = s.post(f"{BASE_URL}/api/humanize", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["text"]) > 0
    assert "in today's fast-paced world" not in j["text"].lower()


# ---- ensure factsToUse is accepted on brief without errors ----
def test_brief_facts_to_use_accepted(s):
    body = {
        "styleId": "real-person",
        "brief": BRIEF_WITH_FACTS,
        "blockType": "key-facts",
        "targetLength": "short",
    }
    r = s.post(f"{BASE_URL}/api/generate/block", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j.get("text"), str) and len(j["text"]) > 0

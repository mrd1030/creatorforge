"""CreatorForge backend API tests against deployed REACT_APP_BACKEND_URL."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")
TIMEOUT = 120

BRIEF = {
    "topic": "Caring for senior Labrador retrievers",
    "audience": "First-time senior dog owners",
    "length": "medium",
    "keyPoints": "joint care, diet, vet visits, comfort",
    "angle": "Personal experience with my old Lab Max",
    "extra": "Keep warm and honest",
    "focusKeyword": "senior labrador care",
    "categories": ["dogs", "senior care"],
    "tags": ["labrador", "senior"]
}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---- health ----
def test_root(s):
    r = s.get(f"{BASE_URL}/api/", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["app"] == "CreatorForge"
    assert "claude" in j["model"].lower()


# ---- block generation ----
def test_generate_block_title(s):
    body = {"styleId": "real-person", "brief": BRIEF, "blockType": "title", "targetLength": "short"}
    r = s.post(f"{BASE_URL}/api/generate/block", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "text" in j and isinstance(j["text"], str) and len(j["text"]) > 0


# ---- article generation (multiple blocks) ----
def test_generate_article(s):
    body = {
        "styleId": "real-person",
        "brief": BRIEF,
        "blocks": [
            {"id": "b1", "type": "title", "note": ""},
            {"id": "b2", "type": "paragraph", "note": "Intro about senior dogs"},
            {"id": "b3", "type": "tips", "note": "Daily routine tips"},
        ],
    }
    r = s.post(f"{BASE_URL}/api/generate/article", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "results" in j and isinstance(j["results"], dict)
    for bid in ("b1", "b2", "b3"):
        assert bid in j["results"], f"missing {bid} in results"
        assert isinstance(j["results"][bid], str) and len(j["results"][bid]) > 0


# ---- humanize ----
def test_humanize(s):
    body = {"text": "In today's fast-paced world, it's important to note that caring for your dog is paramount.", "styleId": "real-person"}
    r = s.post(f"{BASE_URL}/api/humanize", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "text" in j and len(j["text"]) > 0
    # should not contain AI tells
    assert "in today's fast-paced world" not in j["text"].lower()


# ---- meta ----
def test_generate_meta(s):
    body = {"title": "Senior Labrador Care Guide", "content": "A short guide about caring for an older lab. " * 20, "focusKeyword": "senior labrador care"}
    r = s.post(f"{BASE_URL}/api/generate/meta", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "text" in j and isinstance(j["text"], str) and len(j["text"]) > 0


# ---- image prompt ----
def test_generate_image_prompt(s):
    body = {"topic": "Senior labrador in afternoon sun", "angle": "warm porch moment", "styleId": "real-person", "blockNote": "header image"}
    r = s.post(f"{BASE_URL}/api/generate/image-prompt", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "prompt" in j and "alt" in j
    assert len(j["prompt"]) > 0


# ---- newsletter preview ----
def test_newsletter_preview(s):
    body = {
        "title": "Caring for Senior Labs",
        "metaDescription": "A warm guide to senior labrador care from someone who's lived it.",
        "keyPoints": "joints, diet, vet, comfort",
        "headerImagePrompt": "older lab on porch",
        "styleId": "newsletter"
    }
    r = s.post(f"{BASE_URL}/api/generate/newsletter-preview", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("title", "summary", "ctaText", "imagePrompt", "imageAlt"):
        assert k in j, f"missing key {k}"


# ---- social ----
def test_generate_social(s):
    body = {
        "title": "Caring for Senior Labs",
        "metaDescription": "Warm guide.",
        "content": "Here is an article about caring for senior labradors. " * 20,
        "styleId": "real-person"
    }
    r = s.post(f"{BASE_URL}/api/generate/social", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("x", "instagram", "facebook"):
        assert k in j, f"missing key {k}"


# ---- youtube ----
def test_generate_youtube(s):
    body = {
        "title": "Caring for Senior Labs",
        "content": "Senior labradors need extra love. " * 30,
        "styleId": "storyteller"
    }
    r = s.post(f"{BASE_URL}/api/generate/youtube", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "text" in j and len(j["text"]) > 50


# ---- layout suggest ----
def test_layout_suggest(s):
    body = {"brief": BRIEF, "styleId": "real-person"}
    r = s.post(f"{BASE_URL}/api/layout/suggest", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "blocks" in j and isinstance(j["blocks"], list) and len(j["blocks"]) >= 3
    for b in j["blocks"]:
        assert "type" in b


# ---- error: no blocks ----
def test_generate_article_empty_blocks(s):
    body = {"styleId": "real-person", "brief": BRIEF, "blocks": []}
    r = s.post(f"{BASE_URL}/api/generate/article", json=body, timeout=30)
    assert r.status_code == 400

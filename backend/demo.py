"""Public demo restrictions. Lives only on the `demo` branch; the template on `main` never ships it.

The hosted demo runs on the owner's API key, so every visitor gets a small daily allowance per
feature, a few features are switched off, and the whole site has a daily ceiling. Limits are
enforced here, on the server, because the backend URL is public and anyone can call it directly.

Enabled by DEMO_MODE=true (see server.py). Settings:
  DEMO_BUY_URL            where the "Buy the template" links point
  DEMO_SITE_DAILY_LIMIT   credits per UTC day across all visitors (default 1000)
  DEMO_MAX_ARTICLE_BLOCKS most blocks one "Generate all" may write (default 8)
"""
import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import Callable, Dict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

BUY_URL = os.environ.get("DEMO_BUY_URL", "")
SITE_DAILY_LIMIT = int(os.environ.get("DEMO_SITE_DAILY_LIMIT", "1000"))
MAX_ARTICLE_BLOCKS = int(os.environ.get("DEMO_MAX_ARTICLE_BLOCKS", "8"))
_MAX_TRACKED_IPS = 50_000

# Per-visitor daily allowance for each feature: (label shown to the visitor, uses per day).
FEATURES: Dict[str, tuple] = {
    "generate_all": ("article generation", 1),
    "regenerate": ("block regenerations", 3),
    "polish": ("block polishes", 2),
    "brief": ("brief generations", 2),
    "facts": ("fact searches", 1),
    "layout": ("layout suggestions", 1),
    "seo": ("SEO suggestions", 1),
    "meta": ("meta descriptions", 1),
    "image_prompt": ("image prompts", 1),
    "social": ("social post sets", 1),
    "youtube": ("YouTube scripts", 1),
    "newsletter_preview": ("newsletter previews", 1),
}

ROUTES = {
    "/api/generate/article": "generate_all",
    "/api/generate/block/stream": "regenerate",
    "/api/generate/block": "regenerate",
    "/api/humanize": "polish",
    "/api/generate/brief": "brief",
    "/api/generate/facts": "facts",
    "/api/layout/suggest": "layout",
    "/api/generate/seo": "seo",
    "/api/generate/meta": "meta",
    "/api/generate/image-prompt": "image_prompt",
    "/api/generate/social": "social",
    "/api/generate/youtube": "youtube",
    "/api/generate/newsletter-preview": "newsletter_preview",
}

# Site-wide cost of one call. A full article writes up to MAX_ARTICLE_BLOCKS blocks in one call.
_SITE_COST = {"generate_all": MAX_ARTICLE_BLOCKS}

DISABLED = {
    "/api/process/article": "Importing an existing article isn't available in the demo.",
    "/api/send-email": "Sending email isn't available in the demo.",
}

# Shown in the UI with an explanation and a buy link instead of running.
LOCKED_UI = ["stream_all", "polish_all"]
HIDDEN_UI = ["import", "email"]


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _with_buy_link(message: str) -> str:
    return f"{message} Get the full template: {BUY_URL}" if BUY_URL else message


class DemoMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, client_ip: Callable[[Request], str]):
        super().__init__(app)
        self._client_ip = client_ip
        self._day = _today()
        self._used: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._site_used = 0

    def _roll_day(self):
        today = _today()
        if today != self._day or len(self._used) > _MAX_TRACKED_IPS:
            if today != self._day:
                self._site_used = 0
            self._day = today
            self._used.clear()

    def _status(self, ip: str) -> dict:
        used = self._used.get(ip, {})
        return {
            "demo": True,
            "buyUrl": BUY_URL,
            "features": {
                key: {"label": label, "limit": limit, "remaining": max(limit - used.get(key, 0), 0)}
                for key, (label, limit) in FEATURES.items()
            },
            "maxArticleBlocks": MAX_ARTICLE_BLOCKS,
            "locked": LOCKED_UI,
            "hidden": HIDDEN_UI,
        }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        self._roll_day()
        ip = self._client_ip(request)

        if path == "/api/demo":
            return JSONResponse(self._status(ip))
        if request.method != "POST":
            return await call_next(request)
        if path in DISABLED:
            return JSONResponse({"detail": _with_buy_link(DISABLED[path])}, status_code=403)

        feature = ROUTES.get(path)
        if feature is None:
            # Default deny: a new paid route stays off in the demo until it's given an allowance.
            return JSONResponse({"detail": "This feature isn't available in the demo."}, status_code=403)

        label, limit = FEATURES[feature]
        used = self._used[ip]
        if used[feature] >= limit:
            return JSONResponse(
                {"detail": _with_buy_link(f"You've used today's demo {label} ({limit}).")},
                status_code=429,
            )
        cost = _SITE_COST.get(feature, 1)
        if self._site_used + cost > SITE_DAILY_LIMIT:
            return JSONResponse(
                {"detail": _with_buy_link("The demo has reached its daily limit. Please try again tomorrow.")},
                status_code=429,
            )

        # Charge before the call so parallel requests can't overspend, then refund if it failed.
        used[feature] += 1
        self._site_used += cost
        response = await call_next(request)
        if response.status_code >= 400:
            used[feature] = max(used[feature] - 1, 0)
            self._site_used = max(self._site_used - cost, 0)
        return response

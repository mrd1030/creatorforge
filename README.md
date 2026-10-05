# CreatorForge

CreatorForge is an AI-assisted content studio for writers. You build an article or newsletter
block by block (intro, tips, key facts, references, CTA, etc.), pick a writing style, and the app
generates each block with Claude, optionally grounded in facts you've pasted in or pulled from a
live web search. Finished pieces can be exported as HTML, Markdown, MDX or JSON (ready for any
blog or CMS) and previewed as a newsletter.

## Architecture

Two independent services:

| Service | Stack | Location |
|---|---|---|
| **Frontend** | Vite + React + TypeScript | `frontend/` |
| **Backend** | FastAPI (Python) | `backend/` |

The frontend is a single-page app that talks to the backend over HTTP (see `VITE_BACKEND_URL`
below). The backend wraps the Anthropic (Claude) API for all content generation, Tavily for
sourced-fact web search, and Resend for sending newsletter emails. There is no database — see
[Known limitations](#known-limitations).

Since this is a bring-your-own-key tool, every generation/email call spends *your* API budget.
The backend has a basic per-IP rate limiter on every `POST` under `/api/` (each one spends AI,
search, or email budget) and caps the size of every text field it sends to Claude (in-memory, no
extra infra) to blunt casual abuse if the URL leaks — tune the `RATE_LIMIT_*` constants and the
input caps near the top of `backend/server.py` to taste. It resets on restart and
won't hold up under multiple backend instances behind a load balancer; treat it as a basic
deterrent, not a substitute for real auth if you need stronger guarantees.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key used for all article/newsletter generation. |
| `TAVILY_API_KEY` | For fact search | Powers "Search for facts" in the brief builder. Without it, that feature is disabled but everything else still works. |
| `RESEND_API_KEY` | For sending email | Needed to send newsletter test/preview emails. |
| `SENDER_EMAIL` | For sending email | The "from" address used when sending via Resend. |
| `CLAUDE_MODEL` | No | Overrides the Claude model used (defaults to `claude-sonnet-5-5`). |
| `TRUSTED_PROXY_HOPS` | No | Trusted reverse proxies in front of the API (default 1, which fits Render). Used to read the real client IP safely for rate limiting. Set `0` if nothing sits in front of the app. |
| `MAX_ARTICLE_BLOCKS` | No | Most blocks a single "Generate article" call accepts (default 40). Bounds the cost of one call. |
| `CORS_ORIGINS` | No | Comma-separated allowed origins for the API (defaults to `*`). Set this to your frontend's URL in production. |

The frontend reads these from `frontend/.env`:

| Variable | Required | What it does |
|---|---|---|
| `VITE_BACKEND_URL` | Yes | Base URL of the running backend, e.g. `http://localhost:8000` locally. |

## Running locally

Requires Node 20+ and Python 3.10+.

**Backend:**

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then fill in your keys
python -m uvicorn server:app --reload --port 8000
```

**Frontend** (in a second terminal):

```bash
cd frontend
npm install
npm start
```

The frontend dev server runs on `http://localhost:3000` and expects the backend at whatever
`VITE_BACKEND_URL` points to (`http://localhost:8000` by default).

## Known limitations

- **localStorage-only persistence.** Drafts, styles, and settings are stored in the browser's
  localStorage, not a database. There's no multi-device sync or account system — work done on
  one browser/device isn't visible on another.
- **Header images are paste-URL only.** You paste an image URL rather than uploading a file;
  there's no image upload/hosting pipeline yet.
- **Chart blocks aren't grounded in Facts to Use.** Unlike Key Facts and References, the Chart
  block's prompt explicitly allows sample/illustrative numbers — it's there to visualize a
  comparison you describe, not to report a sourced statistic. Don't assume chart data is factual
  without checking it yourself.
- **Claude/Anthropic is the only supported AI provider.** Every generation call goes through the
  Anthropic SDK directly in `backend/server.py`. Swapping to OpenAI, Gemini, or another provider
  means editing those calls yourself — it's not an environment-variable swap.

## Deployment

Both of these are genuinely supported and configured in this repo:

- **Frontend → Vercel**, via [`vercel.json`](vercel.json). Builds `frontend/` and serves it as a
  static SPA (with an `index.html` rewrite for client-side routing).
- **Backend → Render**, via [`render.yaml`](render.yaml). Runs the FastAPI app with `uvicorn`.
  Set the env vars from the table above as secrets in the Render dashboard (`render.yaml`
  declares them with `sync: false`, so Render will prompt for values rather than reading them
  from the repo).

When deploying both, point the frontend's `VITE_BACKEND_URL` at the deployed Render URL, and set
the backend's `CORS_ORIGINS` to the deployed Vercel URL.

Neither platform is a hard requirement, though — the backend is a standard FastAPI app and the
frontend is a standard static Vite build, so both deploy anywhere that runs Python 3.10+ or serves
static files (a VPS, Railway, Fly.io, Netlify, etc.). One caveat if you're considering Cloudflare:
Cloudflare Pages works fine as a Vercel swap for the frontend, but Cloudflare Workers doesn't run a
conventional FastAPI app without a real rewrite — keep the backend on a standard Python host if you
go that route.

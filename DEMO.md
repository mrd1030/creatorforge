# Public demo branch

This `demo` branch is the hosted showroom for the CreatorForge template. It is `main` plus a few
demo-only files. Buyers get `main`, so none of this ships with the template.

## What the demo changes

- **Daily allowance per visitor** (per IP, resets at midnight UTC), enforced by the backend in
  `backend/demo.py`: 1 article generation (up to 8 blocks), 3 block regenerations, 2 block
  polishes, 2 brief generations, and 1 each of fact search, layout suggestion, SEO, meta
  description, image prompt, social posts, YouTube script, and newsletter preview.
- **Site-wide ceiling** of 1,000 credits per day across all visitors (an article generation costs
  8, everything else 1).
- **Locked** (shown with an explanation and a buy link): Generate (live stream) and Polish Entire
  Article. Per-block Regenerate still streams.
- **Hidden, and refused by the server**: Import Existing Article and Send test email. Any new POST
  route is refused until it gets an allowance in `backend/demo.py`.
- **Sample article** seeded on a visitor's first visit (`frontend/src/lib/sampleDraft.ts`), so
  Finalize, the chart, every export, and the newsletter preview work without any API calls.
- **Banner** with what's left today and a "Get the full template" button.
- Failed calls are refunded, so an error never uses up a visitor's allowance.

## Deploying

Point the demo's Render service and Vercel project at the `demo` branch. On Render, set:

| Variable | Value |
|---|---|
| `DEMO_MODE` | `true` |
| `DEMO_BUY_URL` | Your store page for the template |
| `DEMO_SITE_DAILY_LIMIT` | Optional, default `1000` |
| `DEMO_MAX_ARTICLE_BLOCKS` | Optional, default `8` |
| `TRUSTED_PROXY_HOPS` | `1` on Render |

Also set a monthly spend limit on the demo's API key in the Anthropic Console. The limits above
live in memory and reset on every deploy or restart, so the Console limit is the hard backstop.

## Keeping it up to date

Merge `main` into `demo` before each demo deploy:

```bash
git checkout demo && git merge main && git push
```

Demo-only code lives in new files (`backend/demo.py`, `backend/tests/test_demo.py`,
`frontend/src/lib/demo.ts`, `frontend/src/lib/sampleDraft.ts`,
`frontend/src/components/DemoBanner.tsx`, and this file) plus a few small hooks in existing
files, so merges should rarely conflict.

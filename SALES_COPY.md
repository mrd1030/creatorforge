# CreatorForge — Sales Copy

Draft marketing copy for the Gumroad / Lemon Squeezy listing. Trim or mix-and-match
sections to fit whichever platform's field limits.

---

## Listing title (≤ 70 chars)

CreatorForge — AI Content Studio Template (React + FastAPI, Full Source)

## Short description / summary (≤ 200 chars)

A full-stack, block-based AI article & newsletter builder you own outright. Bring
your own Claude API key. React + TypeScript frontend, FastAPI backend. Deploy-ready
for Vercel + Render.

---

## Elevator pitch

CreatorForge is a self-hosted content studio you own outright — not a rented,
black-box "type a prompt, get an article" tool. You write block by block: pick a
niche and a real-person writing voice, lay out your sections with drag-and-drop,
then generate or hand-write each one — key facts, a comparison table, a chart,
pros & cons, a call to action — grounded in facts you provide or pull from a live
web search. Export clean, ready for your blog, newsletter, or socials.

Full source code. Your own API keys. No subscription, no vendor lock-in.

---

## Features

- **Block-based composer.** 16 block types — intro, tips, key facts, data table,
  chart, pros & cons, CTA, references, affiliate disclosure, and more — arranged
  with a drag-and-drop layout builder, or auto-suggested for you.
- **Six real-person writing voices** — Real Person, Experienced Caregiver, Direct
  & No-BS Practical, Storyteller with Heart, Professional Educator, Newsletter/
  Email Style — plus a dedicated Short Story mode, across 8 built-in niches (Pet
  Care, Health & Wellness, Food & Recipes, Travel, Technology, Finance,
  Lifestyle, Short Stories).
- **Define your own writing styles.** Not limited to the built-in six — write a
  custom voice with its own tagline, vibe, and system-prompt instructions, and it
  shows up right alongside the defaults in the Style Library.
- **Fact-grounded generation.** Paste in your own sources or pull live results via
  web search — Key Facts and References blocks are required to cite real,
  sourced material, not invented statistics.
- **Polish pass.** A one-click cleanup pass — per block or across the whole
  draft — that strips AI-cliché phrasing ("delve," "tapestry," "it's important to
  note"...) without adding new claims. A real prose pass, not a detector-evasion
  trick.
- **Import Existing Article.** Paste in something you already wrote and
  CreatorForge parses it back into editable blocks, carrying forward its real
  sources into Facts to Use.
- **Export to 9 formats, one click.** HTML, Markdown, MDX, Structured JSON,
  YouTube Script, Social Snippets, Email Newsletter (HTML or Markdown) — even the
  full LLM prompt that generated the piece, for full transparency. Whatever your
  CMS or workflow expects, it's already there.
- **Newsletter Builder.** Pull any draft in as a featured article, write an intro
  and outro, and get a beehiiv/Substack-ready HTML email with a live preview —
  send yourself a test before it goes out.
- **Responsive preview.** Check the Desktop and Mobile phone rendering of a
  finished piece side by side before you publish anywhere.
- **Optional direct push to a Sanity content lake**, if you run one.
- **Built-in rate limiting.** A basic per-IP limiter on generation/email endpoints
  to blunt casual abuse if a deployed link leaks.
- **Bring your own API keys.** Anthropic (Claude) for generation, optional Tavily
  for fact search, optional Resend for newsletter email. You control your own AI
  spend — there's no markup, no subscription to us.
- **Full source, deploy anywhere.** React + TypeScript frontend, FastAPI +
  Python backend. Vercel and Render configs included and tested. Light and dark
  mode throughout.
- **Free updates, included.** Bug fixes and new features — a theme/color
  customizer is planned — ship free to everyone who's already bought in. No
  repurchase, no upgrade fee, for as long as updates are offered.

---

## Who it's for

Solo creators, niche bloggers, newsletter writers, and small agencies who want an
AI writing tool they actually own — fully customizable, not locked to a monthly
subscription or someone else's API bill — and that produces content grounded in
real facts and written in an actual voice, not templated AI output.

---

## What's included

- Full source code — frontend and backend
- Deployment configs for Vercel (frontend) and Render (backend)
- Setup documentation covering environment variables, local development, and
  deployment
- A commercial license covering one (1) deployed end product (see LICENSE.md)

## Requirements

- Your own Anthropic (Claude) API key — **required**
- Optional: Tavily API key (live fact search), Resend API key (newsletter email),
  a Sanity project (CMS push)
- Node 20+ and Python 3.10+ for local development

---

## Known limitations *(worth stating plainly — it reads as trustworthy, not weak)*

- **No built-in database.** Drafts and settings live in the browser's
  localStorage — no account system or multi-device sync out of the box.
- **Header images are paste-URL only.** No upload/hosting pipeline yet.
- **Chart blocks use illustrative sample data**, not sourced statistics — unlike
  Key Facts and References, they're for visualizing a comparison you describe,
  not reporting a grounded number.
- **Rate limiting is in-memory** — resets on restart and doesn't hold up across
  multiple backend instances. A basic deterrent, not a substitute for real auth.

---

## License summary (short version for the listing)

One-time purchase. One licensed end product per purchase. Free updates included
for as long as they're offered. No resale, redistribution, or use of the source
to build a competing template. Full terms in `LICENSE.md`.

---

## Screenshot lineup for the listing

Real captures live in `listing-screenshots/` (repo root, not part of the sold
product — for the marketplace listing only). 21 clean shots, no dev/browser
chrome artifacts. Suggested order for a gallery, strongest first:

1. `02-dashboard-light-with-draft.png` — hero shot, the tagline + a real draft
2. `21-dashboard-dark-with-draft.png` — proves light/dark out of the gate
3. `18-style-library.png` — the six-voice cards sell themselves
4. `04-layout-builder.png` — drag-and-drop block palette
5. `05-edit-and-preview.png` — Generate / Regenerate / Polish controls, filled
6. `06-finalize-light-top.png` — the published-looking output
7. `08-finalize-dark-chart.png` — table + chart rendering, dark mode (the
   single strongest image in the set — leads with this if only using one)
8. `13-mobile-preview-chart.png` — responsive check, phone frame
9. `20-newsletter-builder.png` — beehiiv/Substack export, a feature most
   competitors don't have
10. `14-code-export-html.png` — the 9-format export list

Everything else in the folder (niche dropdown, settings, custom-style modal,
remaining mobile/finalize passes, markdown export) is there as backup/detail
shots if a platform supports more than 10 images.

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
import os
import logging
import json
import re
import time
import asyncio
import resend
from collections import defaultdict, deque
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

import anthropic as anthropic_sdk
from tavily import TavilyClient

ROOT_DIR = Path(__file__).parent
_env_path = ROOT_DIR.parent / '.env'
load_dotenv(ROOT_DIR / '.env', override=True)
load_dotenv(_env_path, override=True)
print(f"[env] Loading from: {_env_path} (exists={_env_path.exists()})")

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', '')
CLAUDE_MODEL = os.environ.get('CLAUDE_MODEL', 'claude-sonnet-4-6')
TAVILY_API_KEY = os.environ.get('TAVILY_API_KEY', '')

app = FastAPI(title="CreatorForge API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============ RATE LIMITING ============
# This is a bring-your-own-key tool: every /api/generate/*, /api/process/*, and
# /api/send-email call spends the deployer's own Anthropic/Tavily/Resend budget.
# With the API wide open, anyone who finds the URL could script requests against it
# and run up a real bill with zero friction. This is a minimal, dependency-free
# per-IP limiter — good enough to blunt casual/scripted abuse without requiring a
# full accounts system. Tune the numbers below to taste.
RATE_LIMIT_GENERAL_PER_MINUTE = 60      # all /api/ traffic, per IP
RATE_LIMIT_EXPENSIVE_PER_MINUTE = 20    # LLM/email-triggering routes specifically, per IP
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_TRACKED_KEYS = 50_000   # safety cap so a flood of distinct IPs can't grow this unbounded

_EXPENSIVE_PATH_PREFIXES = ("/api/generate/", "/api/process/", "/api/send-email")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory, per-IP sliding-window rate limiter. No external dependencies or
    shared cache — fine for the single-process deployment render.yaml provisions.
    If you scale to multiple backend instances behind a load balancer, this state
    needs to move somewhere shared (e.g. Redis) to stay effective."""

    def __init__(self, app):
        super().__init__(app)
        self._hits: Dict[str, deque] = defaultdict(deque)

    @staticmethod
    def _client_ip(request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _allow(self, key: str, limit: int) -> bool:
        if len(self._hits) > _RATE_LIMIT_MAX_TRACKED_KEYS:
            # Defensive: an attacker spraying requests from many distinct IPs could
            # otherwise grow this dict without bound. A full reset is blunt but safe,
            # and rare enough in practice not to meaningfully weaken the limiter.
            self._hits.clear()
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > _RATE_LIMIT_WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)

        ip = self._client_ip(request)
        if not self._allow(f"general:{ip}", RATE_LIMIT_GENERAL_PER_MINUTE):
            return JSONResponse({"detail": "Too many requests. Please slow down."}, status_code=429)
        if path.startswith(_EXPENSIVE_PATH_PREFIXES) and not self._allow(f"expensive:{ip}", RATE_LIMIT_EXPENSIVE_PER_MINUTE):
            return JSONResponse(
                {"detail": "Rate limit exceeded for AI generation. Please wait a minute and try again."},
                status_code=429,
            )
        return await call_next(request)


# ============ STYLE PROMPTS ============
# HONESTY RULE (enforced in every style and in build_system_prompt):
# Never fabricate personal pet ownership. No "my cat Luna", "our dog Max", "my bearded dragon".
# Honest framings to use instead: "your cat", "in my experience", "I've seen this work",
# "many owners find", "a cat I was caring for", "readers often tell me",
# "this is one of the most common things people ask about".
# Warm, personal, and knowledgeable — never fictional.

STYLE_SYSTEM_PROMPTS = {
    "real-person": (
        "You are a warm, knowledgeable writer who has spent a lot of time researching and caring "
        "about animals — but you do not falsely claim to own specific pets. "
        "Write in genuine first-person: share what you've learned, what you've seen work, "
        "what surprised you. Use honest framings like 'in my experience', 'I've seen this trip "
        "people up', 'what I always tell people is', 'most owners I talk to'. "
        "Address the reader directly as someone going through this right now. "
        "Sentence rhythm: mix short punchy sentences with longer flowing ones. "
        "Occasional fragments are fine. Gentle humor is welcome. "
        "Never say 'my cat [name]' or 'our dog did X' — those are fabrications. "
        "Never sound like a brochure. Never hedge with 'it's important to note' or 'it's worth mentioning'. "
        "No bullet-point brains — this is a real person talking, not a listicle unless a list is explicitly requested. "
        "End thoughts fully. Don't trail off with vague platitudes."
    ),
    "experienced-caregiver": (
        "You write as someone with years of hands-on animal care experience — think rescue volunteer, "
        "vet tech, shelter worker, sanctuary caregiver. You've seen a lot. You don't panic and you "
        "don't sugarcoat. "
        "Tone: grounded, patient, quietly confident. Like a mentor who has sat with scared owners "
        "at 2am and knows exactly what to say. "
        "You can reference 'animals I've worked with', 'cases I've seen', 'in a rescue setting' honestly. "
        "Never invent a named pet you personally own — your credibility comes from pattern recognition "
        "across many animals, not one specific pet. "
        "Use clear, actionable language. Prioritize what actually matters over what sounds thorough. "
        "Call out common mistakes without being preachy. "
        "Short paragraphs. No unnecessary softening. If something is serious, say so plainly."
    ),
    "direct-no-bs": (
        "You are direct, practical, and completely unfiltered. You respect the reader's time. "
        "Every sentence earns its place or gets cut. "
        "Structure: lead with the answer, then explain why, then give the steps. "
        "Paragraphs: 1-3 sentences max. No throat-clearing intros. No summary conclusions that repeat what you just said. "
        "Word choice: plain Anglo-Saxon words over Latinate ones. 'Use' not 'utilize'. 'Start' not 'commence'. "
        "Never invent personal pet anecdotes — your credibility comes from being correct and specific, not relatable. "
        "Allowed: 'Here's what actually works.', 'Skip this.', 'Most advice on this is wrong.' "
        "Not allowed: 'Great question!', 'In today's world', 'It's important to remember', any filler whatsoever. "
        "Still warm underneath — tough love, not cold."
    ),
    "storyteller": (
        "You are a narrative writer who makes pet-care information feel human and memorable. "
        "Open with a specific, concrete scene or moment that drops the reader straight into something real: "
        "a sound, a smell, a behavior, a feeling of panic or delight. "
        "Honest scene-setting is fine ('Picture this:', 'Most cat owners know this moment:') — "
        "but never invent a named pet you personally own. Draw on universal experiences readers recognize. "
        "Weave the practical information into the story naturally — don't break into a bullet list mid-narrative "
        "unless the content genuinely calls for it. "
        "Sensory detail: use it once or twice per piece, precisely. Don't overdo it. "
        "Pacing: vary it. Short sentence after a long one. Let things breathe. "
        "Tone: warm, a little wry, never saccharine. Honest emotion is welcome; manufactured emotion is not. "
        "End with something that lands — a small truth, a quiet observation, not a generic wrap-up."
    ),
    "professional-educator": (
        "You are a subject-matter expert who genuinely enjoys helping people understand things. "
        "Your tone is the opposite of a textbook: structured but conversational, precise but never cold. "
        "Approach: introduce the concept plainly, explain the 'why' behind it, give practical application. "
        "Define technical terms the moment you use them — in parentheses or a quick aside, never a patronizing detour. "
        "Use analogies to make abstract concepts concrete, but only when they genuinely clarify. "
        "Cite reasoning, not just conclusions: 'The reason this matters is…', 'What's actually happening here is…' "
        "No fabricated personal pet anecdotes — your authority comes from knowledge, not ownership. "
        "For health topics: always recommend a vet for diagnosis; you can explain what's happening without prescribing. "
        "Avoid: jargon without definition, oversimplification that loses accuracy, condescension, excessive caveats."
    ),
    "newsletter": (
        "You are writing a section of a warm, well-edited pet-care newsletter that readers actually look forward to. "
        "Tone: friendly but not gushing. Informative but not overwhelming. Like a knowledgeable friend "
        "who sends you genuinely useful things, not marketing copy. "
        "Format: short paragraphs, clear headers if needed, one clear point per section. Scannable without being choppy. "
        "Voice: direct address to the reader ('you', 'your cat', 'your dog'). "
        "Never invent your own pet — speak about the reader's animal. "
        "CTAs: warm and specific, never pushy. 'If your cat does this, here's what I'd try first' beats 'Click to learn more'. "
        "Avoid: exclamation points in every sentence, fake urgency, vague teasers, hollow sign-offs. "
        "End each piece feeling useful — like the reader learned one thing they'll actually use."
    ),
    "short-story": (
        "You are a short fiction writer. Your job is to write a complete, satisfying short story — "
        "not an article, not a how-to, not a listicle. A story. With a character, a problem or tension, "
        "and a payoff. Every block you write is part of a continuous narrative. "
        "\n\nStory principles:\n"
        "- Open in the middle of something happening. No 'Once upon a time'. Drop the reader into a scene.\n"
        "- Show, don't tell. Behavior reveals character. Sensory detail creates world. Dialogue (when used) sounds real.\n"
        "- Keep momentum. Each paragraph should make the reader want to know what comes next.\n"
        "- Tone can range from warm and humorous to quietly moving — follow the brief's direction.\n"
        "- Ending: land it. A small revelation, a moment of change, a last image that lingers. Not a moral lecture.\n"
        "- Length: short stories should feel complete but tight. No padding.\n"
        "\nBlock roles in a short story:\n"
        "- prologue/intro: the opening scene — immediately in the world, immediately with the character.\n"
        "- paragraph: a scene beat, a turning point, an interior moment. Keep narrative moving.\n"
        "- conclusion: the story's final beat — resolution, image, or quiet emotional close.\n"
        "\nDo NOT break into bullet points, headers, or 'tips' mid-story unless the brief explicitly asks for it. "
        "This is fiction. Stay in the story world.\n"
        "\nNEVER rehash, re-introduce, or restart a scene that the prior content already covered. "
        "Each block moves the story forward. If the prior content ends mid-scene, pick up exactly there. "
        "If a plot point is already resolved, it is done — do not circle back to it."
    ),
}

BLOCK_INSTRUCTIONS = {
    "title": "Write a single warm, specific article title. Plain text. No quotes.",
    "prologue": "Write a short, intimate 2-3 sentence intro that pulls the reader in with a real moment or honest hook.",
    "paragraph": "Write a single rich, flowing paragraph (3-6 sentences) on the topic below.",
    "tips": "Write 4-6 practical tips as a markdown bullet list. Each bullet is one tight sentence.",
    "pros-cons": "Write a Pros section and Cons section in markdown. 3-4 bullets each.",
    "key-facts": "Write 4-5 key facts as a markdown bullet list. Concise and scannable.",
    "image": "Write a short, evocative image caption (1 sentence).",
    "table": "Output a small useful markdown table (3-5 rows) relevant to the topic.",
    "chart": "Describe in 1-2 sentences what a chart for this topic should show. Then output a JSON snippet ```json {\"labels\":[...],\"values\":[...]} ``` with sample numeric data.",
    "cta": "Write a warm, non-pushy call-to-action paragraph (2-3 sentences).",
    "conclusion": "Write a sincere closing paragraph (3-4 sentences) that ties the article together.",
    "custom": "Write rich, on-topic content for this custom section.",
    "resources": (
        "List 4-6 general, useful resource TYPES (e.g. 'a veterinary journal', 'your local shelter', "
        "'a certified trainer', 'a breed-specific rescue group') as markdown bullets with short descriptions. "
        "These are generic suggestions for where a reader could look, NOT citations for claims made in this "
        "article — do not name a specific real organization unless it literally appears in the Facts to Use field."
    ),
    "references": (
        "List credible sources for claims made in this article. This is a CITATION list, not a suggestions list: "
        "cite ONLY organizations or domains that literally appear in the Facts to Use field below — never a "
        "plausible-sounding real organization that wasn't provided. Format each bullet as: "
        "- Organization or Site Name (domain.com) — short note on what it covers, including the domain exactly "
        "as it appears in Facts to Use so it can be verified. "
        "List 3-5 sources if that many genuinely appear in Facts to Use; if fewer are available, list only those "
        "— do NOT pad the list to hit a target count. If Facts to Use contains no sources with a real domain, "
        "output nothing rather than inventing one."
    ),
    "affiliate": "Write a short, friendly, honest affiliate disclosure paragraph. Mention products are personally recommended.",
    "ending": "Write the final beat of the story. No header, no label, no 'Conclusion'. Just the last moment — a quiet image, a small truth, a shift in the character. It should feel complete without announcing itself. 2-4 sentences max.",
}


def build_system_prompt(style_id: str, brief: Dict[str, Any], style_instructions: Optional[str] = None) -> str:
    base = (style_instructions or "").strip() or STYLE_SYSTEM_PROMPTS.get(style_id, STYLE_SYSTEM_PROMPTS["real-person"])
    facts = (brief.get('factsToUse', '') or '').strip()
    niche = (brief.get('niche', '') or 'General').strip()

    context = (
        f"\n\nARTICLE CONTEXT:\n"
        f"- Niche / content area: {niche}\n"
        f"- Topic: {brief.get('topic', '')}\n"
        f"- Target audience: {brief.get('audience', '')}\n"
        f"- Angle / perspective: {brief.get('angle', '')}\n"
        f"- Key points to cover: {brief.get('keyPoints', '')}\n"
        f"- Focus keyword: {brief.get('focusKeyword', '')}\n"
        f"- Categories: {', '.join(brief.get('categories', []))}\n"
        f"- Extra instructions: {brief.get('extra', '')}\n"
    )
    if facts:
        context += (
            f"\nVERIFIED FACTS TO USE (authoritative — rely ONLY on these for specific claims):\n{facts}\n"
        )
    context += (
        f"\nGROUNDING & ACCURACY RULES (critical — follow strictly):\n"
        f"- The writer's Key Points, Personal Angle, and the 'Verified facts to use' above are your PRIMARY source of truth. Build the piece around them.\n"
        f"- Do NOT invent specific statistics, percentages, study results, dates, prices, brand claims, or veterinary/medical assertions. State such specifics ONLY if they appear in the writer's input above.\n"
        f"- When information is uncertain or not provided, stay general and cautious. Prefer practical, experience-based guidance over precise factual claims.\n"
        f"- For any health/medical topic, gently recommend consulting a veterinarian rather than asserting clinical facts.\n"
        f"- Never fabricate sources, citations, studies, or quotes.\n"
        f"- REFERENCES block (if requested): this is a citation list. Cite ONLY organizations/domains that "
        f"literally appear in the Facts to Use field above. Never name a real-sounding organization that wasn't "
        f"actually provided there, and never pad the list to hit a target count — list fewer, or none, if that's "
        f"what's actually available.\n"
        f"- RESOURCES block (if requested): this is different from references. It's fine to suggest credible "
        f"general source TYPES here (e.g. 'a veterinary journal', 'a certified trainer') even without specific "
        f"sources provided, since these are generic suggestions, not citations for claims in the article.\n"
        f"- Prioritize lived, practical, honest advice over generic 'fact' padding.\n\n"
        f"HONESTY RULES (critical — never break these):\n"
        f"- NEVER invent a specific pet you personally own. Do not write 'my cat Luna', 'our dog Max', or any named animal as if it belongs to you.\n"
        f"- Instead use: 'your cat', 'many owners find', 'in my experience', 'I've seen this work', 'a cat I was caring for', 'readers often tell me'.\n"
        f"- The Personal Angle field above may suggest scenarios — use them as inspiration for the READER's perspective, not as fabricated personal ownership claims.\n"
        f"- Warm, knowledgeable, and personal is the goal. Honest — not fictional.\n\n"
        f"VOICE RULES:\n"
        f"- Never use phrases like 'in today's fast-paced world', 'navigating', 'embark', 'delve', 'unleash', 'in conclusion'.\n"
        f"- NEVER use en dashes (–) or em dashes (—). Use a comma, period, or rewrite the sentence instead.\n"
        f"- Use natural human cadence. Vary sentence length. Stay true to the chosen writing style above.\n"
        f"- Output ONLY the requested content. No preamble, no explanation, no labels.\n"
    )
    return base + context


def _cached_system(system: str):
    """Wrap the system prompt with prompt caching. Repeated calls with the same
    system prompt (e.g. streaming an article block by block) read it from cache
    at ~10% of the input cost instead of paying full price every request."""
    return [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]


async def llm_complete(system: str, user_text: str, max_tokens: int = 2000) -> str:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "No LLM key configured. Set ANTHROPIC_API_KEY in backend/.env.")
    try:
        aclient = anthropic_sdk.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        msg = await aclient.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=_cached_system(system),
            messages=[{"role": "user", "content": user_text}],
        )
        return msg.content[0].text
    except Exception as e:
        logger.exception("Anthropic API call failed")
        raise HTTPException(500, f"Anthropic error: {str(e)}")


# ============ MODELS ============
class BriefIn(BaseModel):
    topic: str = ""
    audience: str = ""
    length: str = ""
    keyPoints: str = ""
    angle: str = ""
    extra: str = ""
    focusKeyword: str = ""
    factsToUse: str = ""
    categories: List[str] = []
    tags: List[str] = []
    niche: str = ""


class GenerateBlockIn(BaseModel):
    styleId: str = "real-person"
    brief: BriefIn
    blockType: str
    blockNote: Optional[str] = ""
    targetLength: Optional[str] = "medium"
    styleInstructions: Optional[str] = ""
    priorContent: Optional[str] = ""  # story/article written so far — used to continue narrative


class HumanizeIn(BaseModel):
    text: str
    styleId: str = "real-person"
    styleInstructions: Optional[str] = ""


class SeoIn(BaseModel):
    title: str = ""
    topic: str = ""
    content: str = ""
    focusKeyword: Optional[str] = ""


class EmailRequest(BaseModel):
    recipient_email: EmailStr
    subject: str
    html_content: str


class MetaIn(BaseModel):
    title: str
    content: str
    focusKeyword: Optional[str] = ""


class ImagePromptIn(BaseModel):
    topic: str
    angle: Optional[str] = ""
    styleId: str = "real-person"
    blockNote: Optional[str] = ""


class NewsletterPreviewIn(BaseModel):
    title: str
    metaDescription: str
    keyPoints: str = ""
    headerImagePrompt: str = ""
    styleId: str = "newsletter"


class SocialSnippetsIn(BaseModel):
    title: str
    metaDescription: str
    content: str
    styleId: str = "real-person"
    styleInstructions: Optional[str] = ""


class YoutubeScriptIn(BaseModel):
    title: str
    content: str
    styleId: str = "storyteller"
    styleInstructions: Optional[str] = ""


class LayoutSuggestIn(BaseModel):
    brief: BriefIn
    styleId: str = "real-person"


class BriefGenerateIn(BaseModel):
    topic: str
    styleId: str = "real-person"
    niche: str = "General"


class ProcessArticleIn(BaseModel):
    text: str
    styleId: str = "real-person"
    niche: str = "General"


# ============ ROUTES ============
@api_router.get("/")
async def root():
    return {"app": "CreatorForge", "model": CLAUDE_MODEL}


_DOMAIN_RE = re.compile(r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b')


def _extract_domains(text: str) -> set:
    """Pull the set of real domains present in a block of text (e.g. brief.factsToUse),
    normalized to lowercase with any leading 'www.' stripped."""
    if not text:
        return set()
    domains = set()
    for match in _DOMAIN_RE.findall(text):
        host = match.lower()
        if host.startswith('www.'):
            host = host[4:]
        domains.add(host)
    return domains


def _domain_matches(cited: str, allowed: str) -> bool:
    """True if `cited` and `allowed` are the same domain, or one is a subdomain of
    the other (e.g. 'en.wikipedia.org' should match a fact sourced from 'wikipedia.org',
    and vice versa)."""
    return (
        cited == allowed
        or cited.endswith("." + allowed)
        or allowed.endswith("." + cited)
    )


def _filter_references_block(text: str, facts: str) -> str:
    """Code-level backstop for the references block: strip any bullet whose cited
    source domain doesn't actually appear in Facts to Use. The prompt already asks
    the model not to fabricate sources, but that alone isn't reliable enough — this
    validates the model's output against the ground-truth facts instead of trusting it.
    Every non-blank line must cite a domain that matches Facts to Use, regardless of
    formatting (markdown bullet, numbered list, etc.) — a references block has nothing
    legitimate to say that isn't a citation, so anything unverifiable is dropped."""
    text = (text or "").strip()
    if not text:
        return text
    allowed = _extract_domains(facts)
    if not allowed:
        # No sourced facts were provided at all, so nothing in a references block
        # can be verified — drop it rather than ship an unverifiable citation list.
        return ""
    kept_lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        cited_domains = _extract_domains(stripped)
        if any(_domain_matches(cited, dom) for cited in cited_domains for dom in allowed):
            kept_lines.append(line)
    return "\n".join(kept_lines).strip()


def _sources_block_to_facts(content: str) -> str:
    """Convert an imported references/resources block's prose into Facts to Use
    bullets, so real citations that were already in the imported article survive
    _filter_references_block later instead of being dropped for having nothing to
    verify against. Imported sources are often just a name in prose with no URL
    ("PetMD, covers cat behavior...") — a name alone won't survive the domain
    filter, so a source with no discoverable domain is flagged instead of silently
    carried forward (which would just relocate the original bug to a new entry
    point) or silently dropped (which would repeat it)."""
    lines = []
    for raw_line in (content or "").split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        text = re.sub(r'^[-*\d.]+\s*', '', line).strip()
        if not text:
            continue
        if _extract_domains(text):
            lines.append(f"- {text}")
        else:
            lines.append(f"- {text} — NEEDS A URL: add this source's website so it isn't dropped when you regenerate this block.")
    return "\n".join(lines)


def _build_block_user_prompt(body: GenerateBlockIn) -> str:
    instr = BLOCK_INSTRUCTIONS.get(body.blockType, BLOCK_INSTRUCTIONS["paragraph"])
    prior = (body.priorContent or "").strip()
    # Cap prior context to keep input costs bounded on long articles. The most
    # recent text matters most for continuity, so keep the tail.
    if len(prior) > 8000:
        prior = "…(earlier sections omitted for brevity — the story/article continues)…\n" + prior[-8000:]
    user = f"BLOCK TYPE: {body.blockType}\nLENGTH: {body.targetLength}\nNOTE: {body.blockNote or '(none)'}\n\n{instr}"
    if prior:
        user = (
            f"STORY / ARTICLE WRITTEN SO FAR (do NOT repeat or summarize this — continue from where it ends):\n"
            f"---\n{prior}\n---\n\n"
        ) + user
    return user


@api_router.post("/generate/block")
async def generate_block(body: GenerateBlockIn):
    system = build_system_prompt(body.styleId, body.brief.model_dump(), body.styleInstructions)
    user = _build_block_user_prompt(body)
    text = await llm_complete(system, user, max_tokens=1500)
    text = text.strip()
    if body.blockType == "references":
        text = _filter_references_block(text, body.brief.factsToUse)
    return {"text": text}


@api_router.post("/generate/block/stream")
async def generate_block_stream(body: GenerateBlockIn):
    """Token-by-token SSE stream for a single block."""
    system = build_system_prompt(body.styleId, body.brief.model_dump(), body.styleInstructions)
    user = _build_block_user_prompt(body)

    async def event_gen():
        try:
            if body.blockType == "references":
                # References must pass the domain-validation filter before anything
                # reaches the client, so generate the full block first instead of
                # streaming raw (possibly fabricated) deltas token-by-token.
                text = await llm_complete(system, user, max_tokens=1500)
                text = _filter_references_block(text.strip(), body.brief.factsToUse)
                yield f"data: {json.dumps({'delta': text})}\n\n"
            elif ANTHROPIC_API_KEY:
                aclient = anthropic_sdk.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
                async with aclient.messages.stream(
                    model=CLAUDE_MODEL,
                    max_tokens=1500,
                    system=_cached_system(system),
                    messages=[{"role": "user", "content": user}],
                ) as stream:
                    async for text in stream.text_stream:
                        yield f"data: {json.dumps({'delta': text})}\n\n"
            else:
                yield f"data: {json.dumps({'error': 'No LLM key configured. Set ANTHROPIC_API_KEY in backend/.env.'})}\n\n"
                return
        except Exception as e:
            logger.exception("Stream failed")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api_router.post("/generate/article")
async def generate_article(body: dict):
    """Generate content for an ordered list of blocks in one shot.
    body: { styleId, brief, blocks: [{id, type, note}] }
    Returns: { results: { blockId: text } }
    """
    style_id = body.get("styleId", "real-person")
    brief = body.get("brief", {})
    blocks = body.get("blocks", [])
    if not blocks:
        raise HTTPException(400, "No blocks provided")
    system = build_system_prompt(style_id, brief, body.get("styleInstructions"))

    plan_lines = []
    for i, b in enumerate(blocks, 1):
        instr = BLOCK_INSTRUCTIONS.get(b["type"], BLOCK_INSTRUCTIONS["paragraph"])
        note = b.get("note") or ""
        plan_lines.append(f"{i}. [{b['id']}] TYPE={b['type']} NOTE={note}\n   TASK: {instr}")

    user = (
        "Write the full article by producing content for EACH block below, in order, as one continuous, "
        "connected piece — not a set of independent snippets. Treat the blocks as sequential sections of a "
        "single article: each later block continues from where the one before it left off. "
        "NEVER repeat the same anecdote, example, scene, statistic, or specific detail in more than one block "
        "— once you've used it, it's used. Each block must add something the article doesn't already have. "
        "Return a single JSON object mapping block id -> content string. "
        "DO NOT wrap in markdown code fences. Output ONLY raw JSON.\n\n"
        "BLOCKS:\n" + "\n".join(plan_lines) +
        "\n\nJSON FORMAT EXAMPLE:\n{\"block-id-1\": \"...content...\", \"block-id-2\": \"...content...\"}"
    )
    raw = await llm_complete(system, user, max_tokens=8000)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        results = json.loads(raw)
    except Exception:
        # fallback: try to extract JSON object
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                results = json.loads(raw[start:end+1])
            except Exception:
                raise HTTPException(500, "Failed to parse model output")
        else:
            raise HTTPException(500, "Failed to parse model output")

    facts_to_use = brief.get("factsToUse", "")
    for b in blocks:
        if b.get("type") == "references" and b.get("id") in results:
            results[b["id"]] = _filter_references_block(str(results[b["id"]]), facts_to_use)

    return {"results": results}


@api_router.post("/process/article")
async def process_article(body: ProcessArticleIn):
    """Take a finished article and split it into structured blocks + metadata.
    The author's words are preserved verbatim — this only segments and extracts."""
    if not body.text.strip():
        raise HTTPException(400, "No article text provided")
    system = (
        "You are a precise content processor for an article builder. You take a finished article "
        "and split it into structured blocks plus metadata. You DO NOT rewrite, improve, or alter "
        "the author's words — you only segment and extract. Preserve the original text verbatim "
        "inside block contents."
    )
    user = (
        f"NICHE: {body.niche}\n\n"
        f"ARTICLE:\n---\n{body.text}\n---\n\n"
        "Split this article into blocks and extract metadata. Return ONLY raw JSON (no code fences):\n\n"
        "{\n"
        '  "title": "the article title (write one if missing)",\n'
        '  "blocks": [{"type": "<one of: title|prologue|paragraph|tips|pros-cons|key-facts|table|cta|conclusion|ending|resources|references>", "content": "verbatim text"}],\n'
        '  "audience": "who this is for",\n'
        '  "keyPoints": "- bullet summary of the main points",\n'
        '  "angle": "the author\'s perspective in 1-2 sentences",\n'
        '  "focusKeyword": "primary SEO keyword",\n'
        '  "metaDescription": "a 150-160 character meta description",\n'
        '  "tags": ["kebab-case-tags"],\n'
        '  "categories": ["1-3 fitting categories"]\n'
        "}\n\n"
        "Rules:\n"
        "- The first block must be type \"title\" with the title as its content.\n"
        "- Preserve the author's exact wording in block contents. Do not paraphrase.\n"
        "- Use \"tips\" for bullet lists, \"key-facts\" for fact boxes, \"table\" for markdown tables.\n"
        "- Use \"paragraph\" for normal prose; split long articles into multiple paragraph blocks at natural section boundaries.\n"
    )
    raw = await llm_complete(system, user, max_tokens=8000)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        data = json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw[start:end+1])
            except Exception:
                raise HTTPException(500, "Failed to parse model output")
        else:
            raise HTTPException(500, "Failed to parse model output")

    # Carry any references/resources block's sources into factsToUse, so they're
    # available to validate against if the writer regenerates that block later —
    # otherwise the block came in with real sources but nothing to check them
    # against, and _filter_references_block strips them all on the next regenerate.
    facts_parts = [
        _sources_block_to_facts(b.get("content", ""))
        for b in data.get("blocks", [])
        if b.get("type") in ("references", "resources")
    ]
    facts_parts = [p for p in facts_parts if p]
    if facts_parts:
        data["factsToUse"] = "\n".join(facts_parts)

    return data


@api_router.post("/humanize")
async def humanize(body: HumanizeIn):
    base = (body.styleInstructions or "").strip() or STYLE_SYSTEM_PROMPTS.get(body.styleId, STYLE_SYSTEM_PROMPTS["real-person"])
    system = (
        base +
        "\n\nYour ONLY task: rewrite the given text so it sounds clearly written by one real person. "
        "Remove AI tells (em-dashes overuse, 'delve', 'navigating', 'in today's world', 'it's important to note', "
        "'unleash', 'embark', 'tapestry', 'realm', 'landscape of'). Vary sentence length. Keep the meaning and any "
        "specific facts EXACTLY as given — never add new statistics, claims, or sources. "
        "Output ONLY the rewritten text — no preamble."
    )
    text = await llm_complete(system, body.text, max_tokens=2000)
    return {"text": text.strip()}


@api_router.post("/generate/seo")
async def generate_seo(body: SeoIn):
    system = (
        "You are an SEO assistant for warm, authentic pet-care articles. "
        "Output STRICT JSON (no code fences, no preamble) with exactly these keys: "
        "focusKeyword (a 2-4 word primary search keyword phrase, lowercase), "
        "metaDescription (a warm, specific description between 150 and 160 characters that naturally includes the focus keyword). "
        "Do not invent statistics or claims."
    )
    user = (
        f"TITLE/TOPIC: {body.title or body.topic}\n"
        f"EXISTING FOCUS KEYWORD (improve if weak): {body.focusKeyword}\n\n"
        f"ARTICLE EXCERPT:\n{(body.content or '')[:2000]}"
    )
    raw = await llm_complete(system, user, max_tokens=300)
    raw = raw.strip().strip("`")
    if raw.lower().startswith("json"):
        raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except Exception:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            data = json.loads(raw[start:end+1])
        except Exception:
            raise HTTPException(500, "Failed to parse SEO output")
    return {
        "focusKeyword": str(data.get("focusKeyword", "")).strip(),
        "metaDescription": str(data.get("metaDescription", "")).strip().strip('"'),
    }


@api_router.post("/generate/meta")
async def generate_meta(body: MetaIn):
    system = (
        "You write SEO meta descriptions for pet-care articles. "
        "Output a single meta description between 150 and 160 characters. "
        "Warm, specific, includes the focus keyword naturally if provided. "
        "No quotes. No preamble. Just the description."
    )
    user = f"TITLE: {body.title}\nFOCUS KEYWORD: {body.focusKeyword}\n\nARTICLE EXCERPT:\n{body.content[:2000]}"
    text = await llm_complete(system, user, max_tokens=200)
    text = text.strip().strip('"').strip("'")
    return {"text": text}


@api_router.post("/generate/image-prompt")
async def generate_image_prompt(body: ImagePromptIn):
    system = (
        "You craft rich, vivid image-generation prompts for pet-care article header images. "
        "Output ONE detailed prompt (60-90 words) describing scene, subject, lighting, mood, "
        "composition, lens, and style. Then on a new line output: ALT: <alt text 8-14 words>. "
        "No other commentary."
    )
    user = f"TOPIC: {body.topic}\nANGLE: {body.angle}\nNOTE: {body.blockNote}"
    text = await llm_complete(system, user, max_tokens=400)
    lines = text.strip().split("\n")
    prompt = ""
    alt = ""
    for line in lines:
        if line.strip().upper().startswith("ALT:"):
            alt = line.split(":", 1)[1].strip()
        else:
            prompt += (" " + line.strip())
    return {"prompt": prompt.strip(), "alt": alt or body.topic}


@api_router.post("/generate/newsletter-preview")
async def generate_newsletter_preview(body: NewsletterPreviewIn):
    system = (
        STYLE_SYSTEM_PROMPTS["newsletter"] +
        "\n\nYou produce a single newsletter preview card. Output strict JSON with keys: "
        "title (catchy, ~8-12 words), summary (2-3 friendly sentences, 200-320 chars), "
        "ctaText (3-5 words like 'Read the full guide'), imagePrompt (a rich image prompt for this preview), "
        "imageAlt (8-14 words alt text). Output ONLY raw JSON, no fences, no preamble."
    )
    user = (
        f"ARTICLE TITLE: {body.title}\n"
        f"META DESCRIPTION: {body.metaDescription}\n"
        f"KEY POINTS: {body.keyPoints}\n"
        f"HEADER IMAGE PROMPT: {body.headerImagePrompt}\n"
    )
    raw = await llm_complete(system, user, max_tokens=500)
    raw = raw.strip().strip("`")
    if raw.startswith("json"):
        raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except Exception:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            data = json.loads(raw[start:end+1])
        except Exception:
            raise HTTPException(500, "Failed to parse model output")
    return data


@api_router.post("/generate/social")
async def generate_social(body: SocialSnippetsIn):
    base = (body.styleInstructions or "").strip() or STYLE_SYSTEM_PROMPTS.get(body.styleId, STYLE_SYSTEM_PROMPTS["real-person"])
    system = (
        base +
        "\n\nProduce three social posts in strict JSON with keys: x (<=270 chars), instagram (caption + 5 hashtags), "
        "facebook (2-3 sentences). Output ONLY raw JSON."
    )
    user = f"TITLE: {body.title}\nMETA: {body.metaDescription}\n\nEXCERPT:\n{body.content[:2000]}"
    raw = await llm_complete(system, user, max_tokens=700)
    raw = raw.strip().strip("`")
    if raw.startswith("json"):
        raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except Exception:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            data = json.loads(raw[start:end+1])
        except Exception:
            raise HTTPException(500, "Failed to parse model output")
    return data


@api_router.post("/generate/youtube")
async def generate_youtube(body: YoutubeScriptIn):
    base = (body.styleInstructions or "").strip() or STYLE_SYSTEM_PROMPTS.get(body.styleId, STYLE_SYSTEM_PROMPTS["storyteller"])
    system = (
        base +
        "\n\nWrite a 60-90 second YouTube Shorts script for a content creator. "
        "Sections: [HOOK] 1-2 lines. [BODY] 4-6 short beats. [CTA] one warm closing line. "
        "Plain text. No JSON. No camera directions in brackets except section labels above."
    )
    user = f"TITLE: {body.title}\n\nARTICLE:\n{body.content[:3000]}"
    text = await llm_complete(system, user, max_tokens=900)
    return {"text": text.strip()}


@api_router.post("/layout/suggest")
async def suggest_layout(body: LayoutSuggestIn):
    system = (
        "You suggest an article block layout for pet-care content. "
        "Output strict JSON: { blocks: [ { type, note } ] }. Types must be from: "
        "title, prologue, paragraph, tips, pros-cons, key-facts, image, table, chart, "
        "cta, conclusion, custom, resources, references, affiliate. "
        "Include 6-10 blocks tailored to the brief. Output ONLY raw JSON."
    )
    user = json.dumps(body.brief.model_dump())
    raw = await llm_complete(system, user, max_tokens=900)
    raw = raw.strip().strip("`")
    if raw.startswith("json"):
        raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except Exception:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            data = json.loads(raw[start:end+1])
        except Exception:
            raise HTTPException(500, "Failed to parse model output")
    return data


# Unambiguous photo-credit/stock-image markers: these never show up in a genuine
# factual claim, so their presence alone is enough to flag a caption, regardless of
# anything else in the sentence (a copyright year or image ID doesn't make it a fact).
_HARD_CAPTION_MARKERS = (
    "getty images", "shutterstock", "stock photo", "royalty free",
)

# Phrases that show up in scraped image captions/alt text (visual composition,
# framing) rather than in a factual claim about the topic. Weaker signal than the
# hard markers above — dropped only when nothing else suggests a real claim.
# ("shot of" and "picture of" were deliberately excluded: they collide with ordinary
# idioms like "first shot of vaccines" / "the picture of good health".)
_SOFT_CAPTION_MARKERS = (
    "out of focus", "in focus", "close-up", "close up", "blurred background",
    "blurry background", "in the background", "in the foreground", "background is",
    "foreground is", "bokeh", "depth of field", "color palette", "colour palette",
    "photo of", "photograph of", "image of", "pictured",
    "screenshot", "thumbnail", "low angle", "high angle",
    "wide shot", "macro shot", "on the page", "out of frame", "in the frame",
)

# Presence of any of these is a reasonably strong signal the sentence is asserting
# something factual/attributable rather than just describing what an image looks like.
# Deliberately excludes bare digits — a copyright year or image dimension is a digit
# too, and shouldn't be enough to wave through an otherwise obvious caption.
_CLAIM_SIGNALS = (
    "according to", "study", "studies", "research", "recommend", "survey",
    "found that", "shows that", "indicates", "reported", "%",
)


def _looks_like_caption(sentence: str) -> bool:
    """Heuristically flag scraped image captions/alt text (e.g. 'There are little pink
    bits on the page and a blue out of focus background') rather than a real factual
    sentence from the article body. Tavily's `content` field doesn't tag which parts of
    the extracted text came from an <img alt> or <figcaption> versus body copy, so this
    is a best-effort filter, not an exact one."""
    s = sentence.strip()
    if not s:
        return True
    lower = s.lower()
    if any(marker in lower for marker in _HARD_CAPTION_MARKERS):
        return True
    has_claim_signal = any(sig in lower for sig in _CLAIM_SIGNALS)
    has_soft_marker = any(marker in lower for marker in _SOFT_CAPTION_MARKERS)
    return has_soft_marker and not has_claim_signal


async def _search_facts(topic: str, niche: str = "General") -> str:
    """Run a Tavily search and return a clean bullet list of sourced facts."""
    if not TAVILY_API_KEY:
        return ""
    try:
        tavily = TavilyClient(api_key=TAVILY_API_KEY)
        query = f"{topic} {niche} facts" if niche and niche != "General" else f"{topic} facts"
        results = await asyncio.to_thread(
            tavily.search,
            query=query,
            search_depth="advanced",
            max_results=5,
            include_answer=True,
        )
        lines = []
        # Include the synthesized answer if present
        if results.get("answer"):
            lines.append(f"- {results['answer'].strip()}")
        # Pull key sentences from each result
        for r in results.get("results", []):
            content = (r.get("content") or "").strip()
            if content:
                # Take first 2 real sentences (filtering out caption/alt-text-style
                # fragments first) as a fact bullet. Split on ., !, and ? so a caption
                # fragment ending in "!" or "?" doesn't fuse with an adjacent real
                # sentence and take it down when filtered.
                sentences = [s.strip() for s in re.split(r'[.!?]+', content.replace("\n", " ")) if len(s.strip()) > 30]
                sentences = [s for s in sentences if not _looks_like_caption(s)]
                for s in sentences[:2]:
                    lines.append(f"- {s}. (Source: {r.get('url', '')})")
        return "\n".join(lines[:10])  # cap at 10 bullets
    except Exception as e:
        logger.warning(f"Tavily search failed: {e}")
        return ""


@api_router.post("/generate/brief")
async def generate_brief(body: BriefGenerateIn):
    """Auto-fill all brief fields from a topic/title in one shot, with real web facts."""
    # Run web search and brief generation in parallel
    facts_task = asyncio.create_task(_search_facts(body.topic, body.niche))

    system = (
        f"You are a content strategist helping writers create well-structured articles on any topic. "
        f"The writer's content niche is: {body.niche}. "
        "Given a topic/title and writing style, return a complete article brief as strict JSON. "
        "Output ONLY raw JSON with exactly these keys:\n"
        "- audience (string): 1-sentence description of who will read this\n"
        "- keyPoints (string): 4-6 bullet points (markdown list) covering what the article must address\n"
        "- angle (string): 2-3 sentences describing an honest, informed angle the writer can take\n"
        "- focusKeyword (string): a 2-4 word lowercase SEO keyword phrase\n"
        "- metaDescription (string): a warm, specific 150-160 character meta description that includes the focus keyword\n"
        "- categories (array of strings): 1-3 relevant categories that fit this niche and topic\n"
        "- tags (array of strings): 3-6 lowercase hyphenated tags relevant to the topic\n"
        "Do NOT invent statistics. Be specific to the topic and niche. Output ONLY raw JSON, no fences, no preamble."
    )
    style_hint = STYLE_SYSTEM_PROMPTS.get(body.styleId, "")
    user = f"TOPIC: {body.topic}\nNICHE: {body.niche}\nWRITING STYLE CONTEXT: {style_hint[:300]}"

    raw, facts = await asyncio.gather(
        llm_complete(system, user, max_tokens=800),
        facts_task,
    )
    raw = raw.strip().strip("`")
    if raw.lower().startswith("json"):
        raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except Exception:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            data = json.loads(raw[start:end+1])
        except Exception:
            raise HTTPException(500, "Failed to parse brief output")
    return {
        "audience": str(data.get("audience", "")).strip(),
        "keyPoints": str(data.get("keyPoints", "")).strip(),
        "angle": str(data.get("angle", "")).strip(),
        "focusKeyword": str(data.get("focusKeyword", "")).strip(),
        "metaDescription": str(data.get("metaDescription", "")).strip().strip('"'),
        "categories": [str(c) for c in data.get("categories", []) if isinstance(c, str)],
        "tags": [str(t).lower().replace(" ", "-") for t in data.get("tags", []) if isinstance(t, str)],
        "factsToUse": facts,
    }


@api_router.post("/generate/facts")
async def generate_facts(body: BriefGenerateIn):
    """Search the web for sourced facts about a topic on demand."""
    if not TAVILY_API_KEY:
        raise HTTPException(400, "TAVILY_API_KEY not configured")
    facts = await _search_facts(body.topic, body.niche)
    if not facts:
        raise HTTPException(500, "No results returned from search")
    return {"factsToUse": facts}


@api_router.post("/send-email")
async def send_email(request: EmailRequest):
    if not RESEND_API_KEY or not SENDER_EMAIL:
        raise HTTPException(400, "Email not configured. Set RESEND_API_KEY and SENDER_EMAIL.")
    resend.api_key = RESEND_API_KEY
    params = {
        "from": SENDER_EMAIL,
        "to": [request.recipient_email],
        "subject": request.subject or "Your CreatorForge newsletter",
        "html": request.html_content,
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "success", "message": f"Test email sent to {request.recipient_email}", "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        raise HTTPException(500, f"Failed to send email: {str(e)}")


# Mount router
app.include_router(api_router)

# Rate limiting must be added before CORS so CORS ends up as the outermost layer —
# otherwise a 429 response short-circuited by the rate limiter would skip CORS
# entirely and the browser would report it as a network error instead of a 429.
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

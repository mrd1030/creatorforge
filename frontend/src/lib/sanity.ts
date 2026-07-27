import type { Draft } from "@/types";

// Which Sanity project/dataset this deployment pushes to — set per-deployment via
// env vars rather than hardcoded, so different buyers of this template can point it
// at their own Sanity project without editing source. Push-to-Sanity is disabled
// entirely (see isSanityConfigured) when VITE_SANITY_PROJECT_ID isn't set.
export const SANITY_PROJECT_ID = (import.meta.env.VITE_SANITY_PROJECT_ID as string) || "";
export const SANITY_DATASET = (import.meta.env.VITE_SANITY_DATASET as string) || "production";
const API_VERSION = "2021-06-07";

export function isSanityConfigured(): boolean {
  return Boolean(SANITY_PROJECT_ID);
}

// Sanity Studio URLs are of the form https://<project-id>.sanity.studio/... —
// derive it from the same project ID used for the push, so there's one source of
// truth for which Sanity project this app talks to.
export function getSanityStudioUrl(docId: string): string {
  return `https://${SANITY_PROJECT_ID}.sanity.studio/structure/post;${docId}`;
}

// Generic fallback when a source/CTA needs a URL but none was provided — uses this
// deployment's own origin rather than assuming any particular site's domain.
function fallbackSiteUrl(): string {
  return typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
}

// ── helpers ────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

// Parse inline markdown marks (**bold**, *italic*) into Portable Text spans.
function textToSpans(text: string): any[] {
  const spans: any[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|([^*_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) spans.push({ _type: "span", _key: uid(), text: m[1], marks: ["strong"] });
    else if (m[2]) spans.push({ _type: "span", _key: uid(), text: m[2], marks: ["em"] });
    else if (m[3]) spans.push({ _type: "span", _key: uid(), text: m[3], marks: ["em"] });
    else if (m[4]) spans.push({ _type: "span", _key: uid(), text: m[4], marks: [] });
  }
  return spans.length ? spans : [{ _type: "span", _key: uid(), text, marks: [] }];
}

function makeBlock(text: string, style = "normal"): any {
  return {
    _type: "block",
    _key: uid(),
    style,
    markDefs: [],
    children: textToSpans(text.trim()),
  };
}

function makeBullet(text: string): any {
  return {
    _type: "block",
    _key: uid(),
    style: "normal",
    listItem: "bullet",
    level: 1,
    markDefs: [],
    children: textToSpans(text.trim()),
  };
}

// Convert a markdown string to an array of Portable Text blocks.
function mdToPortableText(md: string): any[] {
  const blocks: any[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("# "))        { i++; continue; } // title — skip (handled separately)
    if (line.startsWith("#### "))     { blocks.push(makeBlock(line.slice(5), "h4")); i++; continue; }
    if (line.startsWith("### "))      { blocks.push(makeBlock(line.slice(4), "h3")); i++; continue; }
    if (line.startsWith("## "))       { blocks.push(makeBlock(line.slice(3), "h2")); i++; continue; }
    if (line.startsWith("> "))        { blocks.push(makeBlock(line.slice(2), "blockquote")); i++; continue; }
    if (/^[-*]\s+/.test(line))        { blocks.push(makeBullet(line.replace(/^[-*]\s+/, ""))); i++; continue; }
    if (/^\d+\.\s+/.test(line))       { blocks.push(makeBullet(line.replace(/^\d+\.\s+/, ""))); i++; continue; }

    // Normal paragraph — absorb until blank line or block-level marker
    let text = line;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !/^[-*]\s/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      text += " " + lines[i];
      i++;
    }
    blocks.push(makeBlock(text, "normal"));
  }

  return blocks;
}

// Parse a pros-cons markdown block into a Sanity prosCons object.
function parseProsConsContent(content: string): any {
  const pros: string[] = [];
  const cons: string[] = [];
  let section = "";

  for (const line of content.split("\n")) {
    if (/^#+\s*pros/i.test(line)) { section = "pros"; continue; }
    if (/^#+\s*cons/i.test(line)) { section = "cons"; continue; }
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      if (section === "pros") pros.push(bullet[1].trim());
      else if (section === "cons") cons.push(bullet[1].trim());
    }
  }

  return { _type: "prosCons", _key: uid(), pros, cons };
}

// Parse a markdown table into a Sanity comparisonTable object.
function parseTableContent(content: string): any {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  // Find a title line (anything before the first | row)
  let title = "Comparison Table";
  const tableLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("|")) tableLines.push(line);
    else if (tableLines.length === 0) title = line.replace(/^#+\s*/, "").trim();
  }

  // Parse header row and separator row
  const dataRows = tableLines.filter(l => !/^\|[\s|:-]+\|$/.test(l) && !/^[\s|:-]+$/.test(l));
  const parseRow = (line: string) =>
    line.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);

  const [headerRow, ...bodyRows] = dataRows;
  const headers = headerRow ? parseRow(headerRow) : [];
  const rows = bodyRows.map(line => ({ _type: "row", _key: uid(), cells: parseRow(line) }));

  return { _type: "comparisonTable", _key: uid(), title, headers, rows };
}

// Parse resources/references markdown into a Sanity sourcesBlock.
function parseSourcesContent(content: string): any {
  const sources: any[] = [];

  for (const line of content.split("\n")) {
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (!bullet) continue;
    const text = bullet[1];
    // Try "Title — description" or "Title: description" or "Title (url)"
    const dashSplit = text.split(/\s*[—–]\s*/);
    const urlMatch = text.match(/https?:\/\/[^\s)]+/);
    sources.push({
      _type: "sourceItem",
      _key: uid(),
      title: dashSplit[0]?.replace(/\[([^\]]+)\]\([^)]+\)/, "$1").trim() || text,
      description: dashSplit.slice(1).join(" ").trim() || "",
      url: urlMatch ? urlMatch[0] : fallbackSiteUrl(),
      sourceType: "other",
    });
  }

  return {
    _type: "sourcesBlock",
    _key: uid(),
    heading: "Sources & Further Reading",
    sources,
    showMoreSection: true,
    moreText: "Explore more articles",
    moreUrl: fallbackSiteUrl(),
  };
}

// ── main converter ─────────────────────────────────────────────────────────────

export function draftToSanityDoc(draft: Draft): any {
  const titleBlock = draft.blocks.find(b => b.type === "title");
  const title = titleBlock?.content?.trim() || draft.brief.topic || "Untitled";
  const slug = draft.brief.slug || toSlug(title);

  const body: any[] = [];

  for (const block of draft.blocks) {
    const content = (block.content || "").trim();
    if (!content || block.type === "title") continue;

    switch (block.type) {
      case "pros-cons":
        body.push(parseProsConsContent(content));
        break;
      case "affiliate":
        body.push({ _type: "affiliateDisclosure", _key: uid(), text: content });
        break;
      case "table":
        body.push(parseTableContent(content));
        break;
      case "references":
      case "resources":
        body.push(parseSourcesContent(content));
        break;
      default:
        body.push(...mdToPortableText(content));
    }
  }

  const words = draft.blocks.map(b => b.content || "").join(" ").trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.round(words / 220));

  return {
    _type: "post",
    _id: `drafts.bf-${draft.id}`,
    title,
    slug: { _type: "slug", current: slug },
    excerpt: draft.brief.metaDescription || "",
    seoTitle: title,
    seoDescription: draft.brief.metaDescription || "",
    readTime,
    publishedAt: new Date(draft.createdAt).toISOString(),
    body,
  };
}

// ── API push ───────────────────────────────────────────────────────────────────

export async function pushToSanity(draft: Draft, token: string): Promise<string> {
  if (!isSanityConfigured()) {
    throw new Error("Sanity isn't configured for this deployment (set VITE_SANITY_PROJECT_ID).");
  }
  const doc = draftToSanityDoc(draft);

  const res = await fetch(
    `https://${SANITY_PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/mutate/${SANITY_DATASET}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mutations: [{ createOrReplace: doc }] }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = `Sanity API error ${res.status}`;
    try {
      const err = JSON.parse(body);
      msg = err?.error?.description || err?.message || err?.error || msg;
    } catch {}
    console.error("[Sanity push] status:", res.status, "body:", body);
    throw new Error(msg);
  }

  return doc._id;
}

// ── token storage ──────────────────────────────────────────────────────────────

const TOKEN_KEY = "bf.sanity.token";

export function loadSanityToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function saveSanityToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

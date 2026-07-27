import type { Draft, Block, StandaloneNewsletter, NewsletterPreview } from "@/types";
import { marked } from "marked";
import { parseChartBlock, chartToSvg } from "@/lib/chart";
import { loadSettings } from "@/lib/storage";

marked.setOptions({ gfm: true, breaks: true });

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function blockToMarkdown(b: Block): string {
  const text = (b.content || "").trim();
  switch (b.type) {
    case "title": {
      // AI output occasionally arrives with its own "#" marks, surrounding
      // quotes, or trailing lines — strip all of it so the heading renders clean.
      const clean = text.replace(/^#+\s*/, "").replace(/^["'"]|["'"]$/g, "").split("\n")[0].trim();
      return `# ${clean || "Untitled"}\n`;
    }
    case "prologue":   return `> ${text}\n`;
    case "image":      return `![${b.imageAlt || "image"}](${b.imageUrl || "https://placehold.co/1200x630"})\n\n*${text}*\n`;
    case "key-facts":  return `### Key Facts\n${text}\n`;
    case "tips":       return `### Tips\n${text}\n`;
    case "pros-cons":  return `### Pros & Cons\n${text}\n`;
    case "table":      return `${text}\n`;
    case "cta":        return `${text}\n`;
    case "conclusion": return `## Conclusion\n${text}\n`;
    case "resources":  return `### Resources\n${text}\n`;
    case "references": return `### References\n${text}\n`;
    case "affiliate":  return `> ${text}\n`;
    default:           return `${text}\n`;
  }
}

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function toDateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function q(s: string): string {
  return `"${(s || "").replace(/"/g, '\\"')}"`;
}

function buildFrontmatter(d: Draft): string {
  const titleBlock = d.blocks.find(b => b.type === "title");
  const title = titleBlock?.content?.trim() || d.brief.topic || "Untitled";
  const slug = d.brief.slug || toSlug(title);
  const today = toDateStr(Date.now());
  const created = toDateStr(d.createdAt);
  const updated = toDateStr(d.updatedAt);
  const words = wordCount(d);
  const rt = readingTime(words);
  const category = d.brief.categories[0] || "";
  const tags = d.brief.tags.length ? `[${d.brief.tags.map(t => `"${t}"`).join(", ")}]` : "[]";
  const authorName = (loadSettings().authorName || "").trim();

  const lines = [
    "---",
    `title: ${q(title)}`,
    `slug: ${q(slug)}`,
    `date: ${q(created)}`,
    `lastUpdated: ${q(updated)}`,
    `lastReviewed: ${q(today)}`,
    `category: ${q(category)}`,
    `tags: ${tags}`,
    `excerpt: ${q(d.brief.metaDescription)}`,
    `description: ${q(d.brief.metaDescription)}`,
    `image: ${q(d.headerImage.url || "")}`,
    `imageAlt: ${q(d.headerImage.alt || "")}`,
    ...(authorName ? [`author: ${q(authorName)}`] : []),
    `status: "published"`,
    `affiliate: ${d.affiliate.enabled}`,
    `noIndex: false`,
    `canonicalUrl: ${q(d.brief.canonicalUrl || "")}`,
    `readingTime: ${rt}`,
    "---",
    "",
  ];
  return lines.join("\n");
}

// Raw markdown body — no frontmatter. Used for preview and HTML rendering.
export function toMarkdownBody(d: Draft): string {
  const titleBlock = d.blocks.find(b => b.type === "title");
  const title = titleBlock?.content?.trim() || d.brief.topic || "Untitled";
  const parts: string[] = [];
  if (d.headerImage.url || d.headerImage.prompt) {
    parts.push(`![${d.headerImage.alt || title}](${d.headerImage.url || "https://placehold.co/1200x630"})\n`);
  }
  for (const b of d.blocks) parts.push(blockToMarkdown(b));
  return parts.join("\n");
}

// Full markdown with frontmatter — for file export/download only.
export function toMarkdown(d: Draft): string {
  return buildFrontmatter(d) + "\n" + toMarkdownBody(d);
}

export type ContentSegment =
  | { kind: "markdown"; markdown: string }
  | { kind: "chart"; block: Block };

// Same content as toMarkdownBody, but split at "chart" blocks so they can be
// rendered as a real chart (React component in-app, static SVG in the standalone
// HTML export) instead of dumped as raw JSON text. A chart block whose content
// doesn't actually parse as chart data falls back to the plain markdown/JSON
// rendering rather than silently disappearing.
export function toContentSegments(d: Draft): ContentSegment[] {
  const titleBlock = d.blocks.find(b => b.type === "title");
  const title = titleBlock?.content?.trim() || d.brief.topic || "Untitled";
  const segments: ContentSegment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) {
      segments.push({ kind: "markdown", markdown: buffer.join("\n") });
      buffer = [];
    }
  };
  if (d.headerImage.url || d.headerImage.prompt) {
    buffer.push(`![${d.headerImage.alt || title}](${d.headerImage.url || "https://placehold.co/1200x630"})\n`);
  }
  for (const b of d.blocks) {
    if (b.type === "chart" && parseChartBlock(b.content)) {
      flush();
      segments.push({ kind: "chart", block: b });
      continue;
    }
    buffer.push(blockToMarkdown(b));
  }
  flush();
  return segments;
}

// Markdown -> HTML via `marked` (GFM). Always sanitize before injecting into the DOM.
export function mdToHtml(md: string): string {
  if (!md) return "";
  return marked.parse(md) as string;
}

function segmentsToHtml(d: Draft): string {
  return toContentSegments(d).map(seg => {
    if (seg.kind === "markdown") return mdToHtml(seg.markdown);
    const data = parseChartBlock(seg.block.content)!;
    const caption = data.description ? `<figcaption>${escapeHtml(data.description)}</figcaption>` : "";
    return `<figure>${caption}${chartToSvg(data)}</figure>`;
  }).join("\n");
}

export function toHtml(d: Draft): string {
  const titleBlock = d.blocks.find(b => b.type === "title");
  const title = titleBlock?.content?.trim() || d.brief.topic || "Untitled";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(d.brief.metaDescription)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(d.brief.metaDescription)}" />
${d.headerImage.url ? `<meta property="og:image" content="${escapeHtml(d.headerImage.url)}" />` : ""}
${d.brief.tags.length ? `<meta name="keywords" content="${escapeHtml(d.brief.tags.join(", "))}" />` : ""}
</head>
<body>
<article>
${d.headerImage.url || d.headerImage.prompt ? `<img alt="${escapeHtml(d.headerImage.alt || title)}" src="${escapeHtml(d.headerImage.url || "https://placehold.co/1200x630")}" />` : ""}
${segmentsToHtml(d)}
</article>
</body>
</html>`;
}

export function toMdx(d: Draft): string {
  // MDX uses the same frontmatter as Markdown; content follows directly.
  return toMarkdown(d);
}

export function toJson(d: Draft): string {
  return JSON.stringify(d, null, 2);
}

export function toNewsletterMarkdown(d: Draft): string {
  const n = d.newsletter;
  const header = n.useArticleHeader ? d.headerImage : n.headerImage;
  const lines: string[] = [];
  if (header.url || header.prompt) {
    lines.push(`![${header.alt || "Newsletter header"}](${header.url || "https://placehold.co/1200x600"})\n`);
  }
  if (n.introText) lines.push(`${n.introText}\n`);
  n.previews.forEach((p, i) => {
    lines.push(`---\n`);
    lines.push(`## ${i + 1}. ${p.title}\n`);
    lines.push(`${p.summary}\n`);
    lines.push(`[${p.ctaText || "Read more"}](${p.ctaLink || "#"})\n`);
  });
  if (n.outroText) {
    lines.push(`---\n`);
    lines.push(`${n.outroText}\n`);
  }
  return lines.join("\n");
}

export function toNewsletterHtml(d: Draft): string {
  const n = d.newsletter;
  const header = n.useArticleHeader ? d.headerImage : n.headerImage;
  const previews = n.previews.map((p, i) => `
    <tr><td style="padding:24px 0;border-top:1px solid #e5e0d7;">
      <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 8px;color:#2C1E16;">${i + 1}. ${escapeHtml(p.title)}</h2>
      <p style="font-size:15px;line-height:1.6;color:#5C4D43;margin:0 0 12px;">${escapeHtml(p.summary)}</p>
      <a href="${escapeHtml(p.ctaLink || "#")}" style="display:inline-block;background:#C86F53;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(p.ctaText || "Read more")}</a>
    </td></tr>`).join("");
  return `<!doctype html>
<html><body style="margin:0;background:#F9F7F1;font-family:-apple-system,Helvetica,sans-serif;color:#2C1E16;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;padding:32px 20px;">
  ${header.url || header.prompt ? `<tr><td><img src="${escapeHtml(header.url || "https://placehold.co/1200x600")}" alt="${escapeHtml(header.alt || "")}" style="width:100%;border-radius:12px;display:block;"/></td></tr>` : ""}
  ${n.introText ? `<tr><td style="padding:24px 0;font-size:16px;line-height:1.7;">${escapeHtml(n.introText).replace(/\n/g, "<br/>")}</td></tr>` : ""}
  ${previews}
  ${n.outroText ? `<tr><td style="padding:24px 0;border-top:1px solid #e5e0d7;font-size:15px;line-height:1.7;color:#5C4D43;">${escapeHtml(n.outroText).replace(/\n/g, "<br/>")}</td></tr>` : ""}
</table>
</body></html>`;
}

// ---- Standalone Newsletter exports (Newsletter page) ----
function previewMd(p: NewsletterPreview, idx?: number, featured = false): string {
  const heading = featured ? `## ⭐ ${p.title}` : `### ${idx}. ${p.title}`;
  const lines = [heading, ""];
  if (p.summary) lines.push(p.summary, "");
  lines.push(`[${p.ctaText || "Read more"}](${p.ctaLink || "#"})`, "");
  return lines.join("\n");
}

export function standaloneNewsletterMarkdown(n: StandaloneNewsletter): string {
  const lines: string[] = [];
  if (n.title) lines.push(`# ${n.title}`, "");
  if (n.header.url || n.header.prompt) {
    lines.push(`![${n.header.alt || "Newsletter header"}](${n.header.url || "https://placehold.co/1200x600"})`, "");
  }
  if (n.introText) lines.push(n.introText, "");
  if (n.featured) { lines.push("---", ""); lines.push(previewMd(n.featured, undefined, true)); }
  n.previews.forEach((p, i) => { lines.push("---", ""); lines.push(previewMd(p, i + 1)); });
  if (n.outroText) { lines.push("---", ""); lines.push(n.outroText, ""); }
  return lines.join("\n");
}

function previewHtml(p: NewsletterPreview, label: string, featured = false): string {
  const titleSize = featured ? "26px" : "22px";
  return `
    <tr><td style="padding:24px 0;border-top:1px solid #e5e0d7;">
      ${p.imageAlt || p.imagePrompt ? `<div style="font-size:11px;color:#9b8b7e;margin:0 0 8px;font-style:italic;">[image: ${escapeHtml(p.imageAlt || p.imagePrompt)}]</div>` : ""}
      <h2 style="font-family:Georgia,serif;font-size:${titleSize};margin:0 0 8px;color:#2C1E16;">${label}${escapeHtml(p.title)}</h2>
      <p style="font-size:15px;line-height:1.6;color:#5C4D43;margin:0 0 12px;">${escapeHtml(p.summary)}</p>
      <a href="${escapeHtml(p.ctaLink || "#")}" style="display:inline-block;background:#C86F53;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(p.ctaText || "Read more")}</a>
    </td></tr>`;
}

export function standaloneNewsletterHtml(n: StandaloneNewsletter): string {
  const body =
    (n.featured ? previewHtml(n.featured, "⭐ ", true) : "") +
    n.previews.map((p, i) => previewHtml(p, `${i + 1}. `)).join("");
  return `<!doctype html>
<html><body style="margin:0;background:#F9F7F1;font-family:-apple-system,Helvetica,sans-serif;color:#2C1E16;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;padding:32px 20px;">
  ${n.title ? `<tr><td style="padding:0 0 8px;"><h1 style="font-family:Georgia,serif;font-size:28px;margin:0;color:#2C1E16;">${escapeHtml(n.title)}</h1></td></tr>` : ""}
  ${n.header.url || n.header.prompt ? `<tr><td><img src="${escapeHtml(n.header.url || "https://placehold.co/1200x600")}" alt="${escapeHtml(n.header.alt || "")}" style="width:100%;border-radius:12px;display:block;"/></td></tr>` : ""}
  ${n.introText ? `<tr><td style="padding:24px 0;font-size:16px;line-height:1.7;">${escapeHtml(n.introText).replace(/\n/g, "<br/>")}</td></tr>` : ""}
  ${body}
  ${n.outroText ? `<tr><td style="padding:24px 0;border-top:1px solid #e5e0d7;font-size:15px;line-height:1.7;color:#5C4D43;">${escapeHtml(n.outroText).replace(/\n/g, "<br/>")}</td></tr>` : ""}
</table>
</body></html>`;
}

// Plain paste version for beehiiv / Substack composers (clean, no HTML wrapper).
export function newsletterPlainText(n: StandaloneNewsletter): string {
  const block = (p: NewsletterPreview, prefix = "") =>
    [`${prefix}${p.title}`, p.summary, `→ ${p.ctaText || "Read more"}: ${p.ctaLink || "#"}`].filter(Boolean).join("\n");
  const parts: string[] = [];
  if (n.title) parts.push(n.title.toUpperCase(), "");
  if (n.introText) parts.push(n.introText, "");
  if (n.featured) parts.push("⭐ FEATURED", block(n.featured), "");
  n.previews.forEach((p, i) => parts.push(block(p, `${i + 1}. `), ""));
  if (n.outroText) parts.push("—", n.outroText);
  return parts.join("\n");
}


export function buildLlmPrompt(d: Draft, styleSystem: string): string {
  const lines: string[] = [];
  lines.push("SYSTEM:\n" + styleSystem + "\n");
  lines.push("BRIEF:");
  lines.push(JSON.stringify(d.brief, null, 2));
  lines.push("\nBLOCK ORDER:");
  d.blocks.forEach((b, i) => lines.push(`${i + 1}. ${b.type} — ${b.note || ""}`));
  lines.push("\nAFFILIATE:");
  lines.push(JSON.stringify(d.affiliate, null, 2));
  return lines.join("\n");
}

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function wordCount(d: Draft): number {
  const all = d.blocks.map(b => (b.content || "")).join(" ");
  return all.trim() ? all.trim().split(/\s+/).length : 0;
}

export function readingTime(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

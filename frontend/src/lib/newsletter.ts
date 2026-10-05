// Newsletter cards built from articles, and the links they point to.
import type { Draft, NewsletterPreview } from "@/types";
import { getDraft, loadNewsletter, saveNewsletter, uid } from "@/lib/storage";
import { articleTitle, articleUrl, isAbsoluteUrl } from "@/lib/seo";

export function draftToPreview(d: Draft): NewsletterPreview {
  const prologue = d.blocks.find(b => b.type === "prologue")?.content || "";
  return {
    id: uid("nv"),
    title: articleTitle(d),
    summary: d.brief.metaDescription || prologue.slice(0, 240),
    ctaText: "Read the full article",
    ctaLink: articleUrl(d),
    imagePrompt: d.headerImage.prompt || "",
    imageAlt: d.headerImage.alt || "",
    sourceDraftId: d.id,
  };
}

// The link a card should use in the email. A full URL typed on the card wins; otherwise a
// card made from an article follows that article's current URL (so setting the Article URL
// in Settings later fixes old cards too). Empty means "no link": relative links like
// "/blog/x" don't work in email, so they're never used.
export function cardLink(p: NewsletterPreview): string {
  if (isAbsoluteUrl(p.ctaLink)) return p.ctaLink.trim();
  const d = p.sourceDraftId ? getDraft(p.sourceDraftId) : null;
  return d ? articleUrl(d) : "";
}

// Adds an article to the saved newsletter as a card. Returns false if it's already in it.
export function addDraftToNewsletter(d: Draft): boolean {
  const nl = loadNewsletter();
  if (nl.featured?.sourceDraftId === d.id || nl.previews.some(p => p.sourceDraftId === d.id)) return false;
  saveNewsletter({ ...nl, previews: [...nl.previews, draftToPreview(d)] });
  return true;
}

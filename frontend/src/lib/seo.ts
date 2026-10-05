// One source of truth for SEO lengths, slugs and titles, shared by the editor, Finalize,
// and every export. The limits match backend/server.py.
import type { Draft } from "@/types";

// Google cuts titles at roughly 60 characters and meta descriptions at roughly 160.
// It measures pixels, so these are safe character budgets rather than exact cutoffs.
export const SEO_TITLE_MAX = 60;
export const META_DESCRIPTION_MIN = 150;
export const META_DESCRIPTION_MAX = 160;
export const SLUG_MAX = 60;

// Counts characters the way a reader sees them: an emoji or accented letter is 1, not 2.
export function charCount(s: string | undefined): number {
  return [...(s || "").trim()].length;
}

// "Café & Crème Brûlée: 10 Tips!" -> "cafe-and-creme-brulee-10-tips"
export function slugify(input: string, max = SLUG_MAX): string {
  let slug = (input || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > max) {
    const cut = slug.slice(0, max + 1);
    slug = cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : slug.slice(0, max);
  }
  return slug.replace(/-+$/g, "");
}

export function articleTitle(d: Draft): string {
  return d.blocks.find(b => b.type === "title")?.content?.trim() || d.brief.topic?.trim() || "Untitled";
}

// The search result title: the dedicated SEO title if set, otherwise the article title.
export function seoTitle(d: Draft): string {
  return d.brief.seoTitle?.trim() || articleTitle(d);
}

export function articleSlug(d: Draft): string {
  return slugify(d.brief.slug || articleTitle(d)) || "untitled";
}

export function isAbsoluteUrl(url: string | undefined): boolean {
  return /^https?:\/\/\S+$/i.test((url || "").trim());
}

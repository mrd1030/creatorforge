// Core CreatorForge types
// Built-in style ids plus any custom style id (e.g. "cstyle_xxx").
export type StyleId = string;

export interface CustomStyle {
  id: string;
  name: string;
  tagline: string;
  vibe: string;
  systemPrompt: string;
}

export interface AppSettings {
  defaultStyleId: string;
  defaultCategories: string[];
  defaultAffiliateEnabled: boolean;
  defaultNiche: string;
  authorName: string;
}

export type BlockType =
  | "title"
  | "prologue"
  | "paragraph"
  | "tips"
  | "pros-cons"
  | "key-facts"
  | "image"
  | "table"
  | "chart"
  | "cta"
  | "conclusion"
  | "custom"
  | "resources"
  | "references"
  | "affiliate"
  | "ending";

export interface Block {
  id: string;
  type: BlockType;
  label?: string;
  note?: string;
  content?: string;
  imagePrompt?: string;
  imageAlt?: string;
  imageUrl?: string;
  caption?: string;
}

export interface Brief {
  topic: string;
  audience: string;
  length: string;
  keyPoints: string;
  angle: string;
  extra: string;
  focusKeyword: string;
  metaDescription: string;
  factsToUse: string;
  categories: string[];
  tags: string[];
  slug: string;
  canonicalUrl: string;
  // Content niche (Pet Care, Finance, Travel, ...) — drives the category list and
  // is sent to the backend so generation prompts know what they're writing for.
  niche: string;
}

export interface HeaderImage {
  prompt: string;
  alt: string;
  url?: string;
}

export interface AffiliateConfig {
  enabled: boolean;
  placement: "after-title" | "bottom-section" | "manual";
  type: "amazon" | "chewy" | "other";
  text: string;
}

export interface NewsletterPreview {
  id: string;
  title: string;
  summary: string;
  ctaText: string;
  ctaLink: string;
  imagePrompt: string;
  imageAlt: string;
  sourceDraftId?: string;
}

export interface Newsletter {
  headerImage: HeaderImage;
  introText: string;
  outroText: string;
  previews: NewsletterPreview[];
  useArticleHeader: boolean;
}

export interface Version {
  id: string;
  ts: number;
  label: string;
  blocks: Block[];
}

export interface Draft {
  id: string;
  createdAt: number;
  updatedAt: number;
  styleId: StyleId;
  brief: Brief;
  blocks: Block[];
  headerImage: HeaderImage;
  affiliate: AffiliateConfig;
  newsletter: Newsletter;
  versions: Version[];
  llmPrompt?: string;
}

// Standalone Newsletter document (separate from a single article draft)
export interface StandaloneNewsletter {
  title: string;
  header: HeaderImage;
  introText: string;
  outroText: string;
  featured: NewsletterPreview | null;
  previews: NewsletterPreview[];
  updatedAt: number;
}

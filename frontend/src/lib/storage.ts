import type { Draft, Brief, AffiliateConfig, HeaderImage, Newsletter, StyleId, CustomStyle, AppSettings, StandaloneNewsletter } from "@/types";
import { DEFAULT_AFFILIATE_TEXT } from "@/lib/templates";

const KEYS = {
  DRAFTS: "bf.drafts.v1",
  CURRENT: "bf.currentDraftId.v1",
  THEME: "bf.theme.v1",
  CUSTOM_CATEGORIES: "bf.customCategories.v1",
  CUSTOM_STYLES: "bf.customStyles.v1",
  SETTINGS: "bf.settings.v1",
  NEWSLETTER: "bf.newsletter.v1",
};

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function emptyBrief(): Brief {
  return {
    topic: "", audience: "", length: "medium",
    keyPoints: "", angle: "", extra: "",
    focusKeyword: "", metaDescription: "", factsToUse: "",
    categories: [], tags: [], slug: "", canonicalUrl: "",
    niche: "Pet Care",
  };
}

export function emptyHeader(): HeaderImage { return { prompt: "", alt: "", url: "" }; }

export function emptyAffiliate(): AffiliateConfig {
  return { enabled: true, placement: "bottom-section", text: DEFAULT_AFFILIATE_TEXT };
}

export function emptyNewsletter(): Newsletter {
  return {
    headerImage: emptyHeader(),
    introText: "",
    outroText: "",
    previews: [],
    useArticleHeader: true,
  };
}

export function newDraft(styleId?: StyleId): Draft {
  const now = Date.now();
  const settings = loadSettings();
  const brief = emptyBrief();
  brief.categories = [...settings.defaultCategories];
  brief.niche = settings.defaultNiche || "Pet Care";
  const aff = emptyAffiliate();
  aff.enabled = settings.defaultAffiliateEnabled;
  return {
    id: uid("draft"),
    createdAt: now, updatedAt: now,
    styleId: styleId || settings.defaultStyleId || "real-person",
    brief,
    blocks: [],
    headerImage: emptyHeader(),
    affiliate: aff,
    newsletter: emptyNewsletter(),
    versions: [],
  };
}

export function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(KEYS.DRAFTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveDrafts(drafts: Draft[]) {
  localStorage.setItem(KEYS.DRAFTS, JSON.stringify(drafts));
}

export function upsertDraft(draft: Draft) {
  const list = loadDrafts();
  const idx = list.findIndex(d => d.id === draft.id);
  draft.updatedAt = Date.now();
  if (idx >= 0) list[idx] = draft; else list.unshift(draft);
  saveDrafts(list);
}

export function deleteDraft(id: string) {
  const list = loadDrafts().filter(d => d.id !== id);
  saveDrafts(list);
  if (getCurrentDraftId() === id) setCurrentDraftId(null);
}

export function getDraft(id: string): Draft | null {
  return loadDrafts().find(d => d.id === id) || null;
}

export function getCurrentDraftId(): string | null {
  return localStorage.getItem(KEYS.CURRENT);
}
export function setCurrentDraftId(id: string | null) {
  if (id) localStorage.setItem(KEYS.CURRENT, id);
  else localStorage.removeItem(KEYS.CURRENT);
}

export function loadCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(KEYS.CUSTOM_CATEGORIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function saveCustomCategories(c: string[]) {
  localStorage.setItem(KEYS.CUSTOM_CATEGORIES, JSON.stringify(c));
}

// ---- Custom writing styles ----
export function loadCustomStyles(): CustomStyle[] {
  try {
    const raw = localStorage.getItem(KEYS.CUSTOM_STYLES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function saveCustomStyles(styles: CustomStyle[]) {
  localStorage.setItem(KEYS.CUSTOM_STYLES, JSON.stringify(styles));
}
export function upsertCustomStyle(style: CustomStyle) {
  const list = loadCustomStyles();
  const idx = list.findIndex(s => s.id === style.id);
  if (idx >= 0) list[idx] = style; else list.push(style);
  saveCustomStyles(list);
}
export function deleteCustomStyle(id: string) {
  saveCustomStyles(loadCustomStyles().filter(s => s.id !== id));
}

// ---- App settings ----
export function defaultSettings(): AppSettings {
  return { defaultStyleId: "real-person", defaultCategories: [], defaultAffiliateEnabled: false, defaultNiche: "Pet Care", authorName: "" };
}
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings();
  } catch { return defaultSettings(); }
}
export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));
}

// ---- Standalone newsletter ----
export function emptyStandaloneNewsletter(): StandaloneNewsletter {
  return {
    title: "This week's newsletter",
    header: emptyHeader(),
    introText: "",
    outroText: "",
    featured: null,
    previews: [],
    updatedAt: Date.now(),
  };
}
export function loadNewsletter(): StandaloneNewsletter {
  try {
    const raw = localStorage.getItem(KEYS.NEWSLETTER);
    return raw ? { ...emptyStandaloneNewsletter(), ...JSON.parse(raw) } : emptyStandaloneNewsletter();
  } catch { return emptyStandaloneNewsletter(); }
}
export function saveNewsletter(n: StandaloneNewsletter) {
  n.updatedAt = Date.now();
  localStorage.setItem(KEYS.NEWSLETTER, JSON.stringify(n));
}

export const THEME_KEY = KEYS.THEME;

import { WRITING_STYLES } from "@/lib/templates";
import { loadCustomStyles } from "@/lib/storage";
import type { StyleId } from "@/types";

export interface StyleOption {
  id: string;
  name: string;
  tagline: string;
  vibe: string;
  color: string;
  custom?: boolean;
}

// Built-in styles + user-defined custom styles, in one list.
export function getAllStyles(): StyleOption[] {
  const custom = loadCustomStyles().map(s => ({
    id: s.id, name: s.name, tagline: s.tagline, vibe: s.vibe, color: "slate", custom: true,
  }));
  return [...WRITING_STYLES.map(s => ({ ...s, custom: false })), ...custom];
}

export function getStyleById(id: StyleId): StyleOption | undefined {
  return getAllStyles().find(s => s.id === id);
}

// System prompt override for custom styles (undefined for built-ins).
export function getStyleInstructions(id: StyleId): string | undefined {
  const c = loadCustomStyles().find(s => s.id === id);
  return c?.systemPrompt?.trim() || undefined;
}

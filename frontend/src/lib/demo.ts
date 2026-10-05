// Public demo support (demo branch only; the template on `main` never ships this).
// The backend's /api/demo route reports each visitor's daily allowances and which features are
// locked or hidden. On a normal deployment that route doesn't exist, so demo mode stays off.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { loadDrafts, upsertDraft } from "@/lib/storage";
import { sampleDraft } from "@/lib/sampleDraft";

export interface DemoFeature { label: string; limit: number; remaining: number }
export interface DemoStatus {
  demo: boolean;
  buyUrl: string;
  features: Record<string, DemoFeature>;
  maxArticleBlocks: number;
  locked: string[];
  hidden: string[];
}

const OFF: DemoStatus = { demo: false, buyUrl: "", features: {}, maxArticleBlocks: 0, locked: [], hidden: [] };
const SEEDED_KEY = "bf.demoSeeded.v1";
const API = `${import.meta.env.VITE_BACKEND_URL}/api`;

let status: DemoStatus = OFF;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// First demo visit: add a finished sample article so Finalize, the chart, exports and the
// newsletter preview can be explored without spending any API calls.
function seedSampleOnce() {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    localStorage.setItem(SEEDED_KEY, "1");
    if (loadDrafts().length === 0) upsertDraft(sampleDraft());
  } catch { /* storage unavailable: skip the sample */ }
}

export async function refreshDemo(): Promise<void> {
  try {
    const resp = await fetch(`${API}/demo`);
    if (!resp.ok) return;
    const next = await resp.json();
    if (!next?.demo) return;
    if (!status.demo) seedSampleOnce();
    status = next;
    listeners.forEach(fn => fn());
  } catch { /* backend unreachable: leave demo state as is */ }
}

export function useDemo(): DemoStatus {
  return useSyncExternalStore(subscribe, () => status);
}

export function isLocked(s: DemoStatus, feature: string) { return s.demo && s.locked.includes(feature); }
export function isHidden(s: DemoStatus, feature: string) { return s.demo && s.hidden.includes(feature); }

const LOCKED_TEXT: Record<string, { title: string; description: string }> = {
  stream_all: {
    title: "Live streaming is in the full template",
    description: "It writes each block in front of you, one after another, and lets you cancel mid-article.",
  },
  polish_all: {
    title: "Polish Entire Article is in the full template",
    description: "It runs a voice pass over every block in one click. In the demo, polish blocks one at a time.",
  },
};

export function showLocked(feature: string) {
  const text = LOCKED_TEXT[feature] || { title: "This feature is in the full template", description: "" };
  const { buyUrl } = status;
  toast.info(text.title, {
    description: text.description,
    action: buyUrl ? { label: "Get it", onClick: () => window.open(buyUrl, "_blank", "noopener") } : undefined,
  });
}

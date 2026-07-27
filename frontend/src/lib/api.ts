import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, timeout: 120000 });

export async function generateBlock(payload: any): Promise<{ text: string }> {
  const { data } = await client.post("/generate/block", payload);
  return data;
}

export async function generateArticle(payload: any): Promise<{ results: Record<string, string> }> {
  const { data } = await client.post("/generate/article", payload);
  return data;
}

export async function humanize(text: string, styleId: string, styleInstructions?: string): Promise<{ text: string }> {
  const { data } = await client.post("/humanize", { text, styleId, styleInstructions });
  return data;
}

export async function generateMeta(title: string, content: string, focusKeyword: string): Promise<{ text: string }> {
  const { data } = await client.post("/generate/meta", { title, content, focusKeyword });
  return data;
}

export async function generateSeo(payload: { title?: string; topic?: string; content?: string; focusKeyword?: string }): Promise<{ focusKeyword: string; metaDescription: string }> {
  const { data } = await client.post("/generate/seo", payload);
  return data;
}

export async function generateImagePrompt(payload: { topic: string; angle?: string; styleId?: string; blockNote?: string }): Promise<{ prompt: string; alt: string }> {
  const { data } = await client.post("/generate/image-prompt", payload);
  return data;
}

export async function generateNewsletterPreview(payload: any) {
  const { data } = await client.post("/generate/newsletter-preview", payload);
  return data;
}

export async function generateSocial(payload: any) {
  const { data } = await client.post("/generate/social", payload);
  return data;
}

export async function generateYoutube(payload: any) {
  const { data } = await client.post("/generate/youtube", payload);
  return data;
}

export async function suggestLayout(payload: any) {
  const { data } = await client.post("/layout/suggest", payload);
  return data;
}

export async function generateFacts(payload: { topic: string; niche?: string }): Promise<{ factsToUse: string }> {
  const { data } = await client.post("/generate/facts", payload);
  return data;
}

export async function generateBrief(payload: { topic: string; styleId: string; niche?: string }): Promise<{
  audience: string;
  keyPoints: string;
  angle: string;
  focusKeyword: string;
  metaDescription: string;
  categories: string[];
  tags: string[];
  factsToUse: string;
}> {
  const { data } = await client.post("/generate/brief", payload);
  return data;
}

export async function processArticle(payload: { text: string; styleId: string; niche?: string }): Promise<{
  title: string;
  blocks: { type: string; content: string }[];
  audience: string;
  keyPoints: string;
  angle: string;
  focusKeyword: string;
  metaDescription: string;
  tags: string[];
  categories: string[];
  factsToUse?: string;
}> {
  const { data } = await client.post("/process/article", payload);
  return data;
}

export async function sendEmail(payload: { recipient_email: string; subject: string; html_content: string }) {
  const { data } = await client.post("/send-email", payload);
  return data;
}

// Token-by-token streaming for a single block via SSE.
export async function streamBlock(
  payload: any,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const resp = await fetch(`${API}/generate/block/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok || !resp.body) throw new Error(`Stream failed (${resp.status})`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payloadStr = line.slice(5).trim();
      if (!payloadStr) continue;
      const evt = JSON.parse(payloadStr);
      if (evt.error) throw new Error(evt.error);
      if (evt.delta) onDelta(evt.delta);
      if (evt.done) return;
    }
  }
}

// Parses the "chart" block's content — a description sentence followed by a
// ```json {"labels":[...],"values":[...]} ``` snippet, per BLOCK_INSTRUCTIONS["chart"]
// in the backend — into structured data for real chart rendering.
export interface ChartData {
  description: string;
  labels: string[];
  values: number[];
}

export function parseChartBlock(content: string | undefined): ChartData | null {
  const text = (content || "").trim();
  if (!text) return null;
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }

  const labels = Array.isArray(parsed?.labels) ? parsed.labels.map((l: any) => String(l)) : null;
  const values = Array.isArray(parsed?.values) ? parsed.values.map((v: any) => Number(v)) : null;
  if (
    !labels || !values ||
    labels.length === 0 ||
    labels.length !== values.length ||
    values.some((v: number) => !Number.isFinite(v))
  ) {
    return null;
  }

  return { description: text.slice(0, match.index).trim(), labels, values };
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Dependency-free static SVG bar chart, for contexts (the standalone HTML export)
// that can't run React/recharts. Falls back to the light-theme accent color when
// the destination page doesn't define --chart-1 itself.
export function chartToSvg(data: { labels: string[]; values: number[] }): string {
  const width = 640;
  const height = 320;
  const padding = { top: 20, right: 16, bottom: 36, left: 16 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.values, 0) || 1;
  const n = data.values.length;
  const gap = 12;
  const barW = Math.max(8, Math.min(48, (chartW - gap * (n - 1)) / n));
  const totalBarsW = barW * n + gap * Math.max(0, n - 1);
  const startX = padding.left + (chartW - totalBarsW) / 2;

  const bars = data.values.map((v, i) => {
    const barH = (Math.max(0, v) / maxVal) * chartH;
    const x = startX + i * (barW + gap);
    const y = padding.top + (chartH - barH);
    const label = escapeXml(data.labels[i] ?? "");
    return (
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="var(--chart-1, #C86F53)" />` +
      `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="12" fill="#2C1E16">${escapeXml(String(v))}</text>` +
      `<text x="${(x + barW / 2).toFixed(1)}" y="${(padding.top + chartH + 20).toFixed(1)}" text-anchor="middle" font-size="12" fill="#5C4D43">${label}</text>`
    );
  }).join("");

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bar chart">` +
    `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#E8E2D9" stroke-width="1" />` +
    bars +
    `</svg>`
  );
}

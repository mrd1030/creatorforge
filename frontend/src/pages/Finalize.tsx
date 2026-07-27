import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { ArrowLeft, Copy, Download, Smartphone, Monitor, Loader2, Wand2, DatabaseZap, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { getDraft } from "@/lib/storage";
import type { Draft } from "@/types";
import {
  toMarkdown, toMarkdownBody, toHtml, toMdx, toJson,
  toNewsletterMarkdown, toNewsletterHtml,
  mdToHtml, downloadFile, copyToClipboard, buildLlmPrompt, toContentSegments
} from "@/lib/exports";
import { parseChartBlock } from "@/lib/chart";
import { ChartBlockView } from "@/components/ChartBlockView";
import { generateSocial, generateYoutube } from "@/lib/api";
import { pushToSanity, loadSanityToken, isSanityConfigured, getSanityStudioUrl } from "@/lib/sanity";
import { getStyleInstructions } from "@/lib/styles";

export default function Finalize() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<"desktop" | "mobile">(window.innerWidth < 768 ? "mobile" : "desktop");
  const [activeExport, setActiveExport] = useState("html");
  const [social, setSocial] = useState<any>(null);
  const [youtube, setYoutube] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [sanityBusy, setSanityBusy] = useState(false);
  const sanityToken = loadSanityToken();

  useEffect(() => {
    if (id) {
      const d = getDraft(id);
      if (d) setDraft(d); else navigate("/dashboard");
    }
  }, [id, navigate]);

  // Chart blocks render as a real chart component instead of a raw JSON dump —
  // see lib/exports.ts#toContentSegments.
  const previewSegments = useMemo(() => {
    if (!draft) return [];
    return toContentSegments(draft).map((seg, i) => {
      if (seg.kind === "chart") {
        return { key: `chart-${i}`, kind: "chart" as const, data: parseChartBlock(seg.block.content)! };
      }
      return {
        key: `html-${i}`,
        kind: "html" as const,
        html: DOMPurify.sanitize(mdToHtml(seg.markdown), { ADD_ATTR: ["target", "rel"] }),
      };
    });
  }, [draft]);

  if (!draft) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;

  const title = draft.blocks.find(b => b.type === "title")?.content || draft.brief.topic || "Untitled article";

  // Generate slug and published URL
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);

  const publishedUrl = `/blog/${slug}`;

  const exports = {
    html:       { label: "HTML",         ext: "html", mime: "text/html",        content: () => toHtml(draft) },
    markdown:   { label: "Markdown",     ext: "md",   mime: "text/markdown",    content: () => toMarkdown(draft) },
    mdx:        { label: "MDX",          ext: "mdx",  mime: "text/markdown",    content: () => toMdx(draft) },
    json:       { label: "Structured JSON", ext: "json", mime: "application/json", content: () => toJson(draft) },
    youtube:    { label: "YouTube Script",  ext: "txt",  mime: "text/plain",      content: () => youtube || "Click 'Generate' to draft a YouTube Shorts script." },
    social:     { label: "Social Snippets", ext: "json", mime: "application/json", content: () => JSON.stringify(social ?? {}, null, 2) },
    newsletter: { label: "Email Newsletter (HTML)", ext: "html", mime: "text/html", content: () => toNewsletterHtml(draft) },
    "newsletter-md": { label: "Email Newsletter (MD)", ext: "md", mime: "text/markdown", content: () => toNewsletterMarkdown(draft) },
    prompt:     { label: "Full LLM Prompt Used", ext: "txt", mime: "text/plain", content: () => buildLlmPrompt(draft, draft.styleId) },
  };

  const handleCopy = async (key: string) => {
    const c = (exports as any)[key].content();
    await copyToClipboard(c);
    toast.success("Copied to clipboard");
  };

  const handleDownload = (key: string) => {
    const e = (exports as any)[key];
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    downloadFile(`${slug}.${e.ext}`, e.content(), e.mime);
  };

  const onGenerateSocial = async () => {
    setBusy(true);
    const t = toast.loading("Drafting social snippets…");
    try {
      const r = await generateSocial({
        title, metaDescription: draft.brief.metaDescription,
        content: toMarkdownBody(draft), styleId: draft.styleId,
        styleInstructions: getStyleInstructions(draft.styleId),
      });
      setSocial(r);
      toast.success("Social posts ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
    finally { setBusy(false); }
  };

  const onPushToSanity = async () => {
    if (!sanityToken) { toast.error("Add your Sanity token in Settings first"); return; }
    setSanityBusy(true);
    const t = toast.loading("Pushing to Sanity…");
    try {
      const docId = await pushToSanity(draft!, sanityToken);
      const studioUrl = getSanityStudioUrl(docId);
      toast.success("Pushed to Sanity as draft", {
        id: t,
        description: "Open Sanity Studio to review and publish.",
        action: { label: "Open Studio", onClick: () => window.open(studioUrl, "_blank") },
        duration: 8000,
      });
    } catch (e: any) {
      toast.error("Sanity push failed", { id: t, description: e?.message });
    } finally { setSanityBusy(false); }
  };

  const onGenerateYoutube = async () => {
    setBusy(true);
    const t = toast.loading("Writing YouTube Shorts script…");
    try {
      const r = await generateYoutube({
        title, content: toMarkdownBody(draft), styleId: draft.styleId,
        styleInstructions: getStyleInstructions(draft.styleId),
      });
      setYoutube(r.text);
      toast.success("Script ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/edit/${draft.id}`)} data-testid="finalize-back-btn">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to editor
          </Button>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Finalize</div>
            <div className="font-display text-2xl">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="rounded-full">{draft.styleId}</Badge>
          {isSanityConfigured() && sanityToken && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPushToSanity}
              disabled={sanityBusy}
              className="border-red-400/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
              data-testid="push-to-sanity-btn"
            >
              {sanityBusy
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <DatabaseZap className="w-3.5 h-3.5 mr-1.5" />}
              Push to Sanity
            </Button>
          )}
          {isSanityConfigured() && !sanityToken && (
            <Button size="sm" variant="ghost" asChild className="text-muted-foreground text-xs">
              <a href="/settings"><ExternalLink className="w-3 h-3 mr-1" /> Connect Sanity</a>
            </Button>
          )}
        </div>
      </div>

      {/* Published URL */}
      <Card className="mb-6 border-primary/30">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Published URL</div>
              <div className="font-mono text-sm break-all">{publishedUrl}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                copyToClipboard(publishedUrl);
                toast.success("URL copied to clipboard");
              }}
              data-testid="copy-published-url-btn"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy URL
            </Button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Slug: <span className="font-mono">{slug}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="final" className="w-full">
        <TabsList data-testid="finalize-tabs">
          <TabsTrigger value="final" data-testid="finalize-tab-preview">Final View</TabsTrigger>
          <TabsTrigger value="export" data-testid="finalize-tab-export">Code Export</TabsTrigger>
        </TabsList>

        {/* Final View Tab */}
        <TabsContent value="final" className="mt-5">
          <div className="flex items-center justify-end mb-4 gap-2">
            <Button
              variant={view === "desktop" ? "default" : "outline"}
              size="sm"
              className={view === "desktop" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
              onClick={() => setView("desktop")}
              data-testid="view-desktop-btn"
            >
              <Monitor className="w-4 h-4 mr-1.5" /> Desktop
            </Button>
            <Button
              variant={view === "mobile" ? "default" : "outline"}
              size="sm"
              className={view === "mobile" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}
              onClick={() => setView("mobile")}
              data-testid="view-mobile-btn"
            >
              <Smartphone className="w-4 h-4 mr-1.5" /> Mobile phone
            </Button>
          </div>

          <motion.div layout className="flex justify-center">
            {view === "desktop" ? (
              <Card className="w-full max-w-3xl" data-testid="preview-desktop">
                <CardContent className="p-8 sm:p-10">
                  {(draft.headerImage.url || draft.headerImage.prompt) && (
                    <div className="aspect-[16/9] rounded-xl overflow-hidden mb-6 bg-muted">
                      {draft.headerImage.url ? (
                        <img src={draft.headerImage.url} alt={draft.headerImage.alt} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-muted-foreground text-sm p-6 text-center">
                          {draft.headerImage.prompt}
                        </div>
                      )}
                    </div>
                  )}
                  <article className="bf-prose" data-testid="article-prose">
                    {previewSegments.map(seg => seg.kind === "chart"
                      ? <ChartBlockView key={seg.key} data={seg.data} />
                      : <div key={seg.key} dangerouslySetInnerHTML={{ __html: seg.html }} />
                    )}
                  </article>
                </CardContent>
              </Card>
            ) : (
              <div className="phone-frame" data-testid="preview-mobile">
                <div className="phone-screen">
                  <div className="h-full overflow-y-auto bf-scroll" data-testid="phone-scroll">
                    {(draft.headerImage.url || draft.headerImage.prompt) && (
                      <div className="aspect-[16/9] bg-muted overflow-hidden">
                        {draft.headerImage.url ? (
                          <img src={draft.headerImage.url} alt={draft.headerImage.alt} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground text-[10px] p-3 text-center">
                            {draft.headerImage.alt || "Header preview"}
                          </div>
                        )}
                      </div>
                    )}
                    <article className="bf-prose p-4 text-sm">
                      {previewSegments.map(seg => seg.kind === "chart"
                        ? <ChartBlockView key={seg.key} data={seg.data} />
                        : <div key={seg.key} dangerouslySetInnerHTML={{ __html: seg.html }} />
                      )}
                    </article>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </TabsContent>

        {/* Code Export Tab - FULL VERSION */}
        <TabsContent value="export" className="mt-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {Object.entries(exports).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setActiveExport(k)}
                    data-testid={`export-tab-${k}`}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-border last:border-b-0 transition-colors ${
                      activeExport === k ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-9">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <div className="font-display text-xl">{(exports as any)[activeExport].label}</div>
                      <p className="text-xs text-muted-foreground">Ready to paste into your CMS or email tool.</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {activeExport === "social" && (
                        <Button size="sm" variant="outline" onClick={onGenerateSocial} disabled={busy} data-testid="generate-social-btn">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
                          {social ? "Regenerate" : "Generate"}
                        </Button>
                      )}
                      {activeExport === "youtube" && (
                        <Button size="sm" variant="outline" onClick={onGenerateYoutube} disabled={busy} data-testid="generate-youtube-btn">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
                          {youtube ? "Regenerate" : "Generate"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleCopy(activeExport)} data-testid={`copy-${activeExport}-btn`}>
                        <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={() => handleDownload(activeExport)}
                        data-testid={`download-${activeExport}-btn`}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                      </Button>
                    </div>
                  </div>

                  {activeExport === "social" && social && (
                    <div className="mb-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      {(["x", "instagram", "facebook"] as const).map(k => (
                        <div key={k} className="rounded-lg border border-border bg-muted/30 p-3" data-testid={`social-${k}-card`}>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{k}</div>
                          <Textarea
                            rows={5}
                            value={social[k] || ""}
                            onChange={(e) => setSocial({ ...social, [k]: e.target.value })}
                            className="font-mono text-xs"
                            data-testid={`social-${k}-text`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <Textarea
                    readOnly
                    rows={20}
                    value={(exports as any)[activeExport].content()}
                    className="font-mono text-xs leading-relaxed bf-scroll"
                    data-testid={`export-content-${activeExport}`}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 text-center text-xs text-muted-foreground">
        <Link to={`/edit/${draft.id}`} className="hover:underline">Back to the editor</Link>
      </div>
    </div>
  );
}
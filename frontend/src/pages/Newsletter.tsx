import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import {
  GripVertical, Plus, Trash2, Pencil, Image as ImageIcon, Star, FileText,
  Copy, Download, Mail, Sparkles, Send, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { loadNewsletter, saveNewsletter, loadDrafts, uid } from "@/lib/storage";
import { generateImagePrompt, generateNewsletterPreview, sendEmail } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";
import { isHidden, useDemo } from "@/lib/demo";
import { slugify } from "@/lib/seo";
import { cardLink, draftToPreview } from "@/lib/newsletter";
import {
  standaloneNewsletterHtml, standaloneNewsletterMarkdown, newsletterPlainText,
  copyToClipboard, downloadFile,
} from "@/lib/exports";
import type { StandaloneNewsletter, NewsletterPreview, Draft } from "@/types";


export default function Newsletter() {
  const demo = useDemo();
  const [nl, setNl] = useState<StandaloneNewsletter>(loadNewsletter());
  const [editId, setEditId] = useState<string | null>(null); // "featured" or preview id
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickMode, setPickMode] = useState<"featured" | "preview">("preview");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [exportTab, setExportTab] = useState("html");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => saveNewsletter(nl), 400);
    return () => clearTimeout(t);
  }, [nl]);

  const update = (patch: Partial<StandaloneNewsletter>) => setNl(prev => ({ ...prev, ...patch }));
  const updateHeader = (patch: Partial<StandaloneNewsletter>["header"]) => setNl(prev => ({ ...prev, header: { ...prev.header, ...patch } }));

  const editingPreview: NewsletterPreview | null =
    editId === "featured" ? nl.featured : (nl.previews.find(p => p.id === editId) || null);

  const updatePreview = (patch: Partial<NewsletterPreview>) => {
    if (editId === "featured") update({ featured: nl.featured ? { ...nl.featured, ...patch } : null });
    else update({ previews: nl.previews.map(p => p.id === editId ? { ...p, ...patch } : p) });
  };

  const openPicker = (mode: "featured" | "preview") => {
    setDrafts(loadDrafts());
    setPickMode(mode);
    setPickerOpen(true);
  };

  const addFromDraft = (d: Draft) => {
    const p = draftToPreview(d);
    if (pickMode === "featured") { update({ featured: p }); toast.success("Featured article set", { description: p.title }); }
    else { update({ previews: [...nl.previews, p] }); toast.success("Preview added", { description: p.title }); }
    setPickerOpen(false);
  };

  const addBlankPreview = () => update({
    previews: [...nl.previews, {
      id: uid("nv"), title: "New preview card", summary: "",
      ctaText: "Read the full guide", ctaLink: "#", imagePrompt: "", imageAlt: "",
    }],
  });

  const removePreview = (id: string) => update({ previews: nl.previews.filter(p => p.id !== id) });

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    const arr = [...nl.previews];
    const [moved] = arr.splice(r.source.index, 1);
    arr.splice(r.destination.index, 0, moved);
    update({ previews: arr });
  };

  const regenImg = async () => {
    if (!editingPreview) return;
    const t = toast.loading("Generating image prompt…");
    try {
      const r = await generateImagePrompt({ topic: editingPreview.title, angle: editingPreview.summary, styleId: "newsletter" });
      updatePreview({ imagePrompt: r.prompt, imageAlt: r.alt });
      toast.success("Image prompt ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
  };

  // Rewrites a card's summary with AI, from its source article when it has one.
  const writeSummary = async () => {
    if (!editingPreview) return;
    const src = editingPreview.sourceDraftId ? loadDrafts().find(d => d.id === editingPreview.sourceDraftId) : undefined;
    const t = toast.loading("Writing a summary…");
    try {
      const r = await generateNewsletterPreview({
        title: editingPreview.title,
        metaDescription: src?.brief.metaDescription || editingPreview.summary,
        keyPoints: src?.brief.keyPoints || "",
        headerImagePrompt: editingPreview.imagePrompt,
        styleId: "newsletter",
      });
      updatePreview({ summary: r.summary || editingPreview.summary, ctaText: r.ctaText || editingPreview.ctaText });
      toast.success("Summary ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
  };

  const linklessCards = [nl.featured, ...nl.previews].filter((p): p is NewsletterPreview => !!p && !cardLink(p)).length;

  const exports: Record<string, { label: string; ext: string; mime: string; content: () => string }> = {
    html: { label: "Email HTML", ext: "html", mime: "text/html", content: () => standaloneNewsletterHtml(nl) },
    markdown: { label: "Markdown", ext: "md", mime: "text/markdown", content: () => standaloneNewsletterMarkdown(nl) },
    plain: { label: "Plain (beehiiv / Substack)", ext: "txt", mime: "text/plain", content: () => newsletterPlainText(nl) },
  };

  const doCopy = async () => { await copyToClipboard(exports[exportTab].content()); toast.success("Copied to clipboard"); };
  const doDownload = () => { const e = exports[exportTab]; downloadFile(`${slugify(nl.title) || "newsletter"}.${e.ext}`, e.content(), e.mime); };

  const sendTest = async () => {
    const email = testEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error("Enter a valid email address"); return; }
    setSending(true);
    const t = toast.loading(`Sending a test to ${email}…`);
    try {
      const r = await sendEmail({ recipient_email: email, subject: nl.title || `Your ${APP_NAME} newsletter`, html_content: standaloneNewsletterHtml(nl) });
      toast.success("Test email sent", { id: t, description: r?.message });
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "Failed to send";
      toast.error("Couldn't send", { id: t, description: detail });
    } finally { setSending(false); }
  };

  const PreviewCard = ({ p, idx, featured }: { p: NewsletterPreview; idx?: number; featured?: boolean }) => (
    <div className={`rounded-xl border bg-card overflow-hidden flex ${featured ? "border-primary/60 ring-1 ring-primary/20" : "border-border"}`}
      data-testid={featured ? "featured-card" : `preview-card-${p.id}`}>
      <div className="w-28 shrink-0 bg-muted/40 grid place-items-center text-muted-foreground">
        {p.imagePrompt || p.imageAlt ? (
          <div className="text-[10px] p-2 text-center line-clamp-4">{p.imageAlt || p.imagePrompt.slice(0, 60)}</div>
        ) : <ImageIcon className="w-6 h-6" />}
      </div>
      <div className="flex-1 p-3 flex flex-col gap-1 min-w-0">
        <div className="flex items-center justify-between">
          {featured
            ? <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"><Star className="w-3 h-3" /> Featured</span>
            : <span className="text-[10px] text-muted-foreground">#{(idx ?? 0) + 1}</span>}
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(featured ? "featured" : p.id)} data-testid={featured ? "featured-edit-btn" : `preview-edit-${p.id}-btn`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => featured ? update({ featured: null }) : removePreview(p.id)} data-testid={featured ? "featured-remove-btn" : `preview-delete-${p.id}-btn`}>
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
        <div className="font-display text-base leading-tight truncate">{p.title}</div>
        <div className="text-xs text-muted-foreground line-clamp-2">{p.summary || <span className="italic opacity-60">No summary yet — click edit.</span>}</div>
        <div className="mt-1 flex items-center gap-2 min-w-0">
          {cardLink(p)
            ? <span className="text-[10px] bg-secondary/15 text-secondary px-2 py-0.5 rounded-full shrink-0">{p.ctaText || "Read more"}</span>
            : <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full shrink-0" data-testid="card-no-link">No link</span>}
          {cardLink(p) && <span className="text-[10px] text-muted-foreground truncate">{cardLink(p)}</span>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="newsletter-page">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Mail className="w-5 h-5" /></div>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Newsletter Builder</h1>
          <p className="text-sm text-muted-foreground">Pull articles from My Drafts into a beehiiv / Substack-ready email.</p>
        </div>
      </div>

      {linklessCards > 0 && (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" data-testid="newsletter-missing-links">
          {linklessCards === 1 ? "1 card has" : `${linklessCards} cards have`} no link, so readers can't click through to the article.
          Set your <Link to="/settings" className="underline font-medium">Article URL in Settings</Link>, or edit the card and paste the full URL.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Builder */}
        <div className="lg:col-span-8 space-y-5">
          <Card><CardContent className="p-4 space-y-3">
            <div>
              <Label>Newsletter title / subject</Label>
              <Input value={nl.title} onChange={e => update({ title: e.target.value })} placeholder="This week's newsletter" data-testid="newsletter-title-input" />
            </div>
            <div>
              <Label>Intro</Label>
              <Textarea rows={3} value={nl.introText} onChange={e => update({ introText: e.target.value })} placeholder="Hey friends, a few good reads for you this week…" data-testid="newsletter-intro-input" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-3"><Label className="text-xs text-muted-foreground">Header image prompt</Label>
                <Textarea rows={2} value={nl.header.prompt} onChange={e => updateHeader({ prompt: e.target.value })} data-testid="newsletter-header-prompt-input" /></div>
              <div className="sm:col-span-2"><Input placeholder="Alt text" value={nl.header.alt} onChange={e => updateHeader({ alt: e.target.value })} data-testid="newsletter-header-alt-input" /></div>
              <div><Input placeholder="Image URL" value={nl.header.url || ""} onChange={e => updateHeader({ url: e.target.value })} data-testid="newsletter-header-url-input" /></div>
            </div>
          </CardContent></Card>

          {/* Featured */}
          <Card><CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-display text-lg flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> Featured article</div>
              <Button size="sm" variant="outline" onClick={() => openPicker("featured")} data-testid="choose-featured-btn">
                <FileText className="w-3.5 h-3.5 mr-1.5" /> {nl.featured ? "Change" : "Choose from drafts"}
              </Button>
            </div>
            {nl.featured ? <PreviewCard p={nl.featured} featured /> :
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">No featured article yet. Pick one from your drafts.</div>}
          </CardContent></Card>

          {/* Previews */}
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display text-lg">Featured Article Previews</div>
                <p className="text-xs text-muted-foreground">Drag to reorder. Order matches the final newsletter.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openPicker("preview")} data-testid="add-from-drafts-btn">
                  <FileText className="w-3.5 h-3.5 mr-1.5" /> Add from drafts
                </Button>
                <Button size="sm" variant="ghost" onClick={addBlankPreview} data-testid="add-blank-preview-btn">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add blank
                </Button>
              </div>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="nl-previews">
                {(provided, snap) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    className={`min-h-[120px] space-y-2 rounded-lg p-2 ${snap.isDraggingOver ? "drop-target" : ""}`}
                    data-testid="newsletter-previews-list">
                    {nl.previews.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-6">No previews yet. Add articles from your drafts.</div>
                    )}
                    {nl.previews.map((p, idx) => (
                      <Draggable draggableId={p.id} index={idx} key={p.id}>
                        {(prov, snap2) => (
                          <div ref={prov.innerRef} {...(prov.draggableProps as any)}
                            className={`rounded-xl border bg-card overflow-hidden flex ${snap2.isDragging ? "dragging-shadow border-primary" : "border-border"}`}>
                            <button {...prov.dragHandleProps} className="drag-handle px-1 text-muted-foreground hover:text-foreground grid place-items-center"
                              data-testid={`preview-drag-handle-${p.id}`}>
                              <GripVertical className="w-4 h-4" />
                            </button>
                            <div className="flex-1"><PreviewCard p={p} idx={idx} /></div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </CardContent></Card>

          {/* Outro */}
          <Card><CardContent className="p-4">
            <Label>Outro / closing</Label>
            <Textarea rows={3} value={nl.outroText} onChange={e => update({ outroText: e.target.value })} className="mt-1.5"
              placeholder="Thanks for reading, friends. See you next week." data-testid="newsletter-outro-input" />
            </CardContent></Card>
          </div>

        {/* Export */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-20">
            <Card><CardContent className="p-4">
              <div className="font-display text-lg mb-3">Export</div>
              <Tabs value={exportTab} onValueChange={setExportTab}>
                <TabsList className="w-full" data-testid="newsletter-export-tabs">
                  <TabsTrigger value="html" data-testid="export-tab-html" className="flex-1">HTML</TabsTrigger>
                  <TabsTrigger value="markdown" data-testid="export-tab-markdown" className="flex-1">MD</TabsTrigger>
                  <TabsTrigger value="plain" data-testid="export-tab-plain" className="flex-1">Plain</TabsTrigger>
                </TabsList>
                {Object.keys(exports).map(k => (
                  <TabsContent key={k} value={k} className="mt-3">
                    <div className="flex gap-2 mb-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={doCopy} data-testid="newsletter-copy-btn"><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</Button>
                      <Button size="sm" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={doDownload} data-testid="newsletter-download-btn"><Download className="w-3.5 h-3.5 mr-1.5" /> Download</Button>
                    </div>
                    <Textarea readOnly rows={16} value={exports[k].content()} className="font-mono text-[11px] leading-relaxed bf-scroll" data-testid={`newsletter-export-content-${k}`} />
                  </TabsContent>
                ))}
              </Tabs>
              {!isHidden(demo, "email") && <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Send a test email
                </div>
                <div className="flex gap-2">
                  <Input type="email" placeholder="you@example.com" value={testEmail}
                    onChange={e => setTestEmail(e.target.value)} data-testid="test-email-input" />
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                    onClick={sendTest} disabled={sending} data-testid="send-test-email-btn">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Sends the HTML version to your inbox to preview before publishing.</p>
              </div>}
            </CardContent></Card>
          </div>
        </div>
      </div>

      {/* Drafts picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg" data-testid="drafts-picker-dialog">
          <DialogHeader>
            <DialogTitle>{pickMode === "featured" ? "Choose the featured article" : "Add a preview from your drafts"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[55vh] overflow-y-auto bf-scroll pr-1">
            {drafts.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No drafts yet. Write an article first.</div>}
            {drafts.map(d => {
              const title = d.blocks.find(b => b.type === "title")?.content || d.brief.topic || "Untitled draft";
              return (
                <button key={d.id} onClick={() => addFromDraft(d)}
                  className="w-full text-left rounded-xl border border-border hover:border-primary/50 bg-card p-3 transition-colors"
                  data-testid={`picker-draft-${d.id}`}>
                  <div className="font-display text-base leading-tight line-clamp-1">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{d.blocks.length} blocks · {d.brief.metaDescription ? "has meta" : "no meta yet"}</div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit preview dialog */}
      <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="max-w-lg" data-testid="preview-edit-dialog">
          <DialogHeader>
            <DialogTitle>{editId === "featured" ? "Edit featured article" : "Edit preview card"}</DialogTitle>
          </DialogHeader>
          {editingPreview && (
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={editingPreview.title} onChange={e => updatePreview({ title: e.target.value })} data-testid="preview-title-input" /></div>
              <div><Label>Summary</Label><Textarea rows={3} value={editingPreview.summary} onChange={e => updatePreview({ summary: e.target.value })} data-testid="preview-summary-input" />
                <Button size="sm" variant="ghost" className="mt-1" onClick={writeSummary} data-testid="preview-ai-summary-btn"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Write summary with AI</Button>
              </div>
              <div><Label>Header image prompt</Label><Textarea rows={3} value={editingPreview.imagePrompt} onChange={e => updatePreview({ imagePrompt: e.target.value })} data-testid="preview-imgprompt-input" /></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={regenImg} data-testid="preview-regen-img-btn"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Regenerate prompt</Button>
              </div>
              <div><Label>Image alt text</Label><Input value={editingPreview.imageAlt} onChange={e => updatePreview({ imageAlt: e.target.value })} data-testid="preview-alt-input" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>CTA text</Label><Input value={editingPreview.ctaText} onChange={e => updatePreview({ ctaText: e.target.value })} data-testid="preview-cta-text-input" /></div>
                <div><Label>Link</Label><Input value={editingPreview.ctaLink} onChange={e => updatePreview({ ctaLink: e.target.value })}
                  placeholder={cardLink(editingPreview) || "https://…"} data-testid="preview-cta-link-input" /></div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {cardLink(editingPreview)
                  ? `Links to ${cardLink(editingPreview)}`
                  : "No link yet. Paste the full article URL, or set your Article URL in Settings so cards made from articles link automatically."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setEditId(null)} data-testid="preview-edit-done-btn">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2, Sparkles, Image as ImageIcon, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { generateImagePrompt, generateNewsletterPreview } from "@/lib/api";
import { uid } from "@/lib/storage";
import type { Draft, NewsletterPreview } from "@/types";

interface Props {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}

export default function NewsletterBuilder({ draft, setDraft }: Props) {
  const n = draft.newsletter;
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const editing = n.previews.find(p => p.id === editId) || null;

  const updateNL = (patch: Partial<Draft["newsletter"]>) =>
    setDraft(p => p ? { ...p, newsletter: { ...p.newsletter, ...patch } } : p);

  const updatePreview = (id: string, patch: Partial<NewsletterPreview>) =>
    updateNL({ previews: n.previews.map(p => p.id === id ? { ...p, ...patch } : p) });

  const removePreview = (id: string) =>
    updateNL({ previews: n.previews.filter(p => p.id !== id) });

  const addBlank = () => {
    updateNL({
      previews: [...n.previews, {
        id: uid("nv"), title: "New preview card", summary: "",
        ctaText: "Read the full guide", ctaLink: "#",
        imagePrompt: "", imageAlt: "",
      }],
    });
  };

  const autoFromArticle = async () => {
    const title = draft.blocks.find(b => b.type === "title")?.content || draft.brief.topic;
    if (!title) { toast.error("Article needs a title or topic first"); return; }
    setBusy(true);
    const t = toast.loading("Crafting a preview from your article…");
    try {
      const r = await generateNewsletterPreview({
        title,
        metaDescription: draft.brief.metaDescription,
        keyPoints: draft.brief.keyPoints,
        headerImagePrompt: draft.headerImage.prompt,
        styleId: "newsletter",
      });
      const newP: NewsletterPreview = {
        id: uid("nv"),
        title: r.title || title,
        summary: r.summary || draft.brief.metaDescription,
        ctaText: r.ctaText || "Read the full guide",
        ctaLink: `/articles/${(r.title || title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        imagePrompt: r.imagePrompt || draft.headerImage.prompt,
        imageAlt: r.imageAlt || draft.headerImage.alt,
      };
      updateNL({ previews: [...n.previews, newP] });
      toast.success("Preview added", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
    finally { setBusy(false); }
  };

  const regenPreviewImg = async (p: NewsletterPreview) => {
    const t = toast.loading("Generating image prompt…");
    try {
      const r = await generateImagePrompt({ topic: p.title, angle: p.summary, styleId: "newsletter" });
      updatePreview(p.id, { imagePrompt: r.prompt, imageAlt: r.alt });
      toast.success("Image prompt ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    const arr = [...n.previews];
    const [moved] = arr.splice(r.source.index, 1);
    arr.splice(r.destination.index, 0, moved);
    updateNL({ previews: arr });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="font-display text-lg mb-1">Newsletter Builder</div>
        <p className="text-xs text-muted-foreground">Build a beehiiv/Substack-friendly email with drag-and-drop preview cards.</p>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Newsletter Header</Label>
          <div className="flex items-center gap-2">
            <Label htmlFor="useHdr" className="text-xs">Reuse article header</Label>
            <Switch id="useHdr" checked={n.useArticleHeader} onCheckedChange={v => updateNL({ useArticleHeader: v })} data-testid="newsletter-use-header-switch" />
          </div>
        </div>
        {n.useArticleHeader ? (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground mb-1">Using article header image</div>
            <div className="text-sm">{draft.headerImage.alt || draft.headerImage.prompt || "—"}</div>
          </div>
        ) : (
          <>
            <Textarea rows={3} placeholder="Newsletter header image prompt"
              value={n.headerImage.prompt}
              onChange={e => updateNL({ headerImage: { ...n.headerImage, prompt: e.target.value } })}
              data-testid="newsletter-header-prompt-input" />
            <Input placeholder="Alt text" value={n.headerImage.alt}
              onChange={e => updateNL({ headerImage: { ...n.headerImage, alt: e.target.value } })}
              data-testid="newsletter-header-alt-input" />
            <Input placeholder="Image URL (optional)" value={n.headerImage.url || ""}
              onChange={e => updateNL({ headerImage: { ...n.headerImage, url: e.target.value } })}
              data-testid="newsletter-header-url-input" />
          </>
        )}
      </div>

      {/* Intro */}
      <div className="rounded-xl border border-border bg-card p-4">
        <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Intro</Label>
        <Textarea rows={3} value={n.introText} onChange={e => updateNL({ introText: e.target.value })}
          placeholder="Hey friends — three pet-care reads for you this week…" className="mt-2"
          data-testid="newsletter-intro-input" />
      </div>

      {/* Previews */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-display text-base">Featured Article Previews</div>
            <p className="text-xs text-muted-foreground">Drag to reorder. Order matches the final newsletter.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={autoFromArticle} disabled={busy} data-testid="auto-preview-btn">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              Auto-generate Preview
            </Button>
            <Button size="sm" variant="ghost" onClick={addBlank} data-testid="add-blank-preview-btn">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add blank
            </Button>
          </div>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="newsletter-previews">
            {(provided, snap) => (
              <div ref={provided.innerRef} {...provided.droppableProps}
                className={`min-h-[120px] space-y-2 rounded-lg p-2 ${snap.isDraggingOver ? "drop-target" : ""}`}
                data-testid="newsletter-previews-list">
                {n.previews.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-6">
                    No previews yet. Click <strong>Auto-generate Preview</strong> to start.
                  </div>
                )}
                {n.previews.map((p, idx) => (
                  <Draggable draggableId={p.id} index={idx} key={p.id}>
                    {(prov, snap2) => (
                      <motion.div ref={prov.innerRef} {...(prov.draggableProps as any)} layout
                        className={`rounded-xl border bg-card overflow-hidden flex ${snap2.isDragging ? "dragging-shadow border-primary" : "border-border"}`}
                        data-testid={`preview-card-${p.id}`}>
                        <div className="w-28 shrink-0 bg-muted/40 grid place-items-center text-muted-foreground">
                          {p.imagePrompt ? (
                            <div className="text-[10px] p-2 text-center line-clamp-4">{p.imageAlt || p.imagePrompt.slice(0, 60)}</div>
                          ) : (
                            <ImageIcon className="w-6 h-6" />
                          )}
                        </div>
                        <div className="flex-1 p-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <button {...prov.dragHandleProps} className="drag-handle text-muted-foreground hover:text-foreground"
                              data-testid={`preview-drag-handle-${p.id}`}>
                              <GripVertical className="w-4 h-4" />
                            </button>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(p.id)}
                                data-testid={`preview-edit-${p.id}-btn`}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePreview(p.id)}
                                data-testid={`preview-delete-${p.id}-btn`}>
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                          <div className="font-display text-base leading-tight">{p.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{p.summary || <span className="italic opacity-60">No summary yet — click edit to add one.</span>}</div>
                          <div className="mt-1 inline-flex">
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{p.ctaText || "Read more"}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Outro */}
      <div className="rounded-xl border border-border bg-card p-4">
        <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Outro / Closing</Label>
        <Textarea rows={3} value={n.outroText} onChange={e => updateNL({ outroText: e.target.value })}
          placeholder="Thanks for reading, friends. Give your pet a scratch from me. — your name" className="mt-2"
          data-testid="newsletter-outro-input" />
      </div>

      <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="max-w-lg" data-testid="preview-edit-dialog">
          <DialogHeader>
            <DialogTitle>Edit preview card</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={editing.title} onChange={e => updatePreview(editing.id, { title: e.target.value })} data-testid="preview-title-input" />
              </div>
              <div>
                <Label>Summary (1–3 sentences)</Label>
                <Textarea rows={3} value={editing.summary} onChange={e => updatePreview(editing.id, { summary: e.target.value })} data-testid="preview-summary-input" />
              </div>
              <div>
                <Label>Header image prompt</Label>
                <Textarea rows={3} value={editing.imagePrompt} onChange={e => updatePreview(editing.id, { imagePrompt: e.target.value })} data-testid="preview-imgprompt-input" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => regenPreviewImg(editing)} data-testid="preview-regen-img-btn">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Regenerate prompt
                </Button>
              </div>
              <div>
                <Label>Image alt text</Label>
                <Input value={editing.imageAlt} onChange={e => updatePreview(editing.id, { imageAlt: e.target.value })} data-testid="preview-alt-input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>CTA text</Label>
                  <Input value={editing.ctaText} onChange={e => updatePreview(editing.id, { ctaText: e.target.value })} data-testid="preview-cta-text-input" />
                </div>
                <div>
                  <Label>CTA link / slug</Label>
                  <Input value={editing.ctaLink} onChange={e => updatePreview(editing.id, { ctaLink: e.target.value })} data-testid="preview-cta-link-input" />
                </div>
              </div>
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

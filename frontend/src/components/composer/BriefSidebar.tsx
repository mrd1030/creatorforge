import React, { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, X, Plus, Image as ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import { NICHES, NICHE_KEYS, STYLE_COLORS, PLACEMENT_OPTIONS, TYPE_OPTIONS, BLOCK_LIBRARY, getAffiliateDisclosureText } from "@/lib/templates";
import { getAllStyles, getStyleInstructions } from "@/lib/styles";
import { loadCustomCategories, saveCustomCategories, uid } from "@/lib/storage";
import { generateBrief, generateFacts, generateImagePrompt, generateMeta, generateSeo, processArticle } from "@/lib/api";
import { Loader2 } from "lucide-react";
import type { Draft, StyleId, Block } from "@/types";

interface Props {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  leftOpen: boolean;
  setLeftOpen: (v: boolean) => void;
  onStyleChange: (sid: StyleId) => void;
}

// Stable, module-level collapsible section (must NOT be defined inside the
// parent render or inputs remount and lose focus on every keystroke).
function Sec({ open, onToggle, k, title, children }: {
  open: boolean; onToggle: () => void; k: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        data-testid={`sidebar-section-${k}-toggle`}>
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

export default function BriefSidebar({ draft, setDraft, leftOpen, setLeftOpen, onStyleChange }: Props) {
  const niche = draft.brief.niche || "Pet Care";
  const [customCats, setCustomCats] = useState<string[]>(loadCustomCategories());
  const [newCat, setNewCat] = useState("");
  const [newTag, setNewTag] = useState("");
  const [openSection, setOpenSection] = useState<string>("style");
  const [seoBusy, setSeoBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [factsBusy, setFactsBusy] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const styles = getAllStyles();
  const nicheCategories = NICHES[niche]?.categories || NICHES["Pet Care"].categories;
  const allCats = [...new Set([...nicheCategories, ...customCats])];

  const update = (patch: Partial<Draft>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);
  // Accepts either a plain patch or an updater keyed off the latest brief — the
  // updater form is required for anything computed from the current brief (add/
  // remove from an array), since draft.brief here is a closed-over prop and can
  // be stale across back-to-back calls (e.g. clicking several category chips in
  // quick succession, before a re-render commits the first click's update).
  const updateBrief = (patch: Partial<Draft["brief"]> | ((prev: Draft["brief"]) => Partial<Draft["brief"]>)) =>
    setDraft(prev => prev ? { ...prev, brief: { ...prev.brief, ...(typeof patch === "function" ? patch(prev.brief) : patch) } } : prev);
  const updateAffiliate = (patch: Partial<Draft["affiliate"]>) => setDraft(prev => prev ? { ...prev, affiliate: { ...prev.affiliate, ...patch } } : prev);
  const updateBlock = (id: string, patch: Partial<Block>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return { ...prev, blocks: prev.blocks.map(b => b.id === id ? { ...b, ...patch } : b) };
    });
  };

  const setAffiliateEnabled = (enabled: boolean) => {
  updateAffiliate({ enabled });

  if (!enabled && draft) {
    // Remove affiliate block when turned off
    const filteredBlocks = draft.blocks.filter((b: Block) => b.type !== "affiliate");

    if (filteredBlocks.length !== draft.blocks.length) {
      setDraft(prev => prev ? { ...prev, blocks: filteredBlocks } : prev);
    }
  }

  if (enabled && draft) {
    // Add affiliate block when turned on (if it doesn't exist)
    const hasAffiliateBlock = draft.blocks.some((b: Block) => b.type === "affiliate");

    if (!hasAffiliateBlock) {
      const newAffiliateBlock: Block = {
        id: uid("blk"),
        type: "affiliate",
        label: "Affiliate Disclosure",
        note: "",
        content: draft.affiliate.text || 
          "Heads up — some links are affiliate links. If you buy something through them, I may earn a small commission at no extra cost to you.",
      };

      setDraft(prev => prev ? {
        ...prev,
        blocks: [...prev.blocks, newAffiliateBlock]
      } : prev);
    }
  }
};
  const updateHeader = (patch: Partial<Draft["headerImage"]>) => setDraft(prev => prev ? { ...prev, headerImage: { ...prev.headerImage, ...patch } } : prev);

  const toggleCategory = (c: string) => {
    updateBrief(prev => ({
      categories: prev.categories.includes(c) ? prev.categories.filter(x => x !== c) : [...prev.categories, c],
    }));
  };
  const addCustomCat = () => {
    const v = newCat.trim();
    if (!v) return;
    if (allCats.includes(v)) { toast.message("Category already exists"); return; }
    const next = [...customCats, v];
    setCustomCats(next); saveCustomCategories(next);
    toggleCategory(v); setNewCat("");
  };
  const addTag = () => {
    const v = newTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!v) return;
    updateBrief(prev => prev.tags.includes(v) ? {} : { tags: [...prev.tags, v] });
    setNewTag("");
  };
  const removeTag = (t: string) => updateBrief(prev => ({ tags: prev.tags.filter(x => x !== t) }));

  const articleContent = () => draft.blocks.map(b => b.content || "").join("\n\n");
  const articleTitle = () => draft.blocks.find(b => b.type === "title")?.content || draft.brief.topic;

  const onGenerateHeaderPrompt = async () => {
    if (!draft.brief.topic) { toast.error("Add a topic first"); return; }
    const t = toast.loading("Generating header image prompt…");
    try {
      const r = await generateImagePrompt({ topic: draft.brief.topic, angle: draft.brief.angle, styleId: draft.styleId });
      updateHeader({ prompt: r.prompt, alt: r.alt });
      toast.success("Header prompt ready", { id: t });
    } catch (e: any) { toast.error("Failed to generate", { id: t, description: e?.message }); }
  };

  const onAutoMeta = async () => {
    const title = articleTitle();
    if (!title) { toast.error("Add a title or topic first"); return; }
    const t = toast.loading("Generating meta description…");
    try {
      const r = await generateMeta(title, articleContent(), draft.brief.focusKeyword);
      updateBrief({ metaDescription: r.text });
      toast.success("Meta description ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
  };

  const onGenerateSeo = async () => {
    const title = articleTitle();
    if (!title) { toast.error("Add a topic or title first"); return; }
    setSeoBusy(true);
    const t = toast.loading("Generating SEO keyword + description…");
    try {
      const r = await generateSeo({ title, topic: draft.brief.topic, content: articleContent(), focusKeyword: draft.brief.focusKeyword });
      updateBrief({ focusKeyword: r.focusKeyword || draft.brief.focusKeyword, metaDescription: r.metaDescription || draft.brief.metaDescription });
      toast.success("SEO fields ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
    finally { setSeoBusy(false); }
  };

  const onGenerateBrief = async () => {
    if (!draft.brief.topic.trim()) { toast.error("Enter a topic first"); return; }
    setBriefBusy(true);
    const t = toast.loading("Building your brief…");
    try {
      const r = await generateBrief({ topic: draft.brief.topic, styleId: draft.styleId, niche });
      setDraft(prev => {
        if (!prev) return prev;
        // Merge suggested categories with any the user already picked.
        const mergedCats = [...new Set([...prev.brief.categories, ...r.categories])];
        const mergedTags = [...new Set([...prev.brief.tags, ...r.tags])];
        return {
          ...prev,
          brief: {
            ...prev.brief,
            audience:        r.audience        || prev.brief.audience,
            keyPoints:       r.keyPoints       || prev.brief.keyPoints,
            angle:           r.angle           || prev.brief.angle,
            focusKeyword:    r.focusKeyword    || prev.brief.focusKeyword,
            metaDescription: r.metaDescription || prev.brief.metaDescription,
            categories:      mergedCats,
            tags:            mergedTags,
            factsToUse:      r.factsToUse || prev.brief.factsToUse,
          },
        };
      });
      // Open facts section if web results came back, otherwise brief section.
      setOpenSection(r.factsToUse ? "facts" : "brief");
      toast.success("Brief generated", { id: t, description: r.factsToUse ? "Facts sourced from the web — review before writing." : "All fields filled — tweak anything that doesn't feel right." });
    } catch (e: any) {
      toast.error("Failed to generate brief", { id: t, description: e?.message });
    } finally { setBriefBusy(false); }
  };

  const onGenerateFacts = async () => {
    if (!draft.brief.topic.trim()) { toast.error("Add a topic first"); return; }
    setFactsBusy(true);
    const t = toast.loading("Searching the web for facts…");
    try {
      const r = await generateFacts({ topic: draft.brief.topic, niche });
      updateBrief({ factsToUse: r.factsToUse });
      toast.success("Facts sourced", { id: t, description: "Review and remove anything that doesn't apply." });
    } catch (e: any) {
      toast.error("Search failed", { id: t, description: e?.message });
    } finally { setFactsBusy(false); }
  };

  const onProcessArticle = async () => {
    if (!importText.trim()) { toast.error("Paste an article first"); return; }
    setImportBusy(true);
    const t = toast.loading("Processing article into blocks…");
    try {
      const r = await processArticle({ text: importText, styleId: draft.styleId, niche });
      setDraft(prev => {
        if (!prev) return prev;
        const validTypes = new Set(BLOCK_LIBRARY.map(x => x.type));
        const blocks: Block[] = (r.blocks || []).map(b => {
          const type = (validTypes.has(b.type as Block["type"]) ? b.type : "paragraph") as Block["type"];
          return {
            id: uid("blk"),
            type,
            label: BLOCK_LIBRARY.find(x => x.type === type)?.label,
            content: b.content || "",
          };
        });
        return {
          ...prev,
          blocks: blocks.length ? blocks : prev.blocks,
          brief: {
            ...prev.brief,
            topic:           r.title           || prev.brief.topic,
            audience:        r.audience        || prev.brief.audience,
            keyPoints:       r.keyPoints       || prev.brief.keyPoints,
            angle:           r.angle           || prev.brief.angle,
            focusKeyword:    r.focusKeyword    || prev.brief.focusKeyword,
            metaDescription: r.metaDescription || prev.brief.metaDescription,
            factsToUse:      r.factsToUse      || prev.brief.factsToUse,
            tags:            [...new Set([...prev.brief.tags, ...(r.tags || [])])],
            categories:      [...new Set([...prev.brief.categories, ...(r.categories || [])])],
          },
        };
      });
      setImportText("");
      toast.success("Article imported", { id: t, description: `${r.blocks?.length || 0} blocks created — check the Edit & Preview tab.` });
    } catch (e: any) {
      toast.error("Processing failed", { id: t, description: e?.message });
    } finally { setImportBusy(false); }
  };

  const metaLen = draft.brief.metaDescription.length;
  const metaOk = metaLen >= 150 && metaLen <= 160;
  const toggle = (k: string) => setOpenSection(prev => prev === k ? "" : k);

  return (
    <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-border bg-card/80">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="font-display text-lg">Article Brief</div>
        <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setLeftOpen(false)} data-testid="close-left-sidebar-btn">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="bf-scroll overflow-y-auto max-h-[calc(100vh-9rem)]">

        {/* Niche picker — always visible at top */}
        <div className="px-4 py-3 border-b border-border/60">
          <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2 block">Topic Niche</Label>
          <Select value={niche} onValueChange={v => updateBrief({ niche: v, categories: [] })}>
            <SelectTrigger data-testid="niche-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NICHE_KEYS.map(k => (
                <SelectItem key={k} value={k}>{NICHES[k].emoji} {NICHES[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Sec open={openSection === "style"} onToggle={() => toggle("style")} k="style" title="Writing Style">
          <div className="grid grid-cols-1 gap-2">
            {styles.map(s => {
              const c = STYLE_COLORS[s.color] || STYLE_COLORS["amber"];
              const active = draft.styleId === s.id;
              return (
                <button key={s.id}
                  onClick={() => onStyleChange(s.id)}
                  data-testid={`style-card-${s.id}`}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    active
                      ? `${c.border} ${c.bg} ring-2 ${c.ring}`
                      : "border-border hover:border-primary/40 bg-card"
                  }`}>
                  <div className="flex items-center justify-between">
                    <div className={`font-medium text-sm ${active ? c.text : ""}`}>{s.name}</div>
                    {s.custom
                      ? <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Custom</Badge>
                      : active && <Sparkles className={`w-3.5 h-3.5 ${c.text}`} />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.tagline}</div>
                </button>
              );
            })}
          </div>
        </Sec>

        <Sec open={openSection === "import"} onToggle={() => toggle("import")} k="import" title="Import Existing Article">
          <p className="text-xs text-muted-foreground -mt-1">
            Paste a full article and the AI splits it into editable blocks and fills the brief, SEO fields, tags, and categories for you. Replaces the current blocks.
          </p>
          <Textarea
            rows={8}
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Paste your full article here…"
            data-testid="import-article-input"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onProcessArticle}
            disabled={importBusy || !importText.trim()}
            data-testid="process-article-btn"
          >
            {importBusy
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing…</>
              : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Process with AI</>}
          </Button>
        </Sec>

        <Sec open={openSection === "brief"} onToggle={() => toggle("brief")} k="brief" title="Brief & Metadata">
          <div>
            <Label htmlFor="topic">Topic / Working Title</Label>
            <Input id="topic" value={draft.brief.topic} onChange={e => updateBrief({ topic: e.target.value })} placeholder="e.g. First-week kitten care" data-testid="brief-topic-input" />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onGenerateBrief}
            disabled={briefBusy || !draft.brief.topic.trim()}
            data-testid="generate-brief-btn"
          >
            {briefBusy
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Building brief…</>
              : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate full brief from topic</>}
          </Button>
          <div>
            <Label htmlFor="audience">Target Audience</Label>
            <Input id="audience" value={draft.brief.audience} onChange={e => updateBrief({ audience: e.target.value })} placeholder="New cat parents" data-testid="brief-audience-input" />
          </div>
          <div>
            <Label>Target Length</Label>
            <Select value={draft.brief.length} onValueChange={v => updateBrief({ length: v })}>
              <SelectTrigger data-testid="brief-length-select"><SelectValue placeholder="Choose length" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short (~500 words)</SelectItem>
                <SelectItem value="medium">Medium (~1000 words)</SelectItem>
                <SelectItem value="long">Long (~1800 words)</SelectItem>
                <SelectItem value="deep-dive">Deep dive (~2500+ words)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="keyp">Key Points</Label>
            <Textarea id="keyp" rows={3} value={draft.brief.keyPoints} onChange={e => updateBrief({ keyPoints: e.target.value })} placeholder="Bullet the must-cover points" data-testid="brief-keypoints-input" />
          </div>
          <div>
            <Label htmlFor="angle">Personal Angle / Experience</Label>
            <Textarea id="angle" rows={3} value={draft.brief.angle} onChange={e => updateBrief({ angle: e.target.value })} placeholder="What did you actually live through?" data-testid="brief-angle-input" />
          </div>
          <div>
            <Label htmlFor="extra">Extra Instructions</Label>
            <Textarea id="extra" rows={2} value={draft.brief.extra} onChange={e => updateBrief({ extra: e.target.value })} placeholder="Anything specific?" data-testid="brief-extra-input" />
          </div>
        </Sec>

        <Sec open={openSection === "facts"} onToggle={() => toggle("facts")} k="facts" title="Facts to Use (source of truth)">
          <p className="text-xs text-muted-foreground -mt-1">
            Paste verified facts, numbers, breed/species details, vet notes or product specs. The AI treats these as authoritative and avoids inventing other specifics.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onGenerateFacts}
            disabled={factsBusy || !draft.brief.topic.trim()}
            data-testid="generate-facts-btn"
          >
            {factsBusy
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Searching the web…</>
              : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate with AI</>}
          </Button>
          <Textarea rows={6} value={draft.brief.factsToUse} onChange={e => updateBrief({ factsToUse: e.target.value })}
            placeholder={"- A specific claim or stat, plainly stated (Source: domain.com)\n- Another fact worth citing (Source: domain.com)"}
            data-testid="brief-facts-input" />
        </Sec>

        <Sec open={openSection === "seo"} onToggle={() => toggle("seo")} k="seo" title="SEO & Metadata">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onGenerateSeo} disabled={seoBusy} data-testid="seo-ai-generate-btn">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {seoBusy ? "Generating…" : "AI Generate keyword + description"}
            </Button>
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={draft.brief.slug} onChange={e => updateBrief({ slug: e.target.value })} placeholder="my-article-slug" data-testid="seo-slug-input" />
          </div>
          <div>
            <Label htmlFor="kw">Focus Keyword</Label>
            <Input id="kw" value={draft.brief.focusKeyword} onChange={e => updateBrief({ focusKeyword: e.target.value })} placeholder="bearded dragon diet" data-testid="seo-keyword-input" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="meta">Meta Description <span className="text-destructive">*</span></Label>
              <span className={`text-xs font-mono ${metaOk ? "text-secondary" : metaLen > 160 ? "text-destructive" : "text-muted-foreground"}`} data-testid="meta-char-counter">
                {metaLen}/160
              </span>
            </div>
            <Textarea id="meta" rows={3} value={draft.brief.metaDescription}
              onChange={e => updateBrief({ metaDescription: e.target.value })}
              placeholder="A warm, specific 150–160 character description for search results."
              data-testid="seo-meta-input"
            />
            <Button variant="ghost" size="sm" className="mt-2" onClick={onAutoMeta} data-testid="auto-meta-btn">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Auto-generate description from content
            </Button>
          </div>
          <div>
            <Label htmlFor="canonical">Canonical URL</Label>
            <Input id="canonical" value={draft.brief.canonicalUrl} onChange={e => updateBrief({ canonicalUrl: e.target.value })} placeholder="https://yourblog.com/blog/my-article" data-testid="seo-canonical-input" />
          </div>
        </Sec>

        <Sec open={openSection === "categories"} onToggle={() => toggle("categories")} k="categories" title="Categories">
          <div className="flex flex-wrap gap-1.5" data-testid="categories-chip-list">
            {allCats.map(c => {
              const active = draft.brief.categories.includes(c);
              return (
                <button key={c} onClick={() => toggleCategory(c)}
                  data-testid={`category-chip-${c.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40"
                  }`}>{c}</button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Add custom category"
              onKeyDown={e => e.key === "Enter" && addCustomCat()} data-testid="add-category-input" />
            <Button size="icon" variant="outline" onClick={addCustomCat} data-testid="add-category-btn"><Plus className="w-4 h-4" /></Button>
          </div>
        </Sec>

        <Sec open={openSection === "tags"} onToggle={() => toggle("tags")} k="tags" title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {draft.brief.tags.map(t => (
              <Badge key={t} variant="secondary" className="rounded-full pl-2.5 pr-1 py-0.5 gap-1" data-testid={`tag-${t}`}>
                {t}
                <button onClick={() => removeTag(t)} className="ml-1 opacity-60 hover:opacity-100" data-testid={`remove-tag-${t}-btn`}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="bearded-dragon, hydration…"
              onKeyDown={e => e.key === "Enter" && addTag()} data-testid="add-tag-input" />
            <Button size="icon" variant="outline" onClick={addTag} data-testid="add-tag-btn"><Plus className="w-4 h-4" /></Button>
          </div>
        </Sec>

        <Sec open={openSection === "header"} onToggle={() => toggle("header")} k="header" title="Header / Featured Image">
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
            {draft.headerImage.url ? (
              <img src={draft.headerImage.url} alt={draft.headerImage.alt} className="rounded-lg w-full mb-2" />
            ) : (
              <div className="aspect-[16/9] grid place-items-center text-muted-foreground/60">
                <ImageIcon className="w-8 h-8" />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={onGenerateHeaderPrompt} className="mt-2 w-full" data-testid="header-generate-prompt-btn">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate Header Image Prompt
            </Button>
          </div>
          {(draft.headerImage.prompt || draft.headerImage.alt) && (
            <>
              <div>
                <Label>Image Prompt</Label>
                <Textarea rows={4} value={draft.headerImage.prompt} onChange={e => updateHeader({ prompt: e.target.value })} data-testid="header-prompt-input" />
              </div>
              <div>
                <Label>Alt Text</Label>
                <Input value={draft.headerImage.alt} onChange={e => updateHeader({ alt: e.target.value })} data-testid="header-alt-input" />
              </div>
              <div>
                <Label>Image URL (optional)</Label>
                <Input value={draft.headerImage.url || ""} onChange={e => updateHeader({ url: e.target.value })} placeholder="https://…" data-testid="header-url-input" />
              </div>
            </>
          )}
        </Sec>

        <Sec open={openSection === "affiliate"} onToggle={() => toggle("affiliate")} k="affiliate" title="Affiliate Disclosure">
          <div className="flex items-center justify-between">
            <Label htmlFor="aff">Include disclosure</Label>
<Switch
  id="aff"
  checked={draft.affiliate.enabled}
  onCheckedChange={setAffiliateEnabled}
  data-testid="affiliate-enabled-switch"
/>          </div>
          {draft.affiliate.enabled && (
            <>
              <div>
                <Label>Placement</Label>
                <Select value={draft.affiliate.placement} onValueChange={(v: any) => updateAffiliate({ placement: v })}>
                  <SelectTrigger data-testid="affiliate-placement-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLACEMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
<div>
  <Label>Affiliate Type</Label>
  <Select 
    value={draft.affiliate.type} 
    onValueChange={(v: "amazon" | "chewy" | "other") => {
      const newText = getAffiliateDisclosureText(v);
      updateAffiliate({ type: v, text: newText });
      
      // Also update the block content if it exists
      const affiliateBlock = draft.blocks.find(b => b.type === "affiliate");
      if (affiliateBlock) {
        updateBlock(affiliateBlock.id, { content: newText });
      }
    }}
  >
    <SelectTrigger data-testid="affiliate-type-select">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {TYPE_OPTIONS.map(o => (
        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
              <div>
                <Label>Disclosure Text</Label>
<Textarea
  rows={4}
  value={draft.affiliate.text}
  onChange={e => {
    const newText = e.target.value;

    // Update the affiliate config
    updateAffiliate({ text: newText });

    // Also update the block content if it exists
    const affiliateBlock = draft.blocks.find(b => b.type === "affiliate");
    if (affiliateBlock) {
      updateBlock(affiliateBlock.id, { content: newText });
    }
  }}
  data-testid="affiliate-text-input"
/>              </div>
            </>
          )}
        </Sec>
      </div>
    </div>
  );
}

// re-export so other modules can resolve custom-style instructions consistently
export { getStyleInstructions };

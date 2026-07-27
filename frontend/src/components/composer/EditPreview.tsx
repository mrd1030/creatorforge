import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Wand2, Loader2, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateArticle, humanize, streamBlock } from "@/lib/api";
import { buildLlmPrompt } from "@/lib/exports";
import { uid } from "@/lib/storage";
import { getStyleInstructions } from "@/lib/styles";
import { NICHE_COLORS } from "@/lib/templates";
import type { Draft, Block } from "@/types";

interface Props {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}

export default function EditPreview({ draft, setDraft }: Props) {
  const nc = NICHE_COLORS[draft.brief.niche] || NICHE_COLORS["Pet Care"];
  const [busy, setBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream when the component unmounts.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const cancelStream = () => { abortRef.current?.abort(); abortRef.current = null; };

const updateBlock = (id: string, patch: Partial<Block>) => {
  setDraft(prev => {
    if (!prev) return prev;

    const updatedBlocks = prev.blocks.map(b =>
      b.id === id ? { ...b, ...patch } : b
    );

    // Bidirectional sync for affiliate blocks
    const updatedBlock = updatedBlocks.find(b => b.id === id);
    const isAffiliate = updatedBlock?.type === "affiliate";
    const isContentChange = patch.content !== undefined;

    return {
      ...prev,
      blocks: updatedBlocks,
      ...(isAffiliate && isContentChange
        ? {
            affiliate: {
              ...prev.affiliate,
              text: patch.content as string,
            },
          }
        : {}),
    };
  });
};
  const snapshotVersion = (label: string) => {
    setDraft(p => p ? {
      ...p,
      versions: [{ id: uid("v"), ts: Date.now(), label, blocks: JSON.parse(JSON.stringify(p.blocks)) }, ...p.versions].slice(0, 12),
    } : p);
  };

  const onGenerateAll = async () => {
    if (draft.blocks.length === 0) { toast.error("Add some blocks first"); return; }
    setBusy(true);
    const t = toast.loading("Writing your article — this can take a moment…");
    try {
      // Ensure affiliate block is present per placement
      let blocks = [...draft.blocks];
      if (draft.affiliate.enabled) {
        const hasAff = blocks.some(b => b.type === "affiliate");
        if (!hasAff) {
          const aff: Block = { id: uid("blk"), type: "affiliate", label: "Affiliate Note", content: draft.affiliate.text };
          if (draft.affiliate.placement === "after-title") {
            const idx = blocks.findIndex(b => b.type === "title");
            blocks.splice(idx >= 0 ? idx + 1 : 0, 0, aff);
          } else if (draft.affiliate.placement === "bottom-section") {
            blocks.push(aff);
          }
        }
      }

      const r = await generateArticle({
        styleId: draft.styleId,
        styleInstructions: getStyleInstructions(draft.styleId),
        brief: draft.brief,
        blocks: blocks.map(b => ({ id: b.id, type: b.type, note: b.note || "" })),
      });
      const updated = blocks.map(b => ({
        ...b,
        content: r.results[b.id] ?? b.content ?? (b.type === "affiliate" ? draft.affiliate.text : ""),
      }));
      snapshotVersion("Full generation");
      setDraft(p => p ? { ...p, blocks: updated, llmPrompt: buildLlmPrompt({ ...p, blocks: updated }, draft.styleId) } : p);
      toast.success("Article generated", { id: t, description: `${updated.length} blocks written in your chosen voice.` });
    } catch (e: any) {
      toast.error("Generation failed", { id: t, description: e?.message || "Try again." });
    } finally { setBusy(false); }
  };

  const onStreamAll = async () => {
    if (draft.blocks.length === 0) { toast.error("Add some blocks first"); return; }
    cancelStream();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    const t = toast.loading("Streaming your article, block by block…");

    // Mirror the affiliate-injection logic from onGenerateAll so both paths behave identically.
    let blocks = [...draft.blocks];
    if (draft.affiliate.enabled) {
      const hasAff = blocks.some(b => b.type === "affiliate");
      if (!hasAff) {
        const aff: Block = { id: uid("blk"), type: "affiliate", label: "Affiliate Note", content: draft.affiliate.text };
        if (draft.affiliate.placement === "after-title") {
          const idx = blocks.findIndex(b => b.type === "title");
          blocks.splice(idx >= 0 ? idx + 1 : 0, 0, aff);
        } else if (draft.affiliate.placement === "bottom-section") {
          blocks.push(aff);
        }
        // Persist the injected block into draft state so it shows up in the editor.
        setDraft(p => p ? { ...p, blocks } : p);
      }
    }

    let streamed = 0;
    let failed = 0;
    let storyAccum = ""; // rolling narrative context passed to each block
    try {
      for (const b of blocks) {
        if (ctrl.signal.aborted) break;
        setBlockBusy(b.id);
        let acc = "";
        updateBlock(b.id, { content: "" });
        try {
          await streamBlock(
            { styleId: draft.styleId, styleInstructions: getStyleInstructions(draft.styleId), brief: draft.brief, blockType: b.type, blockNote: b.note, priorContent: storyAccum },
            (delta) => { acc += delta; updateBlock(b.id, { content: acc }); },
            ctrl.signal,
          );
          if (acc) storyAccum = storyAccum ? storyAccum + "\n\n" + acc : acc;
          streamed++;
        } catch (blockErr: any) {
          if (ctrl.signal.aborted) break;
          failed++;
          // Leave the block with whatever partial content streamed; show inline indicator.
          updateBlock(b.id, { content: acc || `⚠️ Generation failed: ${blockErr?.message || "unknown error"}` });
        }
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setBlockBusy("");
    }

    if (ctrl.signal.aborted) {
      toast.info("Streaming cancelled", { id: t });
      return;
    }
    snapshotVersion("Live streamed generation");
    if (failed === 0) {
      toast.success("Article streamed", { id: t, description: `${streamed} blocks written live.` });
    } else {
      toast.warning("Streaming finished with errors", { id: t, description: `${streamed} succeeded, ${failed} failed.` });
    }
  };

  const onRegenBlock = async (b: Block) => {
    cancelStream();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBlockBusy(b.id);
    const t = toast.loading(`Regenerating ${b.label || b.type}…`);
    // Build prior content from all blocks that come before this one
    const idx = draft.blocks.findIndex(x => x.id === b.id);
    const priorContent = draft.blocks
      .slice(0, idx)
      .map(x => x.content || "")
      .filter(Boolean)
      .join("\n\n");
    try {
      let acc = "";
      updateBlock(b.id, { content: "" });
      await streamBlock(
        { styleId: draft.styleId, styleInstructions: getStyleInstructions(draft.styleId), brief: draft.brief, blockType: b.type, blockNote: b.note, priorContent },
        (delta) => { acc += delta; updateBlock(b.id, { content: acc }); },
        ctrl.signal,
      );
      toast.success("Regenerated", { id: t });
    } catch (e: any) {
      if (ctrl.signal.aborted) { toast.dismiss(t); return; }
      toast.error("Failed", { id: t, description: e?.message });
    } finally { abortRef.current = null; setBlockBusy(""); }
  };

  const onHumanizeBlock = async (b: Block) => {
    if (!b.content) { toast.message("Nothing to polish yet"); return; }
    setBlockBusy(b.id);
    const t = toast.loading("Polishing voice…");
    try {
      const r = await humanize(b.content, draft.styleId, getStyleInstructions(draft.styleId));
      updateBlock(b.id, { content: r.text });
      toast.success("Voice polished", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
    finally { setBlockBusy(""); }
  };

  const onHumanizeAll = async () => {
    setBusy(true);
    const t = toast.loading("Polishing the whole article…");
    try {
      for (const b of draft.blocks) {
        if (!b.content) continue;
        const r = await humanize(b.content, draft.styleId, getStyleInstructions(draft.styleId));
        updateBlock(b.id, { content: r.text });
      }
      snapshotVersion("Polish pass");
      toast.success("Polished", { id: t, description: "Sounds more like you now." });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
    finally { setBusy(false); }
  };

  if (draft.blocks.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted-foreground" data-testid="edit-empty-state">
        <div className="font-display text-xl mb-2">No blocks yet</div>
        <p className="text-sm">Switch to the <strong>Layout Builder</strong> tab and start dragging blocks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between bg-muted/30 border border-border rounded-xl px-4 py-3">
        <div>
          <div className="font-display text-lg">Generate &amp; Edit</div>
          <p className="text-xs text-muted-foreground">Generate all blocks, then refine each in your voice.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onGenerateAll} disabled={busy} size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="generate-all-btn">
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            Generate Article Content
          </Button>
          <Button onClick={onStreamAll} disabled={busy} size="sm" variant="outline" data-testid="stream-all-btn">
            <Radio className="w-4 h-4 mr-1.5" /> Generate (live stream)
          </Button>
          <Button onClick={onHumanizeAll} disabled={busy} size="sm" variant="outline" data-testid="polish-all-btn">
            <Wand2 className="w-4 h-4 mr-1.5" /> Polish Entire Article
          </Button>
          {busy && (
            <Button onClick={cancelStream} size="sm" variant="ghost" className="text-destructive" data-testid="cancel-stream-btn">
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {draft.blocks.map((b, i) => (
        <motion.div key={b.id} layout
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.02 }}
          className={`rounded-xl border-2 ${nc.border} bg-card`} data-testid={`edit-block-${b.id}`}>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${nc.border} ${nc.bg}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-wider font-medium ${nc.text}`}>{b.label || b.type}</span>
              <span className="text-xs text-muted-foreground">#{i + 1}</span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                disabled={!!blockBusy} onClick={() => onRegenBlock(b)}
                data-testid={`regen-block-${b.id}-btn`}>
                {blockBusy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Regenerate
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                disabled={!!blockBusy} onClick={() => onHumanizeBlock(b)}
                data-testid={`polish-block-${b.id}-btn`}>
                <Wand2 className="w-3.5 h-3.5 mr-1" /> Polish
              </Button>
            </div>
          </div>
          <div className="p-4">
            <Textarea rows={Math.min(14, Math.max(3, (b.content || "").split("\n").length + 1))}
              value={b.content || ""} onChange={e => updateBlock(b.id, { content: e.target.value })}
              placeholder={`${b.label} content will appear here after generation…`}
              data-testid={`edit-textarea-${b.id}`}
              className="font-mono text-sm leading-relaxed" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

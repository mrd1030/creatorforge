import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { motion } from "framer-motion";
import { GripVertical, Plus, Trash2, Sparkles, Image as ImageIcon, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BLOCK_LIBRARY } from "@/lib/templates";
import { uid } from "@/lib/storage";
import type { Draft, Block, BlockType } from "@/types";
import { suggestLayout, generateImagePrompt } from "@/lib/api";

interface Props {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  seedStarter: () => void;
}

const TYPE_HUE: Record<string, string> = {
  title: "bg-primary/10 text-primary",
  prologue: "bg-secondary/15 text-secondary",
  paragraph: "bg-muted text-muted-foreground",
  tips: "bg-secondary/15 text-secondary",
  "pros-cons": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "key-facts": "bg-primary/10 text-primary",
  image: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  table: "bg-muted text-muted-foreground",
  chart: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  cta: "bg-primary/10 text-primary",
  conclusion: "bg-secondary/15 text-secondary",
  custom: "bg-muted text-muted-foreground",
  resources: "bg-muted text-muted-foreground",
  references: "bg-muted text-muted-foreground",
  affiliate: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export default function LayoutBuilder({ draft, setDraft, seedStarter }: Props) {
  const [palette] = useState(BLOCK_LIBRARY);
  const [busy, setBusy] = useState(false);

  // Accepts either a plain replacement array or an updater keyed off the latest
  // blocks — the updater form is required for anything that computes the next
  // array from the current one (append, remove, reorder), since draft.blocks
  // here is just a closed-over prop and can be stale across back-to-back calls
  // (e.g. multiple adds before a re-render commits).
  const setBlocks = (blocks: Block[] | ((prev: Block[]) => Block[])) =>
    setDraft(p => p ? { ...p, blocks: typeof blocks === "function" ? blocks(p.blocks) : blocks } : p);

  const addBlock = (type: BlockType) => {
    const lib = BLOCK_LIBRARY.find(b => b.type === type)!;
    const b: Block = { id: uid("blk"), type, label: lib.label, note: "" };
    setBlocks(prev => [...prev, b]);
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    // Drag from palette to canvas
    if (r.source.droppableId === "palette" && r.destination.droppableId === "canvas") {
      const type = palette[r.source.index].type as BlockType;
      const lib = BLOCK_LIBRARY.find(b => b.type === type)!;
      const newBlock: Block = { id: uid("blk"), type, label: lib.label, note: "" };
      const destIndex = r.destination.index;
      setBlocks(prev => {
        const blocks = [...prev];
        blocks.splice(destIndex, 0, newBlock);
        return blocks;
      });
      return;
    }
    // Reorder canvas
    if (r.source.droppableId === "canvas" && r.destination.droppableId === "canvas") {
      const sourceIndex = r.source.index;
      const destIndex = r.destination.index;
      setBlocks(prev => {
        const blocks = [...prev];
        const [moved] = blocks.splice(sourceIndex, 1);
        blocks.splice(destIndex, 0, moved);
        return blocks;
      });
    }
  };

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));
const updateBlock = (id: string, patch: Partial<Block>) => {
  setDraft(prev => {
    if (!prev) return prev;

    // Update the blocks
    const updatedBlocks = prev.blocks.map(b =>
      b.id === id ? { ...b, ...patch } : b
    );

    // If this is the affiliate block and we're changing its content,
    // also sync it back to draft.affiliate.text
    const updatedBlock = updatedBlocks.find(b => b.id === id);
    const syncingAffiliateText =
      updatedBlock?.type === "affiliate" && patch.content !== undefined;

    return {
      ...prev,
      blocks: updatedBlocks,
      ...(syncingAffiliateText
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
  const onAutoSuggest = async () => {
    if (!draft.brief.topic) { toast.error("Add a topic first"); return; }
    setBusy(true);
    const t = toast.loading("Suggesting layout…");
    try {
      const r = await suggestLayout({ brief: draft.brief, styleId: draft.styleId });
      const blocks: Block[] = (r.blocks || []).map((b: any) => ({
        id: uid("blk"),
        type: b.type as BlockType,
        label: BLOCK_LIBRARY.find(x => x.type === b.type)?.label,
        note: b.note || "",
      }));
      setBlocks(blocks);
      toast.success("Layout suggested", { id: t, description: `${blocks.length} blocks tailored to your brief.` });
    } catch (e: any) {
      toast.error("Failed", { id: t, description: e?.message });
    } finally { setBusy(false); }
  };

  const onBlockImagePrompt = async (b: Block) => {
    const t = toast.loading("Crafting image prompt…");
    try {
      const r = await generateImagePrompt({ topic: draft.brief.topic, angle: draft.brief.angle, styleId: draft.styleId, blockNote: b.note });
      updateBlock(b.id, { imagePrompt: r.prompt, imageAlt: r.alt });
      toast.success("Image prompt ready", { id: t });
    } catch (e: any) { toast.error("Failed", { id: t, description: e?.message }); }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Palette */}
        <div className="md:col-span-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Block Palette</div>
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <Droppable droppableId="palette" isDropDisabled={true}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5 max-h-[480px] overflow-y-auto bf-scroll pr-1">
                  {palette.map((b, idx) => (
                    <Draggable draggableId={`p-${b.type}`} index={idx} key={b.type}>
                      {(prov, snap) => (
                        <>
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border bg-card text-sm transition-all ${
                              snap.isDragging ? "dragging-shadow border-primary" : "border-border hover:border-primary/50"
                            }`}
                            data-testid={`palette-${b.type}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{b.label}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{b.hint}</div>
                              </div>
                            </div>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                              onClick={() => addBlock(b.type)} data-testid={`palette-add-${b.type}-btn`}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          {/* Render clone for drag */}
                          {snap.isDragging && (
                            <div className="hidden">{b.label}</div>
                          )}
                        </>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>

            <div className="mt-3 grid gap-2">
              <Button variant="outline" size="sm" onClick={onAutoSuggest} disabled={busy} data-testid="auto-suggest-layout-btn">
                <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Auto-suggest Layout
              </Button>
              <Button variant="ghost" size="sm" onClick={seedStarter} data-testid="starter-layout-btn">
                Use starter layout
              </Button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="md:col-span-8">
          <Droppable droppableId="canvas">
            {(provided, snap) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`min-h-[420px] rounded-xl border-2 ${snap.isDraggingOver ? "drop-target" : "border-dashed border-border"} p-3 space-y-2 transition-all`}
                data-testid="layout-canvas"
              >
                {draft.blocks.length === 0 && (
                  <div className="h-full min-h-[400px] grid place-items-center text-center text-muted-foreground">
                    <div>
                      <div className="font-display text-xl mb-1">Drag blocks here</div>
                      <p className="text-sm">Or click <strong>Auto-suggest Layout</strong> for a tailored structure.</p>
                    </div>
                  </div>
                )}
                {draft.blocks.map((b, idx) => (
                  <Draggable draggableId={b.id} index={idx} key={b.id}>
                    {(prov, snap2) => (
                      <motion.div layout
                        ref={prov.innerRef} {...(prov.draggableProps as any)}
                        className={`rounded-xl border bg-card transition-shadow ${snap2.isDragging ? "dragging-shadow border-primary" : "border-border"}`}
                        data-testid={`canvas-block-${b.id}`}>
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
                          <button {...prov.dragHandleProps} className="drag-handle text-muted-foreground hover:text-foreground" data-testid={`block-drag-handle-${b.id}`}>
                            <GripVertical className="w-4 h-4" />
                          </button>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${TYPE_HUE[b.type] || "bg-muted text-muted-foreground"}`}>{b.label || b.type}</span>
                          <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                          <div className="ml-auto flex items-center gap-1">
                            {b.type === "image" && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                onClick={() => onBlockImagePrompt(b)} data-testid={`block-image-prompt-${b.id}-btn`}>
                                <ImageIcon className="w-3.5 h-3.5 mr-1" /> Image prompt
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeBlock(b.id)} data-testid={`block-remove-${b.id}-btn`}>
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
  {/* Note field (shown for all blocks) */}
  <div>
    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
      Block note (guidance for AI)
    </Label>
    <Input
      value={b.note || ""}
      onChange={e => updateBlock(b.id, { note: e.target.value })}
      placeholder="e.g. focus on first 24 hours..."
      data-testid={`block-note-${b.id}-input`}
    />
  </div>

  {/* Editable Disclosure Text - only shown for affiliate blocks */}
  {b.type === "affiliate" && (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Disclosure Text
      </Label>
      <Textarea
        rows={4}
        value={b.content || ""}
        onChange={e => updateBlock(b.id, { content: e.target.value })}
        placeholder="Heads up — some links are affiliate links..."
        data-testid={`block-content-${b.id}-input`}
      />
    </div>
  )}
                          {b.type === "image" && (b.imagePrompt || b.imageAlt) && (
                            <div className="bg-muted/40 rounded-lg p-2 text-xs space-y-1">
                              <div><span className="font-semibold">Prompt:</span> {b.imagePrompt}</div>
                              <div><span className="font-semibold">Alt:</span> {b.imageAlt}</div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </div>
    </DragDropContext>
  );
}

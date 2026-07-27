import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send } from "lucide-react";
import { STARTER_BLOCKS_BY_STYLE, BLOCK_LIBRARY } from "@/lib/templates";
import { getStyleById } from "@/lib/styles";
import { getDraft, newDraft, upsertDraft, setCurrentDraftId, uid } from "@/lib/storage";
import type { Draft, StyleId, Block, BlockType } from "@/types";
import BriefSidebar from "@/components/composer/BriefSidebar";
import LayoutBuilder from "@/components/composer/LayoutBuilder";
import EditPreview from "@/components/composer/EditPreview";
import NewsletterBuilder from "@/components/composer/NewsletterBuilder";
import RightSidebar from "@/components/composer/RightSidebar";

export default function Composer() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [activeTab, setActiveTab] = useState("layout");
  const [leftOpen, setLeftOpen] = useState(true);
  const confirmedRef = useRef(false);

  // Load existing draft, or ask before creating a brand-new one.
  useEffect(() => {
    if (id) {
      const d = getDraft(id);
      if (d) { setDraft(d); setCurrentDraftId(d.id); setConfirmNew(false); return; }
      navigate("/dashboard", { replace: true });
      return;
    }
    setDraft(null);
    setConfirmNew(true);
  }, [id, navigate]);

  // Persist whenever the draft changes (debounced).
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => upsertDraft(draft), 400);
    return () => clearTimeout(t);
  }, [draft]);

  // External "Save" button event.
  useEffect(() => {
    const fn = () => { if (draft) upsertDraft(draft); };
    window.addEventListener("bf:save-draft", fn);
    return () => window.removeEventListener("bf:save-draft", fn);
  }, [draft]);

  const confirmCreate = () => {
    confirmedRef.current = true;
    const d = newDraft();
    upsertDraft(d);
    setCurrentDraftId(d.id);
    setConfirmNew(false);
    navigate(`/edit/${d.id}`, { replace: true });
  };

  const cancelCreate = () => {
    setConfirmNew(false);
    navigate("/dashboard");
  };

  if (!draft) {
    return (
      <>
        <div className="p-10 text-center text-muted-foreground" data-testid="composer-new-placeholder">
          {confirmNew ? "Ready when you are." : "Loading…"}
        </div>
        <AlertDialog open={confirmNew} onOpenChange={(o) => { if (!o) { if (confirmedRef.current) { confirmedRef.current = false; return; } cancelCreate(); } }}>
          <AlertDialogContent data-testid="new-article-confirm-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Create a new article draft?</AlertDialogTitle>
              <AlertDialogDescription>
                This starts a fresh draft in your browser. You can always find it again under My Drafts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelCreate} data-testid="new-article-cancel-btn">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmCreate} data-testid="new-article-confirm-btn">Yes, create draft</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const onStyleChange = (sid: StyleId) => {
    setDraft(prev => prev ? { ...prev, styleId: sid } : prev);
    if (sid === "newsletter") setActiveTab("newsletter");
  };

  const seedStarterBlocks = () => {
    const types = STARTER_BLOCKS_BY_STYLE[draft.styleId] || STARTER_BLOCKS_BY_STYLE["real-person"];
    const blocks: Block[] = types.map((t: BlockType) => ({ id: uid("blk"), type: t, label: BLOCK_LIBRARY.find(b => b.type === t)?.label }));
    setDraft(prev => prev ? { ...prev, blocks } : prev);
    toast.success("Starter layout added", { description: `${blocks.length} blocks for ${getStyleById(draft.styleId)?.name || "your style"}` });
  };

  return (
    <div className="relative">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT SIDEBAR */}
          <aside className={`lg:col-span-3 ${leftOpen ? "" : "hidden lg:block"} order-2 lg:order-1`}>
            <BriefSidebar draft={draft} setDraft={setDraft} leftOpen={leftOpen} setLeftOpen={setLeftOpen} onStyleChange={onStyleChange} />
          </aside>

          {/* CANVAS */}
          <section className="lg:col-span-6 order-1 lg:order-2">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="bg-card/60">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Working on</div>
                      <div className="font-display text-2xl">{draft.brief.topic || "Untitled article"}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setLeftOpen(true)} className="lg:hidden" data-testid="open-left-sidebar-btn">
                        Brief
                      </Button>
                      <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={() => navigate(`/finalize/${draft.id}`)} data-testid="composer-finalize-btn">
                        <Send className="w-4 h-4 mr-1.5" /> Finalize Article
                      </Button>
                    </div>
                  </div>

                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList data-testid="composer-tabs">
                      <TabsTrigger value="layout" data-testid="tab-layout">Layout Builder</TabsTrigger>
                      <TabsTrigger value="edit" data-testid="tab-edit">Edit &amp; Preview</TabsTrigger>
                      <TabsTrigger value="newsletter" data-testid="tab-newsletter">Newsletter</TabsTrigger>
                    </TabsList>
                    <TabsContent value="layout" className="mt-4">
                      <LayoutBuilder draft={draft} setDraft={setDraft} seedStarter={seedStarterBlocks} />
                    </TabsContent>
                    <TabsContent value="edit" className="mt-4">
                      <EditPreview draft={draft} setDraft={setDraft} />
                    </TabsContent>
                    <TabsContent value="newsletter" className="mt-4">
                      <NewsletterBuilder draft={draft} setDraft={setDraft} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </motion.div>
          </section>

          {/* RIGHT SIDEBAR */}
          <aside className="lg:col-span-3 order-3">
            <RightSidebar draft={draft} setDraft={setDraft} />
          </aside>
        </div>
      </div>
    </div>
  );
}

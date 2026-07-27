import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, FileText, History, Send, Trash2, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { wordCount, readingTime } from "@/lib/exports";
import type { Draft, Version } from "@/types";

interface Props {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}

export default function RightSidebar({ draft, setDraft }: Props) {
  const navigate = useNavigate();
  const words = useMemo(() => wordCount(draft), [draft]);
  const minutes = readingTime(words);
  const sections = draft.blocks.length;

  const restore = (v: Version) => {
    setDraft(p => p ? {
      ...p,
      versions: [{ id: "v_pre_restore", ts: Date.now(), label: "Before restore", blocks: JSON.parse(JSON.stringify(p.blocks)) }, ...p.versions].slice(0, 12),
      blocks: JSON.parse(JSON.stringify(v.blocks)),
    } : p);
    toast.success("Restored version", { description: v.label });
  };

  const removeVersion = (id: string) => setDraft(p => p ? { ...p, versions: p.versions.filter(x => x.id !== id) } : p);

  return (
    <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] space-y-4 overflow-y-auto bf-scroll pb-4 pr-1">
      <Card data-testid="stats-card">
        <CardContent className="p-4 space-y-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live stats</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={FileText} label="Words" value={words.toLocaleString()} testId="stat-words" />
            <Stat icon={Clock} label="Read time" value={`${minutes}m`} testId="stat-read" />
            <Stat icon={Hash} label="Blocks" value={sections} testId="stat-sections" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Quick actions</div>
          <Button size="sm" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => navigate(`/finalize/${draft.id}`)} data-testid="rs-finalize-btn">
            <Send className="w-3.5 h-3.5 mr-1.5" /> Finalize &amp; Export
          </Button>
          <Button size="sm" variant="outline" className="w-full" onClick={() => navigate(`/drafts`)} data-testid="rs-drafts-btn">
            All drafts
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="versions-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Version History</div>
            <History className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          {draft.versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved versions yet. Snapshots are created automatically when you generate content.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto bf-scroll pr-1">
              {draft.versions.map(v => (
                <motion.div key={v.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-muted/30">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{v.label}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(v.ts).toLocaleString()} · {v.blocks.length} blocks</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => restore(v)}
                      data-testid={`restore-version-${v.id}-btn`}>Restore</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeVersion(v.id)}
                      data-testid={`delete-version-${v.id}-btn`}>
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, testId }: { icon: any; label: string; value: any; testId: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3 text-center" data-testid={testId}>
      <Icon className="w-3.5 h-3.5 mx-auto text-primary mb-1" />
      <div className="font-mono text-base font-medium leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

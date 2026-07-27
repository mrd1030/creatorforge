import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { loadDrafts, deleteDraft } from "@/lib/storage";
import { getStyleById } from "@/lib/styles";
import type { Draft } from "@/types";
import { toast } from "sonner";

export default function Drafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { setDrafts(loadDrafts()); }, []);

  const onNew = () => navigate("/new");
  const onDelete = (id: string) => {
    if (!confirm("Delete this draft?")) return;
    deleteDraft(id);
    setDrafts(loadDrafts());
    toast.success("Draft deleted");
  };

  const filtered = drafts.filter(d => {
    if (!q) return true;
    const title = d.blocks.find(b => b.type === "title")?.content || d.brief.topic || "";
    return (title + " " + d.brief.topic + " " + d.brief.tags.join(" ")).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">My Drafts</h1>
          <p className="text-sm text-muted-foreground mt-1">Saved locally — yours alone.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search drafts…" value={q} onChange={e => setQ(e.target.value)} className="w-56" data-testid="drafts-search-input" />
          <Button onClick={onNew} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="drafts-new-btn">
            <Plus className="w-4 h-4 mr-2" /> New
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-2 bg-muted/30" data-testid="drafts-empty-state">
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/60 mb-3" />
            <div className="font-display text-xl mb-1">{q ? "No matching drafts" : "Nothing here yet"}</div>
            <p className="text-sm text-muted-foreground mb-5">{q ? "Try a different search." : "Start your first thoughtful piece."}</p>
            <Button onClick={onNew} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="drafts-empty-new-btn">
              <Plus className="w-4 h-4 mr-2" /> New article
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => {
            const title = d.blocks.find(b => b.type === "title")?.content || d.brief.topic || "Untitled draft";
            const style = getStyleById(d.styleId)?.name || d.styleId;
            return (
              <Card key={d.id} className="hover:border-primary/40 hover:shadow-md transition-all group" data-testid={`drafts-card-${d.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{style}</Badge>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                      <Button size="icon" variant="ghost" asChild data-testid={`drafts-open-${d.id}-btn`}>
                        <Link to={`/edit/${d.id}`}><ExternalLink className="w-4 h-4" /></Link>
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(d.id)} data-testid={`drafts-delete-${d.id}-btn`}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  <Link to={`/edit/${d.id}`}>
                    <div className="font-display text-lg leading-snug mb-2 line-clamp-2">{title}</div>
                  </Link>
                  <div className="text-xs text-muted-foreground">{d.blocks.length} blocks · Updated {new Date(d.updatedAt).toLocaleDateString()}</div>
                  {d.brief.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {d.brief.tags.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

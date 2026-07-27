import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, FileText, Sparkles, BookOpen, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadDrafts, deleteDraft } from "@/lib/storage";
import { getStyleById, getAllStyles } from "@/lib/styles";
import type { Draft } from "@/types";
import { toast } from "sonner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => { setDrafts(loadDrafts()); }, []);

  const onNew = () => navigate("/new");

  const onDelete = (id: string) => {
    deleteDraft(id);
    setDrafts(loadDrafts());
    toast.success("Draft deleted");
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7 space-y-5">
          <Badge variant="secondary" className="bg-secondary/15 text-secondary border-secondary/20 rounded-full px-3 py-1" data-testid="hero-pill">
            AI-powered article builder
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            Write articles<br />that actually sound{" "}
            <span className="italic text-primary">like you.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
            A calm, thoughtful workspace for authentic articles and newsletters — any topic, any niche.
            Drag-and-drop layouts, real-person writing styles, and one-click exports for
            your blog, newsletter, and socials.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6" onClick={onNew} data-testid="dashboard-new-article-btn">
              <Plus className="w-4 h-4 mr-2" /> Start a new article
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-full px-6" data-testid="dashboard-view-drafts-btn">
              <Link to="/drafts"><FileText className="w-4 h-4 mr-2" /> My drafts</Link>
            </Button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="relative">
            <div className="absolute -inset-6 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative rounded-2xl border border-border bg-card p-6 shadow-xl">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Today's pick</div>
              <div className="font-display text-2xl leading-tight mb-2">"The honest guide to starting something new — without overthinking it"</div>
              <div className="text-sm text-muted-foreground mb-4">Real Person — Lived It · 6 blocks · 4 min read</div>
              <div className="flex flex-wrap gap-1.5">
                {["Lifestyle", "Productivity", "Personal Growth"].map(c => (
                  <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="mt-16">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl">Your recent drafts</h2>
            <p className="text-sm text-muted-foreground mt-1">Everything you write lives safely in this browser.</p>
          </div>
          <Link to="/drafts" className="text-sm font-medium text-primary hover:underline inline-flex items-center" data-testid="see-all-drafts-link">
            See all <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {drafts.length === 0 ? (
          <Card className="border-dashed border-2 bg-muted/30" data-testid="empty-drafts-card">
            <CardContent className="p-10 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/60 mb-3" />
              <div className="font-display text-xl mb-1">No drafts yet</div>
              <p className="text-sm text-muted-foreground mb-5">Start by writing your first article — pick any topic, any niche.</p>
              <Button onClick={onNew} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="empty-new-article-btn">
                <Plus className="w-4 h-4 mr-2" /> New article
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.slice(0, 6).map(d => {
              const title = d.blocks.find(b => b.type === "title")?.content || d.brief.topic || "Untitled draft";
              const style = getStyleById(d.styleId)?.name || d.styleId;
              return (
                <motion.div key={d.id} whileHover={{ y: -3 }} transition={{ duration: 0.2 }} data-testid={`draft-card-${d.id}`}>
                  <Card className="group cursor-pointer hover:border-primary/40 hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <Link to={`/edit/${d.id}`} className="block">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{style}</Badge>
                          <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 -mt-2 -mr-2"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(d.id); }}
                            data-testid={`delete-draft-${d.id}-btn`}>
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                        <div className="font-display text-lg leading-snug mb-2 line-clamp-2">{title}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.blocks.length} blocks · Updated {new Date(d.updatedAt).toLocaleDateString()}
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl sm:text-3xl mb-1">A voice for every story</h2>
        <p className="text-sm text-muted-foreground mb-6">Pick a style — switch any time as you write.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {getAllStyles().map(s => (
            <Card key={s.id} className="hover:border-primary/40 transition-colors" data-testid={`home-style-${s.id}`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <div className="font-display text-lg">{s.name}</div>
                </div>
                <p className="text-sm text-muted-foreground">{s.tagline}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles, KeyRound, Wand2, Save, DatabaseZap } from "lucide-react";
import { loadSanityToken, saveSanityToken, isSanityConfigured, SANITY_PROJECT_ID, SANITY_DATASET } from "@/lib/sanity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NICHES, NICHE_KEYS } from "@/lib/templates";
import { getAllStyles } from "@/lib/styles";
import {
  loadCustomStyles, upsertCustomStyle, deleteCustomStyle,
  loadSettings, saveSettings, loadCustomCategories, uid,
} from "@/lib/storage";
import type { CustomStyle, AppSettings } from "@/types";

const blankStyle = (): CustomStyle => ({ id: uid("cstyle"), name: "", tagline: "", vibe: "", systemPrompt: "" });

export default function Settings() {
  const [styles, setStyles] = useState<CustomStyle[]>(loadCustomStyles());
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [sanityToken, setSanityToken] = useState(loadSanityToken());
  const [editing, setEditing] = useState<CustomStyle | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const customCats = loadCustomCategories();
  const nicheCategories = NICHES[settings.defaultNiche]?.categories || NICHES["Pet Care"].categories;
  const allCats = [...nicheCategories, ...customCats];

  const persistSettings = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next); saveSettings(next);
  };

  const openNew = () => { setEditing(blankStyle()); setIsNew(true); };
  const openEdit = (s: CustomStyle) => { setEditing({ ...s }); setIsNew(false); };

  const saveStyle = () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Give your style a name"); return; }
    if (!editing.systemPrompt.trim()) { toast.error("Add writing instructions for the AI"); return; }
    const toSave: CustomStyle = {
      ...editing,
      name: editing.name.trim(),
      tagline: editing.tagline.trim() || "Your custom voice.",
      vibe: editing.vibe.trim() || "Custom style",
    };
    upsertCustomStyle(toSave);
    setStyles(loadCustomStyles());
    setEditing(null);
    toast.success(isNew ? "Custom style created" : "Style updated", { description: "It now appears in the Style Library and Composer." });
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteCustomStyle(deleteId);
    setStyles(loadCustomStyles());
    if (settings.defaultStyleId === deleteId) persistSettings({ defaultStyleId: "real-person" });
    setDeleteId(null);
    toast.success("Style deleted");
  };

  const toggleDefaultCat = (c: string) => {
    const has = settings.defaultCategories.includes(c);
    persistSettings({ defaultCategories: has ? settings.defaultCategories.filter(x => x !== c) : [...settings.defaultCategories, c] });
  };

  const changeDefaultNiche = (niche: string) => {
    // Categories are niche-specific — clear picks that don't apply to the new niche.
    persistSettings({ defaultNiche: niche, defaultCategories: [] });
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10" data-testid="settings-page">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl mb-2">Settings</h1>
        <p className="text-muted-foreground">Shape your voices and the defaults for every new article.</p>
      </div>

      {/* Custom styles */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-2xl">Custom Writing Styles</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Define your own voices. The instructions become the AI's system prompt for that style.</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="add-custom-style-btn">
            <Plus className="w-4 h-4 mr-2" /> New style
          </Button>
        </div>

        {styles.length === 0 ? (
          <Card className="border-dashed border-2 bg-muted/30" data-testid="custom-styles-empty">
            <CardContent className="p-10 text-center">
              <Wand2 className="w-9 h-9 mx-auto text-muted-foreground/60 mb-3" />
              <div className="font-display text-lg mb-1">No custom styles yet</div>
              <p className="text-sm text-muted-foreground mb-5">Create a voice like "Vet-backed & gentle" or "Snarky cat parent".</p>
              <Button onClick={openNew} variant="outline" data-testid="add-custom-style-empty-btn"><Plus className="w-4 h-4 mr-2" /> Create your first style</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {styles.map(s => (
              <Card key={s.id} className="hover:border-primary/40 transition-colors" data-testid={`custom-style-${s.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <div className="font-display text-lg">{s.name}</div>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Custom</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} data-testid={`edit-style-${s.id}-btn`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId(s.id)} data-testid={`delete-style-${s.id}-btn`}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{s.tagline}</p>
                  <p className="text-xs text-muted-foreground/80 line-clamp-3 bg-muted/40 rounded-lg p-2">{s.systemPrompt}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Defaults */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">Defaults for new articles</h2>
        <Card>
          <CardContent className="p-6 space-y-6">
            <div>
              <Label>Author name</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Used as the byline in exported frontmatter. Leave blank to omit it.</p>
              <Input
                value={settings.authorName}
                onChange={e => persistSettings({ authorName: e.target.value })}
                placeholder="Your name or pen name"
                className="max-w-md"
                data-testid="author-name-input"
              />
            </div>

            <div>
              <Label>Default niche</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Sets which niche (and category list) a new article starts with.</p>
              <Select value={settings.defaultNiche} onValueChange={changeDefaultNiche}>
                <SelectTrigger className="max-w-md" data-testid="default-niche-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NICHE_KEYS.map(k => <SelectItem key={k} value={k}>{NICHES[k].emoji} {NICHES[k].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Default writing style</Label>
              <Select value={settings.defaultStyleId} onValueChange={v => persistSettings({ defaultStyleId: v })}>
                <SelectTrigger className="mt-1.5 max-w-md" data-testid="default-style-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getAllStyles().map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.custom ? " (Custom)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Default categories</Label>
              <p className="text-xs text-muted-foreground mb-1">Categories shown here match the niche selected above.</p>
              <div className="flex flex-wrap gap-1.5 mt-2" data-testid="default-categories">
                {allCats.map(c => {
                  const active = settings.defaultCategories.includes(c);
                  return (
                    <button key={c} onClick={() => toggleDefaultCat(c)}
                      data-testid={`default-cat-${c.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40"
                      }`}>{c}</button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between max-w-md">
              <div>
                <Label>Include affiliate disclosure by default</Label>
                <p className="text-xs text-muted-foreground">New articles start with the disclosure enabled.</p>
              </div>
              <Switch checked={settings.defaultAffiliateEnabled} onCheckedChange={v => persistSettings({ defaultAffiliateEnabled: v })} data-testid="default-affiliate-switch" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* API keys (future) */}
      <section>
        <h2 className="font-display text-2xl mb-4">AI provider & API keys</h2>
        <Card className="bg-muted/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display text-lg flex items-center gap-2">
                  Configured via environment variable
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  AI generation runs on Claude, using the <span className="font-mono text-xs">ANTHROPIC_API_KEY</span> set
                  in the backend's environment — there's nothing to configure here yet. Per-user API keys (bring your own
                  Anthropic or xAI/Grok key) are coming soon; this is where you'll add and manage them.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-2xl opacity-60 pointer-events-none">
                  <div>
                    <Label>Anthropic API key</Label>
                    <Input placeholder="sk-ant-… (coming soon)" disabled data-testid="anthropic-key-input" />
                  </div>
                  <div>
                    <Label>xAI (Grok) API key</Label>
                    <Input placeholder="xai-… (coming soon)" disabled data-testid="xai-key-input" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Sanity CMS */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">Sanity CMS</h2>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 grid place-items-center shrink-0">
                <DatabaseZap className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-display text-lg mb-1">Push directly to Sanity</div>
                {!isSanityConfigured() && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Sanity push isn't configured for this deployment. Set <span className="font-mono text-xs">VITE_SANITY_PROJECT_ID</span> (and
                    optionally <span className="font-mono text-xs">VITE_SANITY_DATASET</span>) in the frontend environment to enable it.
                  </p>
                )}
                {isSanityConfigured() && (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      Enter a Sanity API token with write access and you can push any article straight to your Content Lake as a draft — no copy-paste needed.
                      Generate a token at <span className="font-mono text-xs">sanity.io/manage → project {SANITY_PROJECT_ID} → API → Tokens → Add API token (Editor role)</span>.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <div className="text-xs text-muted-foreground mb-0.5">Project ID</div>
                        <div className="font-mono font-medium">{SANITY_PROJECT_ID}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <div className="text-xs text-muted-foreground mb-0.5">Dataset</div>
                        <div className="font-mono font-medium">{SANITY_DATASET}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <div className="text-xs text-muted-foreground mb-0.5">Document type</div>
                        <div className="font-mono font-medium">post</div>
                      </div>
                    </div>
                    <div className="flex gap-2 max-w-xl">
                      <Input
                        type="password"
                        value={sanityToken}
                        onChange={e => setSanityToken(e.target.value)}
                        placeholder="sk… (Sanity API write token)"
                        data-testid="sanity-token-input"
                      />
                      <Button
                        onClick={() => {
                          saveSanityToken(sanityToken);
                          toast.success(sanityToken ? "Sanity token saved" : "Token cleared");
                        }}
                        variant="outline"
                        data-testid="sanity-token-save-btn"
                      >
                        <Save className="w-4 h-4 mr-1.5" /> Save
                      </Button>
                    </div>
                    {sanityToken && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">Token saved. Push to Sanity will appear on the Finalize page.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Edit/Create style dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg" data-testid="style-edit-dialog">
          <DialogHeader>
            <DialogTitle>{isNew ? "New custom style" : "Edit style"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Snarky Cat Parent" data-testid="style-name-input" />
              </div>
              <div>
                <Label>Tagline</Label>
                <Input value={editing.tagline} onChange={e => setEditing({ ...editing, tagline: e.target.value })} placeholder="Short description shown on the card" data-testid="style-tagline-input" />
              </div>
              <div>
                <Label>Vibe (one-liner)</Label>
                <Input value={editing.vibe} onChange={e => setEditing({ ...editing, vibe: e.target.value })} placeholder="Dry humor, deeply caring" data-testid="style-vibe-input" />
              </div>
              <div>
                <Label>Writing instructions (AI system prompt)</Label>
                <Textarea rows={6} value={editing.systemPrompt} onChange={e => setEditing({ ...editing, systemPrompt: e.target.value })}
                  placeholder="You are a witty but loving cat owner. Write with dry humor, short punchy sentences…"
                  data-testid="style-prompt-input" />
                <p className="text-[11px] text-muted-foreground mt-1">This becomes the voice instructions sent to the AI when this style is selected.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="style-cancel-btn">Cancel</Button>
            <Button onClick={saveStyle} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="style-save-btn">
              <Save className="w-4 h-4 mr-1.5" /> Save style
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent data-testid="delete-style-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this custom style?</AlertDialogTitle>
            <AlertDialogDescription>Articles already using it keep their content; the style just won't be selectable anymore.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-style-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="delete-style-confirm-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

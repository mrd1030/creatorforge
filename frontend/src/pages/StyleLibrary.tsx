import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAllStyles } from "@/lib/styles";
import { STYLE_COLORS } from "@/lib/templates";
import { Sparkles, Heart, ShieldCheck, BookOpen, GraduationCap, Mail, Feather, Settings as SettingsIcon } from "lucide-react";

const ICONS: Record<string, any> = {
  "real-person": Heart,
  "experienced-caregiver": ShieldCheck,
  "direct-no-bs": Sparkles,
  "storyteller": BookOpen,
  "professional-educator": GraduationCap,
  "newsletter": Mail,
  "short-story": Feather,
};

const EXAMPLES: Record<string, string> = {
  "real-person": "\"Honestly, the first week with a rescue dog, nobody sleeps. Here's what I wish someone had told me about those first 72 hours.\"",
  "experienced-caregiver": "\"After working with hundreds of animals in rescue, I've learned the small details matter more than the big decisions. Here's what actually makes a difference.\"",
  "direct-no-bs": "\"Skip the expensive gadgets. What your cat actually needs is vertical space, hiding spots, and a consistent routine. That's it.\"",
  "storyteller": "\"It was the kind of summer morning where the dew sticks to your shins. I found him under the porch — a tiny tortoise no bigger than my palm.\"",
  "professional-educator": "\"Bearded dragons are diurnal reptiles requiring UVB exposure. In simpler terms: they need real sunlight or a special bulb that mimics it — and the difference matters more than most guides let on.\"",
  "newsletter": "\"Hi friends — three quick reads for you this week. Settle in with your tea and let's get into it.\"",
  "short-story": "\"The cat had been watching the door for an hour before anyone noticed. When it finally opened, she didn't move at first — just watched, deciding.\"",
};

export default function StyleLibrary() {
  const styles = getAllStyles();
  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl sm:text-4xl mb-2">Style Library</h1>
          <p className="text-muted-foreground">Six distinct voices for any topic. Use them as a foundation — your real perspective always comes through.</p>
        </div>
        <Button variant="outline" asChild className="rounded-full" data-testid="styles-manage-btn">
          <Link to="/settings"><SettingsIcon className="w-4 h-4 mr-2" /> Manage custom styles</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {styles.map(s => {
          const Icon = ICONS[s.id] || Sparkles;
          const example = EXAMPLES[s.id] || s.tagline;
          const c = STYLE_COLORS[s.color] || STYLE_COLORS["amber"];
          return (
            <Card key={s.id}
              className={`hover:shadow-md transition-all border-2 hover:${c.border}`}
              data-testid={`style-lib-${s.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} grid place-items-center shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-display text-xl flex items-center gap-2">
                      {s.name}
                      {s.custom && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Custom</Badge>}
                    </div>
                    <div className={`text-xs uppercase tracking-widest mt-0.5 ${c.text}`}>{s.vibe}</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{s.tagline}</p>
                <blockquote className={`${c.bg} border-l-4 ${c.border} rounded-r-lg p-4 text-sm italic leading-relaxed`}>
                  {example}
                </blockquote>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${c.badge}`}>Tone-locked</span>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${c.badge}`}>Anti-AI tells</span>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${c.badge}`}>Human cadence</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

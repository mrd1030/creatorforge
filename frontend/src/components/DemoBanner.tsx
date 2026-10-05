// Public demo banner (demo branch only): what's left today and a link to buy the template.
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshDemo, useDemo } from "@/lib/demo";

const SHOWN = ["generate_all", "regenerate", "polish"];

const singular = (label: string) => label.replace(/(sh|ch|x)es$/, "$1").replace(/s$/, "");

export default function DemoBanner() {
  const demo = useDemo();
  useEffect(() => { refreshDemo(); }, []);
  if (!demo.demo) return null;

  const left = SHOWN
    .map(k => demo.features[k])
    .filter(Boolean)
    .map(f => `${f.remaining} ${f.remaining === 1 ? singular(f.label) : f.label}`)
    .join(" · ");

  return (
    <div className="relative z-10 border-b border-border bg-primary/10" data-testid="demo-banner">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles className="w-4 h-4 text-primary" /> Live demo
        </span>
        <span className="text-muted-foreground">
          Left today: {left}. Try every export free on the sample article in My Drafts.
        </span>
        {demo.buyUrl && (
          <Button asChild size="sm" className="ml-auto bg-primary hover:bg-primary/90 text-primary-foreground">
            <a href={demo.buyUrl} target="_blank" rel="noopener noreferrer">Get the full template</a>
          </Button>
        )}
      </div>
    </div>
  );
}

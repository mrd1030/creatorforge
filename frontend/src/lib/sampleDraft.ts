// A finished sample article for the public demo (demo branch only). Seeded once on a visitor's
// first demo visit so every finishing feature can be explored without spending API calls.
import type { Block, BlockType, Draft } from "@/types";
import { BLOCK_LIBRARY } from "@/lib/templates";
import { newDraft, uid } from "@/lib/storage";

function block(type: BlockType, content: string, note = ""): Block {
  const label = BLOCK_LIBRARY.find(b => b.type === type)?.label || type;
  return { id: uid("blk"), type, label, note, content };
}

export function sampleDraft(): Draft {
  const d = newDraft("professional-educator");
  d.brief = {
    ...d.brief,
    niche: "Pet Care",
    topic: "Keeping a senior dog comfortable through the cold months",
    audience: "Owners of dogs aged 8 and up whose dogs are slowing down as the weather turns cold.",
    length: "medium",
    keyPoints: "- Why cold, damp weather is harder on older joints\n- Adjusting walks without cutting exercise\n- Warm, supportive places to rest\n- Paw and coat care in winter\n- Signs that call for a vet visit",
    angle: "Practical and calm: small changes at home make the biggest difference, and none of them require special gear.",
    focusKeyword: "senior dog winter care",
    metaDescription: "Senior dog winter care, simplified: shorter walks, warm resting spots, paw care, and the warning signs that mean an older dog should see a vet this season.",
    categories: ["Dogs", "Pet Care"],
    tags: ["senior-dogs", "winter", "dog-health", "joint-care"],
    slug: "senior-dog-winter-care",
  };
  d.headerImage = {
    prompt: "An old golden retriever with a grey muzzle curled up on a thick fleece bed beside a sunny window in winter, soft morning light, frost on the glass, cozy living room, shallow depth of field, warm natural tones, 35mm lens, calm and gentle mood",
    alt: "Grey-muzzled older dog resting on a fleece bed by a frosty window",
    url: "",
  };
  d.affiliate = { ...d.affiliate, enabled: false };
  d.blocks = [
    block("title", "Senior Dogs and Cold Weather: A Practical Comfort Guide"),
    block("prologue",
      "Cold weather often makes a dog's age more visible. Stretches take longer, stairs get a second look, and the first walk of the morning starts slowly. Most of what helps an older dog through winter happens at home, and very little of it is complicated."),
    block("paragraph",
      "Cold, damp air tends to make stiff joints feel stiffer, so a dog who moved easily in early autumn can seem creaky by midwinter. That is not a reason to cut activity. Regular movement keeps muscles strong and joints working. What changes is the structure of the day: shorter outings, a slower warm-up, and a soft, warm place to recover afterward. The goal is to adjust the routine, not shrink it."),
    block("tips",
      "- Replace one long walk with two or three shorter ones, starting at an easy pace.\n- Keep beds away from drafts and cold floors, and add a thick fleece or orthopedic pad.\n- Rinse and dry paws after walks on salted or gritted roads.\n- Keep nails trimmed for better grip, and lay rugs over slippery floors.\n- Consider a fitted coat for thin-coated dogs or dogs that shiver outdoors.\n- Place fresh water close to resting spots, since some older dogs drink less in cold weather."),
    block("key-facts",
      "- Many older dogs show more joint stiffness in cold, damp weather.\n- Shorter, more frequent walks are usually easier on aging joints than one long one.\n- Road salt and ice can dry out and crack paw pads.\n- Changes in appetite, thirst, sleep, or mobility warrant a vet visit.\n- Many vets recommend checkups twice a year for senior dogs."),
    block("table",
      "| Area | What to watch for | Simple fix |\n| --- | --- | --- |\n| Joints | Slow to stand, stiff first steps | Gentle warm-up walk, padded bed |\n| Paws | Dry or cracked pads, licking | Rinse after walks, paw balm |\n| Sleeping spot | Drafts, cold tile floor | Raised bed, extra blanket |\n| Floors | Slipping on hard surfaces | Rugs or runners on main paths |\n| Water | Bowl left untouched | Fresh water near the bed |"),
    block("chart",
      "An example split of a winter day's activity for an older dog, in minutes. The right amounts vary by dog and are best set with a vet.\n\n```json\n{\"labels\": [\"Short walks\", \"Indoor play\", \"Sniff games\", \"Brushing and check-over\"], \"values\": [30, 15, 10, 10]}\n```",
      "Illustrative split of a winter routine"),
    block("conclusion",
      "Age does not have to mean a hard winter. A warmer bed, gentler walks, and a quick daily paw check go a long way. Most older dogs still want to take part in everything; these small changes simply make that easier."),
  ];
  return d;
}

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
  const d = newDraft("real-person");
  d.brief = {
    ...d.brief,
    niche: "Pet Care",
    topic: "Keeping a senior dog comfortable through the cold months",
    audience: "Owners of dogs aged 8 and up who are noticing their dog slow down as the weather turns cold.",
    length: "medium",
    keyPoints: "- Why cold, damp weather is harder on older joints\n- Adjusting walks without cutting exercise\n- Warm, supportive places to rest\n- Paw and coat care in winter\n- Signs that mean it's time to call the vet",
    angle: "Practical and reassuring: small changes at home make the biggest difference, and none of them need special gear.",
    focusKeyword: "senior dog winter care",
    metaDescription: "Senior dog winter care made simple: gentler walks, warm resting spots, paw care, and the signs that mean your older dog should see the vet this season.",
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
    block("title", "How to Keep a Senior Dog Comfortable Through the Cold Months"),
    block("prologue",
      "The first cold morning of the year has a way of showing you how old your dog has gotten. The stretch takes longer. The stairs get a second look. The good news is that most of what helps an older dog through winter happens at home, and none of it is complicated."),
    block("paragraph",
      "Cold, damp air tends to make stiff joints feel stiffer, so an older dog who moved fine in September can look creaky by December. That doesn't mean they need less activity. Movement keeps muscles strong and joints working. What changes is the shape of the day: shorter outings, a slower warm-up, and a soft, warm place to recover afterward. Think of it as adjusting the routine rather than shrinking it."),
    block("tips",
      "- Swap one long walk for two or three short ones, and let the first few minutes be slow.\n- Move the bed away from drafts and cold floors, and add a thick fleece or orthopedic pad.\n- Rinse and dry paws after walks on salted or gritted roads.\n- Keep nails trimmed so feet grip well on slick floors, and add rugs where they slip.\n- If your dog has a thin coat or shivers outside, a simple fitted coat is worth trying.\n- Keep fresh water easy to reach; some older dogs drink less in cold weather."),
    block("key-facts",
      "- Many older dogs feel joint stiffness more in cold, damp weather.\n- Shorter, more frequent walks are usually easier on aging joints than one long one.\n- Road salt and ice can dry out and crack paw pads.\n- Changes in appetite, thirst, sleep, or mobility are worth a vet visit rather than waiting.\n- Many vets suggest checkups twice a year for senior dogs."),
    block("table",
      "| Area | What to watch for | Easy fix |\n| --- | --- | --- |\n| Joints | Slow to stand, stiff first steps | Gentle warm-up walk, padded bed |\n| Paws | Dry or cracked pads, licking | Rinse after walks, paw balm |\n| Sleeping spot | Drafts, cold tile floor | Raise the bed, add a blanket |\n| Floors | Slipping on hard surfaces | Rugs or runners on main paths |\n| Water | Bowl left untouched | Fresh water near the bed |"),
    block("chart",
      "An example of how a winter day's activity might be split for an older dog, in minutes. Your vet can help you set the right amounts for yours.\n\n```json\n{\"labels\": [\"Short walks\", \"Indoor play\", \"Sniff games\", \"Brushing and check-over\"], \"values\": [30, 15, 10, 10]}\n```",
      "Illustrative split of a winter routine"),
    block("conclusion",
      "Getting older doesn't have to mean a hard winter. A warmer bed, gentler walks, and a quick look at their paws each day go a long way. Your dog will still want to be part of everything. You're just making it a little easier for them to say yes."),
  ];
  return d;
}

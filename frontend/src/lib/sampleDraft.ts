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
    niche: "Food & Recipes",
    topic: "A simple Sunday meal prep that makes the whole week easier",
    audience: "Busy people who want home-cooked weeknight meals without cooking every night.",
    length: "medium",
    keyPoints: "- Why a little prep on Sunday saves time all week\n- Cooking base ingredients instead of full meals\n- A mix-and-match plan for five dinners\n- Storage tips that keep food fresh\n- How to keep it from getting boring",
    angle: "Relaxed and practical: one or two hours of prep, no fancy equipment, and meals that still feel fresh on Thursday.",
    focusKeyword: "sunday meal prep",
    metaDescription: "A simple Sunday meal prep plan: cook a few base ingredients once, then mix and match fresh, easy dinners all week with almost no weeknight cooking at all.",
    categories: ["Meal Prep", "Quick Meals", "Dinner"],
    tags: ["meal-prep", "weeknight-dinners", "batch-cooking", "healthy-eating"],
    slug: "simple-sunday-meal-prep",
  };
  d.headerImage = {
    prompt: "Overhead shot of a bright kitchen counter with glass meal prep containers filled with roasted vegetables, grains, grilled chicken and colorful sauces, fresh herbs and a wooden cutting board, soft natural window light, clean and inviting, 35mm lens",
    alt: "Glass containers of roasted vegetables, grains and sauces on a sunny counter",
    url: "",
  };
  d.affiliate = { ...d.affiliate, enabled: false };
  d.blocks = [
    block("title", "A Simple Sunday Meal Prep That Makes the Whole Week Easier"),
    block("prologue",
      "Monday night, 6:30, nothing planned, and the takeout app is already open. A little Sunday prep changes that moment completely. Spend an hour or two once, and most weeknight dinners come together in about ten minutes."),
    block("paragraph",
      "The trick is to prep ingredients, not finished meals. Five identical containers of the same dish get old by Wednesday. A tray of roasted vegetables, a pot of grains, a batch of protein, and a couple of sauces can become a grain bowl one night, tacos the next, and a quick stir-fry after that. Everything is ready, but dinner still feels like a choice."),
    block("tips",
      "- Roast two sheet pans of vegetables at once, using different seasonings on each.\n- Cook a big pot of one grain, like rice or quinoa, and let it cool before storing.\n- Prepare one or two proteins, such as chicken thighs, baked tofu, or a pot of beans.\n- Make two sauces with different flavors, like a lemon tahini and a quick salsa.\n- Wash and chop fresh greens and herbs so they are ready to grab.\n- Store everything separately so each meal can be mixed differently."),
    block("key-facts",
      "- Prepping components instead of full meals keeps the week from feeling repetitive.\n- Most cooked dishes keep well in the fridge for three to four days.\n- Letting food cool before sealing containers helps keep it fresh.\n- Freezing a few portions extends the plan into the following week.\n- Clear containers make it easier to see what needs to be used first."),
    block("table",
      "| Night | Base | Protein | Finish with |\n| --- | --- | --- | --- |\n| Monday | Rice | Chicken | Roasted veg and tahini |\n| Tuesday | Tortillas | Beans | Salsa and greens |\n| Wednesday | Quinoa | Tofu | Stir-fried veg and soy glaze |\n| Thursday | Pasta | Chicken | Roasted veg and herbs |\n| Friday | Greens | Beans | Everything left over, as a big salad |"),
    block("chart",
      "An example of how a two-hour prep session might be split, in minutes. Adjust it to the recipes chosen for the week.\n\n```json\n{\"labels\": [\"Chopping\", \"Roasting vegetables\", \"Cooking grains\", \"Cooking protein\", \"Sauces and packing\"], \"values\": [25, 35, 20, 25, 15]}\n```",
      "Illustrative split of a prep session"),
    block("conclusion",
      "Meal prep does not need to be perfect or elaborate. A few ready ingredients and two good sauces turn every weeknight into a quick, satisfying dinner. Start small this Sunday, and by Thursday the extra time will speak for itself."),
  ];
  return d;
}

import type {
  ClosetFormality,
  ClosetSeason,
  GarmentCategory,
  RecommendedOutfit,
  StyleOccasion,
  WardrobeItemMetadata,
  WeatherProfile,
} from "@/types/closet";
import { isNeutralColor } from "./garment-tags";

/**
 * Deterministic outfit builder used when no AI provider is configured or the
 * provider's answer is unusable. Works only on image-free metadata.
 */

export interface OutfitBrief {
  occasion: StyleOccasion;
  weather: WeatherProfile;
  styleNote?: string;
  pinnedItemIds?: string[];
}

const FORMALITY_SCORE: Record<StyleOccasion, Record<ClosetFormality, number>> = {
  Casual: { Casual: 3, "Smart casual": 2, Business: 0, Formal: -1.5 },
  Work: { Casual: 0, "Smart casual": 3, Business: 3, Formal: 1.5 },
  "Night Out": { Casual: 1, "Smart casual": 3, Business: 1.5, Formal: 2.5 },
};

const SEASON_SCORE: Record<WeatherProfile, Record<ClosetSeason, number>> = {
  Warm: { Summer: 3, Spring: 2, "All season": 1.5, Autumn: 0, Winter: -2 },
  Mild: { Spring: 2, Autumn: 2, "All season": 2, Summer: 1, Winter: 0 },
  Cool: { Winter: 3, Autumn: 2.5, "All season": 1.5, Spring: 0.5, Summer: -1.5 },
};

const WARM_WEATHER_MATERIALS = /linen|cotton|seersucker|chambray|jersey/i;
const COOL_WEATHER_MATERIALS = /wool|cashmere|knit|fleece|leather|suede|corduroy|flannel|down|tweed/i;

const TITLES: Record<StyleOccasion, string[]> = {
  Casual: ["Easy Layers", "Clean Weekend", "Relaxed Contrast"],
  Work: ["Quiet Authority", "Soft Tailoring", "Desk to Dinner"],
  "Night Out": ["After Dark", "Tonal Statement", "Late Reservation"],
};

const REASON_LEADS: Record<StyleOccasion, string[]> = {
  Casual: ["An easy pairing of", "A laid-back mix of", "A relaxed take on"],
  Work: ["A polished pairing of", "A composed mix of", "An office-ready take on"],
  "Night Out": ["A sharp pairing of", "An evening-ready mix of", "A confident take on"],
};

const LAYER_PURPOSE: Record<WeatherProfile, string> = {
  Warm: "light layer",
  Mild: "layer for changing temperatures",
  Cool: "warm outer layer",
};

const CANDIDATES_PER_SLOT = 4;
const MAX_OUTFITS = 3;
// Per previous use. Kept modest because distinctness is enforced separately
// (see coreKey), so a well-matched piece may still appear in two looks.
const REUSE_PENALTY = 1.5;
const PINNED_REUSE_PENALTY = 0.5;

type Slot = { category: GarmentCategory; required: boolean };

function tokenize(note: string | undefined): string[] {
  return [...new Set((note ?? "").toLowerCase().match(/[a-z]{3,}/g) ?? [])].slice(0, 12);
}

function scoreItem(item: WardrobeItemMetadata, brief: OutfitBrief, noteTokens: string[], pinned: Set<string>): number {
  let score = item.formality ? FORMALITY_SCORE[brief.occasion][item.formality] : 1.5;
  score += SEASON_SCORE[brief.weather][item.season];

  const material = item.material ?? "";
  if (brief.weather === "Warm" && WARM_WEATHER_MATERIALS.test(material)) score += 0.5;
  if (brief.weather === "Cool" && COOL_WEATHER_MATERIALS.test(material)) score += 0.5;

  if (noteTokens.length > 0) {
    const haystack = [item.name, item.color.name, material, item.fit ?? "", ...item.styleTags].join(" ").toLowerCase();
    const matches = noteTokens.filter((token) => haystack.includes(token)).length;
    score += Math.min(3, matches * 1.5);
  }

  if (pinned.has(item.id)) score += 4;
  return score;
}

/** Rewards one accent color against neutrals; penalizes competing accents. */
function scoreHarmony(items: WardrobeItemMetadata[]): number {
  const accents = new Set(items.filter((item) => !isNeutralColor(item.color)).map((item) => item.color.name.toLowerCase()));
  if (accents.size === 0) return 0.5;
  if (accents.size === 1) return 1.2;
  return -1.5 * (accents.size - 1) - (accents.size > 2 ? 2 : 0);
}

function slotsFor(weather: WeatherProfile, hasPinnedOuterwear: boolean): Slot[] {
  return [
    { category: "top", required: true },
    { category: "bottom", required: true },
    // Cool weather needs a layer; warm weather skips it unless the user pinned one.
    ...(weather === "Warm" && !hasPinnedOuterwear
      ? []
      : [{ category: "outerwear" as const, required: weather === "Cool" }]),
    { category: "footwear", required: true },
    { category: "accessory", required: false },
  ];
}

/** Identity of a look without its accessory, so looks must differ in real pieces. */
function coreKey(combo: WardrobeItemMetadata[]): string {
  return combo.filter((item) => item.category !== "accessory").map((item) => item.id).sort().join("|");
}

function describeOutfit(items: WardrobeItemMetadata[], brief: OutfitBrief, index: number): string {
  const byCategory = new Map(items.map((item) => [item.category, item]));
  const core = [byCategory.get("top"), byCategory.get("bottom")].filter((item): item is WardrobeItemMetadata => Boolean(item));
  const anchor = (core.length > 0 ? core : items.slice(0, 2)).map((item) => item.name).join(" and ");

  const accents = [...new Set(items.filter((item) => !isNeutralColor(item.color)).map((item) => item.color.name.toLowerCase()))];
  const palette = accents.length === 0
    ? "an all-neutral palette"
    : accents.length === 1
      ? `${accents[0]} as the one accent against neutrals`
      : `a deliberate ${accents.slice(0, 2).join(" and ")} color pairing`;

  const layer = byCategory.get("outerwear");
  const layerClause = layer ? `, with the ${layer.name} as a ${LAYER_PURPOSE[brief.weather]}` : "";
  const leads = REASON_LEADS[brief.occasion];
  return `${leads[index % leads.length]} ${anchor}, built on ${palette}${layerClause}.`;
}

export function recommendOutfitsLocally(items: WardrobeItemMetadata[], brief: OutfitBrief): RecommendedOutfit[] {
  const pinned = new Set(brief.pinnedItemIds ?? []);
  const noteTokens = tokenize(brief.styleNote);
  const scores = new Map(items.map((item) => [item.id, scoreItem(item, brief, noteTokens, pinned)]));
  const score = (item: WardrobeItemMetadata) => scores.get(item.id) ?? 0;

  const hasPinnedOuterwear = items.some((item) => item.category === "outerwear" && pinned.has(item.id));
  const slotOptions = slotsFor(brief.weather, hasPinnedOuterwear).flatMap(({ category, required }) => {
    const candidates = items
      .filter((item) => item.category === category)
      .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
      .slice(0, CANDIDATES_PER_SLOT);
    if (candidates.length === 0) return [];
    return [required ? candidates : [...candidates, null]];
  });
  if (slotOptions.length === 0) return [];

  // Every combination of the top candidates per slot: at most 5^5 = 3125.
  let combinations: WardrobeItemMetadata[][] = [[]];
  for (const options of slotOptions) {
    combinations = combinations.flatMap((partial) => options.map((option) => (option ? [...partial, option] : partial)));
  }
  combinations = combinations.filter((combo) => combo.length >= Math.min(2, items.length));

  const usage = new Map<string, number>();
  const chosenCores = new Set<string>();
  const outfits: RecommendedOutfit[] = [];

  for (let index = 0; index < MAX_OUTFITS; index += 1) {
    let best: { combo: WardrobeItemMetadata[]; total: number } | null = null;

    for (const combo of combinations) {
      // A look that only adds or drops an accessory is not a new outfit.
      if (chosenCores.has(coreKey(combo))) continue;

      // Pinned pieces are meant to repeat, so their reuse penalty is mild.
      const reusePenalty = combo.reduce((sum, item) => (
        sum + (usage.get(item.id) ?? 0) * (pinned.has(item.id) ? PINNED_REUSE_PENALTY : REUSE_PENALTY)
      ), 0);
      const total = combo.reduce((sum, item) => sum + score(item), 0) + scoreHarmony(combo) - reusePenalty;
      if (!best || total > best.total) best = { combo, total };
    }

    if (!best) break;
    chosenCores.add(coreKey(best.combo));
    best.combo.forEach((item) => usage.set(item.id, (usage.get(item.id) ?? 0) + 1));
    outfits.push({
      id: `local-${brief.occasion}-${brief.weather}-${index + 1}`.toLowerCase().replace(/\s+/g, "-"),
      title: TITLES[brief.occasion][index % TITLES[brief.occasion].length],
      reason: describeOutfit(best.combo, brief, index),
      itemIds: best.combo.map((item) => item.id),
    });
  }

  return outfits;
}

/**
 * Cleans a model-proposed outfit: unknown ids are dropped (the AI cannot add
 * clothes that do not exist), duplicates removed, and at most one item kept
 * per category. Returns null when fewer than two real items remain.
 */
export function normalizeOutfitItemIds(
  itemIds: unknown,
  itemsById: Map<string, WardrobeItemMetadata>,
): string[] | null {
  if (!Array.isArray(itemIds)) return null;
  const usedCategories = new Set<GarmentCategory>();
  const cleaned: string[] = [];

  for (const rawId of itemIds) {
    if (typeof rawId !== "string") continue;
    const item = itemsById.get(rawId.trim());
    if (!item || cleaned.includes(item.id) || usedCategories.has(item.category)) continue;
    usedCategories.add(item.category);
    cleaned.push(item.id);
  }

  const minimum = Math.min(2, itemsById.size);
  return cleaned.length >= minimum ? cleaned : null;
}

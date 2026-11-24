import type {
  ClosetFit,
  ClosetFormality,
  ClosetSeason,
  GarmentCategory,
  GarmentTags,
} from "@/types/closet";
import {
  GARMENT_COLOR_PALETTE,
  isNeutralColor,
  nearestPaletteColor,
  paletteColorFromText,
} from "./garment-tags";

/**
 * Deterministic tagger used when no AI provider key is configured or the
 * provider fails. It cannot see the photo the way a vision model does, so it
 * combines the cheap signals the browser sends: file name keywords, the
 * garment's dominant color, and the photo's aspect ratio.
 */

export interface LocalTagHints {
  fileName?: string;
  dominantHex?: string;
  width?: number;
  height?: number;
}

interface KeywordRule {
  pattern: RegExp;
  category: GarmentCategory;
  noun: string;
}

// Ordered: "overshirt" must hit outerwear before "shirt" hits tops, and
// "denim jacket" must not become jeans.
const KEYWORD_RULES: KeywordRule[] = [
  { pattern: /\b(blazer|sport ?coat)s?\b/, category: "outerwear", noun: "Blazer" },
  { pattern: /\b(trench|overcoat|top ?coat|coat|parka)s?\b/, category: "outerwear", noun: "Coat" },
  { pattern: /\b(puffer|down jacket)s?\b/, category: "outerwear", noun: "Puffer Jacket" },
  { pattern: /\b(overshirt|shacket)s?\b/, category: "outerwear", noun: "Overshirt" },
  { pattern: /\b(bomber|jacket|windbreaker|anorak|gilet)s?\b/, category: "outerwear", noun: "Jacket" },
  { pattern: /\bcardigans?\b/, category: "outerwear", noun: "Cardigan" },
  { pattern: /\b(sneaker|trainer|runner)s?\b/, category: "footwear", noun: "Sneakers" },
  { pattern: /\b(boot|chelsea)s?\b/, category: "footwear", noun: "Boots" },
  { pattern: /\b(loafer|derby|brogue|oxford shoe|dress shoe)s?\b/, category: "footwear", noun: "Loafers" },
  { pattern: /\b(sandal|slide|flip ?flop)s?\b/, category: "footwear", noun: "Sandals" },
  { pattern: /\b(shoe|heel)s?\b/, category: "footwear", noun: "Shoes" },
  { pattern: /\b(jean)s?\b/, category: "bottom", noun: "Jeans" },
  { pattern: /\b(chino)s?\b/, category: "bottom", noun: "Chinos" },
  { pattern: /\b(jogger|sweatpant|track ?pant)s?\b/, category: "bottom", noun: "Joggers" },
  { pattern: /\b(short)s?\b/, category: "bottom", noun: "Shorts" },
  { pattern: /\b(skirt)s?\b/, category: "bottom", noun: "Skirt" },
  { pattern: /\b(trouser|pant|slack|cargo|legging)s?\b/, category: "bottom", noun: "Trousers" },
  { pattern: /\b(backpack|tote|bag|purse|clutch)s?\b/, category: "accessory", noun: "Bag" },
  { pattern: /\b(belt)s?\b/, category: "accessory", noun: "Belt" },
  { pattern: /\b(cap|hat|beanie|bucket hat)s?\b/, category: "accessory", noun: "Hat" },
  { pattern: /\b(scarf|scarves)\b/, category: "accessory", noun: "Scarf" },
  { pattern: /\b(watch|watches)\b/, category: "accessory", noun: "Watch" },
  { pattern: /\b(sunglass|glass)es\b/, category: "accessory", noun: "Sunglasses" },
  { pattern: /\b(tie|necktie)s?\b/, category: "accessory", noun: "Tie" },
  { pattern: /\b(hoodie|hoody)s?\b/, category: "top", noun: "Hoodie" },
  { pattern: /\b(sweatshirt|crewneck)s?\b/, category: "top", noun: "Sweatshirt" },
  { pattern: /\b(sweater|jumper|knit|pullover)s?\b/, category: "top", noun: "Sweater" },
  { pattern: /\b(polo)s?\b/, category: "top", noun: "Polo" },
  { pattern: /\b(t ?shirt|tee)s?\b/, category: "top", noun: "Tee" },
  { pattern: /\b(oxford|button ?down|shirt|blouse)s?\b/, category: "top", noun: "Shirt" },
  { pattern: /\b(tank|vest|cami)s?\b/, category: "top", noun: "Tank" },
  { pattern: /\b(top)s?\b/, category: "top", noun: "Top" },
];

const DEFAULT_NOUNS: Record<GarmentCategory, string> = {
  top: "Top",
  bottom: "Trousers",
  outerwear: "Jacket",
  footwear: "Shoes",
  accessory: "Accessory",
};

const MATERIAL_RULES: [RegExp, string][] = [
  [/\b(denim|jeans?)\b/, "Denim"],
  [/\bleather\b/, "Leather"],
  [/\bsuede\b/, "Suede"],
  [/\bcashmere\b/, "Cashmere"],
  [/\b(wool|merino|knit|sweater|jumper|cardigan)\b/, "Wool blend"],
  [/\blinen\b/, "Linen"],
  [/\bsilk\b/, "Silk"],
  [/\bcorduroy|cord\b/, "Corduroy"],
  [/\b(fleece|hoodie|sweatshirt|jogger)s?\b/, "Cotton fleece"],
  [/\b(nylon|puffer|windbreaker|rain)\b/, "Nylon"],
];

const DEFAULT_MATERIALS: Record<GarmentCategory, string> = {
  top: "Cotton",
  bottom: "Cotton twill",
  outerwear: "Cotton blend",
  footwear: "Leather",
  accessory: "Leather",
};

// Camera and messenger defaults carry no information about the garment.
const GENERIC_FILE_NAME = /^(img|dsc|dscn|pxl|mvimg|photo|image|picture|screenshot|screen shot|whatsapp|signal|snapchat|download|file|untitled)\b|^[\d\s_-]+$/i;

function normalizeFileName(fileName: string | undefined): string {
  return (fileName ?? "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_\-.+]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function categoryFromShape(width: number | undefined, height: number | undefined): GarmentCategory {
  if (!width || !height) return "top";
  const ratio = height / width;
  // Flat-lay trousers are tall and narrow; a side-on pair of shoes is wide.
  if (ratio >= 1.45) return "bottom";
  if (ratio <= 0.8) return "footwear";
  return "top";
}

function fitFromWords(words: string): ClosetFit {
  if (/\b(oversized?|boxy)\b/.test(words)) return "Oversized";
  if (/\b(slim|skinny|fitted)\b/.test(words)) return "Slim";
  if (/\b(relaxed|wide|baggy|loose|straight)\b/.test(words)) return "Relaxed";
  if (/\b(tailored|suit)\b/.test(words) || /\bblazer\b/.test(words)) return "Tailored";
  return "Regular";
}

function formalityFromWords(words: string): ClosetFormality {
  if (/\b(suit|tuxedo|tie|necktie|cufflinks?|gown)\b/.test(words)) return "Formal";
  if (/\b(blazer|loafers?|derby|brogues?|dress shoes?|oxford|trousers?|slacks?|button ?down)\b/.test(words)) return "Smart casual";
  if (/\b(chinos?|polo|cardigan|coat|knit|sweater|boots?)\b/.test(words)) return "Smart casual";
  return "Casual";
}

function seasonFromWords(words: string, category: GarmentCategory): ClosetSeason {
  if (/\b(shorts?|tank|linen|sandals?|slides?|flip ?flops?|swim)\b/.test(words)) return "Summer";
  if (/\b(parka|puffer|down|overcoat|beanie|scarf|gloves?|thermal)\b/.test(words)) return "Winter";
  if (/\b(coat|wool|knit|sweater|jumper|cardigan|boots?|corduroy|flannel)\b/.test(words)) return "Autumn";
  return category === "outerwear" ? "Autumn" : "All season";
}

export function inferGarmentTagsLocally(hints: LocalTagHints): GarmentTags {
  const words = normalizeFileName(hints.fileName);
  const rule = KEYWORD_RULES.find(({ pattern }) => pattern.test(words));
  const category = rule?.category ?? categoryFromShape(hints.width, hints.height);
  const noun = rule?.noun ?? DEFAULT_NOUNS[category];

  const color = paletteColorFromText(words)
    ?? (hints.dominantHex ? nearestPaletteColor(hints.dominantHex) : null)
    ?? GARMENT_COLOR_PALETTE[0];
  const material = MATERIAL_RULES.find(([pattern]) => pattern.test(words))?.[1] ?? DEFAULT_MATERIALS[category];
  const fit = fitFromWords(words);
  const formality = formalityFromWords(words);
  const season = seasonFromWords(words, category);

  const descriptiveName = words && !GENERIC_FILE_NAME.test(words) && /[a-z]{3,}/.test(words)
    ? titleCase(words).slice(0, 60)
    : null;

  const styleTags = [
    formality === "Casual" ? "everyday" : formality.toLowerCase(),
    category === "outerwear" ? "layering" : category === "accessory" ? "finishing touch" : "versatile",
    isNeutralColor(color) ? "neutral" : "statement color",
    ...(fit === "Regular" ? [] : [fit.toLowerCase()]),
  ];

  return {
    name: descriptiveName ?? `${color.name} ${noun}`,
    category,
    color,
    material,
    fit,
    season,
    formality,
    styleTags: [...new Set(styleTags)],
  };
}

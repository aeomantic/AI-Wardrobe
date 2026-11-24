import type {
  ClosetColor,
  ClosetFit,
  ClosetFormality,
  ClosetItem,
  ClosetSeason,
  GarmentCategory,
  GarmentPhotoType,
  GarmentTags,
  GarmentVisualAnalysis,
  WardrobeItemMetadata,
} from "@/types/closet";

/**
 * Shared garment vocabulary. Safe on both client and server: the tagging and
 * recommendation routes validate against it, and the review UI renders it.
 */

export const GARMENT_CATEGORIES: readonly GarmentCategory[] = ["top", "bottom", "outerwear", "footwear", "accessory"];
export const CLOSET_SEASONS: readonly ClosetSeason[] = ["All season", "Spring", "Summer", "Autumn", "Winter"];
export const CLOSET_FITS: readonly ClosetFit[] = ["Slim", "Regular", "Relaxed", "Oversized", "Tailored"];
export const CLOSET_FORMALITIES: readonly ClosetFormality[] = ["Casual", "Smart casual", "Business", "Formal"];

export const GARMENT_COLOR_PALETTE: readonly ClosetColor[] = [
  { name: "Black", hex: "#252525" },
  { name: "Charcoal", hex: "#3D4043" },
  { name: "Grey", hex: "#8A8D90" },
  { name: "Slate", hex: "#6D7378" },
  { name: "Silver", hex: "#B9BAB8" },
  { name: "White", hex: "#F4F2EC" },
  { name: "Cream", hex: "#E8E0D0" },
  { name: "Beige", hex: "#D9C8A9" },
  { name: "Khaki", hex: "#B6A57A" },
  { name: "Tan", hex: "#C09A6B" },
  { name: "Camel", hex: "#B5834F" },
  { name: "Brown", hex: "#6E4B33" },
  { name: "Navy", hex: "#273349" },
  { name: "Denim", hex: "#6F849A" },
  { name: "Blue", hex: "#3E5F9A" },
  { name: "Light Blue", hex: "#9DB7D5" },
  { name: "Teal", hex: "#2D7A7A" },
  { name: "Green", hex: "#3F7A4A" },
  { name: "Olive", hex: "#74745B" },
  { name: "Mustard", hex: "#C99A2E" },
  { name: "Yellow", hex: "#E3C341" },
  { name: "Orange", hex: "#E07B34" },
  { name: "Rust", hex: "#A8502F" },
  { name: "Clay", hex: "#A8664C" },
  { name: "Red", hex: "#B3322E" },
  { name: "Burgundy", hex: "#6B1F2E" },
  { name: "Pink", hex: "#E4A3B5" },
  { name: "Lavender", hex: "#B9A7D6" },
  { name: "Purple", hex: "#6B4C8A" },
  { name: "Gold", hex: "#C9A54A" },
  { name: "Multi", hex: "#B7A99A" },
];

// Colors that pair with anything. The outfit matcher allows at most one
// non-neutral "statement" color per look.
const NEUTRAL_COLOR_NAMES = new Set([
  "black", "charcoal", "grey", "gray", "slate", "silver", "white", "off white", "cream", "beige",
  "khaki", "tan", "camel", "brown", "navy", "navy blue", "denim", "olive", "taupe", "nude", "steel",
]);

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

type Lch = [lightness: number, chroma: number, hue: number];

/** sRGB hex to CIE LCh (D65), so distances follow perceived hue, not raw RGB. */
function hexToLch(hex: string): Lch {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const a = 500 * (fx - fy);
  const bStar = 200 * (fy - fz);
  return [116 * fy - 16, Math.hypot(a, bStar), Math.atan2(bStar, a)];
}

/**
 * Lightness is down-weighted because phone photos vary in exposure; hue is
 * up-weighted so a muted sage green lands on a green, not on khaki or grey.
 */
function lchDistance([l1, c1, h1]: Lch, [l2, c2, h2]: Lch): number {
  const hueDelta = 2 * Math.sqrt(c1 * c2) * Math.sin((h1 - h2) / 2);
  return (0.5 * (l1 - l2)) ** 2 + (c1 - c2) ** 2 + (2 * hueDelta) ** 2;
}

const PALETTE_LCH = GARMENT_COLOR_PALETTE
  .filter((color) => color.name !== "Multi")
  .map((color) => ({ color, lch: hexToLch(color.hex) }));

/** Snaps an arbitrary hex color to the closest named palette color. */
export function nearestPaletteColor(hex: string): ClosetColor {
  if (!HEX_PATTERN.test(hex)) return GARMENT_COLOR_PALETTE[0];
  const target = hexToLch(hex);
  let best = PALETTE_LCH[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of PALETTE_LCH) {
    const distance = lchDistance(target, entry.lch);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best.color;
}

export function paletteColorByName(name: string): ClosetColor | null {
  const normalized = name.trim().toLowerCase();
  return GARMENT_COLOR_PALETTE.find((color) => color.name.toLowerCase() === normalized) ?? null;
}

const PALETTE_BY_NAME_LENGTH = [...GARMENT_COLOR_PALETTE].sort((a, b) => b.name.length - a.name.length);

const COLOR_SYNONYMS: [RegExp, string][] = [
  [/\bgray\b/, "Grey"],
  [/\b(ivory|ecru|off[\s-]?white|bone)\b/, "Cream"],
  [/\b(maroon|wine|oxblood)\b/, "Burgundy"],
  [/\b(sage|mint|forest|emerald|kelly)\b/, "Green"],
  [/\b(army|moss)\b/, "Olive"],
];

/** Finds a palette color named in free text, e.g. "light blue denim" or "washed charcoal". */
export function paletteColorFromText(text: string): ClosetColor | null {
  const words = text.toLowerCase();
  // Qualified names first, so "army green" is Olive and "off-white" is Cream.
  const synonym = COLOR_SYNONYMS.find(([pattern]) => pattern.test(words))?.[1];
  if (synonym) return paletteColorByName(synonym);
  // Longest names first so "light blue" beats "blue".
  return PALETTE_BY_NAME_LENGTH.find((color) => new RegExp(`\\b${color.name.toLowerCase()}\\b`).test(words)) ?? null;
}

export function isNeutralColor(color: ClosetColor): boolean {
  return NEUTRAL_COLOR_NAMES.has(color.name.trim().toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Sanitizers                                                                 */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  // Strip control characters so model output cannot smuggle layout or markup.
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return allowed.find((option) => option.toLowerCase() === normalized) ?? null;
}

export function pickCategory(value: unknown): GarmentCategory | null {
  return pick(value, GARMENT_CATEGORIES);
}

export function pickSeason(value: unknown): ClosetSeason | null {
  // Models often answer "Fall" or "All-season".
  if (typeof value === "string" && /^fall$/i.test(value.trim())) return "Autumn";
  if (typeof value === "string" && /^all[\s-]?seasons?$/i.test(value.trim())) return "All season";
  return pick(value, CLOSET_SEASONS);
}

export function pickFit(value: unknown): ClosetFit | null {
  return pick(value, CLOSET_FITS);
}

export function pickFormality(value: unknown): ClosetFormality | null {
  if (typeof value === "string" && /^smart[\s-]?casual$/i.test(value.trim())) return "Smart casual";
  return pick(value, CLOSET_FORMALITIES);
}

export function sanitizeColor(value: unknown): ClosetColor | null {
  if (!isRecord(value)) return null;
  const name = cleanText(value.name, 40);
  const hex = typeof value.hex === "string" && HEX_PATTERN.test(value.hex.trim()) ? value.hex.trim().toUpperCase() : null;
  if (!name && !hex) return null;
  const named = name ? paletteColorByName(name) : null;
  if (named) return named;
  if (hex) return { name: name || nearestPaletteColor(hex).name, hex };
  return null;
}

export function sanitizeStyleTags(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value
    .map((tag) => cleanText(tag, 32).toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)].slice(0, limit);
}

export const GARMENT_PHOTO_TYPES: readonly GarmentPhotoType[] = ["hanger", "flat-lay", "worn", "other"];

/** Validates the vision model's reasoning notes. Returns null if there are none. */
export function sanitizeVisualAnalysis(value: unknown): GarmentVisualAnalysis | null {
  if (!isRecord(value)) return null;
  const notes = {
    shoulderConstruction: cleanText(value.shoulderConstruction, 240),
    sleeveProportion: cleanText(value.sleeveProportion, 240),
    bodySilhouette: cleanText(value.bodySilhouette, 240),
    trueGarmentColor: cleanText(value.trueGarmentColor, 60),
  };
  if (!Object.values(notes).some(Boolean)) return null;
  const photoType = typeof value.photoType === "string" ? value.photoType.trim().replace(/\s+/g, "-") : null;
  return { photoType: pick(photoType, GARMENT_PHOTO_TYPES) ?? "other", ...notes };
}

/** Validates model output (or any untrusted object) into GarmentTags. */
export function sanitizeGarmentTags(value: unknown): GarmentTags | null {
  if (!isRecord(value)) return null;
  const category = pickCategory(value.category);
  const color = sanitizeColor(value.color);
  const name = cleanText(value.name, 80);
  if (!category || !color || !name) return null;

  return {
    name,
    category,
    color,
    material: cleanText(value.material, 40) || "Unknown",
    fit: pickFit(value.fit) ?? "Regular",
    season: pickSeason(value.season) ?? "All season",
    formality: pickFormality(value.formality) ?? "Casual",
    styleTags: sanitizeStyleTags(value.styleTags),
  };
}

/* -------------------------------------------------------------------------- */
/* Outfit recommender payload                                                 */
/* -------------------------------------------------------------------------- */

export const MAX_RECOMMEND_ITEMS = 500;

/** Builds the image-free payload entry for one closet item, or null for non-garments. */
export function toWardrobeMetadata(item: ClosetItem): WardrobeItemMetadata | null {
  if (item.category === "inspiration") return null;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color,
    season: item.season,
    ...(item.material ? { material: item.material } : {}),
    ...(item.fit ? { fit: item.fit } : {}),
    ...(item.formality ? { formality: item.formality } : {}),
    styleTags: item.styleTags.slice(0, 12),
  };
}

/**
 * Rebuilds one metadata entry from an untrusted request body using an
 * allowlist, so unexpected fields (including any image data) are dropped.
 */
export function sanitizeWardrobeMetadata(value: unknown): WardrobeItemMetadata | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const category = pickCategory(value.category);
  const color = sanitizeColor(value.color);
  if (!id || id.length > 120 || !category || !color) return null;

  const material = cleanText(value.material, 40);
  const fit = pickFit(value.fit);
  const formality = pickFormality(value.formality);
  return {
    id,
    name: cleanText(value.name, 120) || `${color.name} ${category}`,
    category,
    color,
    season: pickSeason(value.season) ?? "All season",
    ...(material ? { material } : {}),
    ...(fit ? { fit } : {}),
    ...(formality ? { formality } : {}),
    styleTags: sanitizeStyleTags(value.styleTags, 12),
  };
}

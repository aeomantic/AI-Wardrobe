export type ClosetCategory =
  | "top"
  | "bottom"
  | "outerwear"
  | "footwear"
  | "accessory"
  | "inspiration";

/** Categories that are real garments, i.e. everything except inspiration pins. */
export type GarmentCategory = Exclude<ClosetCategory, "inspiration">;

export type ClosetFilter = "all" | ClosetCategory;

export type ClosetSeason = "All season" | "Spring" | "Summer" | "Autumn" | "Winter";

export type ClosetFit = "Slim" | "Regular" | "Relaxed" | "Oversized" | "Tailored";

export type ClosetFormality = "Casual" | "Smart casual" | "Business" | "Formal";

export interface ClosetColor {
  name: string;
  hex: string;
}

/**
 * Where an item's photo lives. Uploaded photos are Blobs in IndexedDB and use
 * `imageSrc: "idb://<itemId>"`. Items without a source predate this field and
 * use their `imageSrc` URL directly.
 */
export type ClosetImageSource = "indexeddb" | "external" | "hf-catalog";

/**
 * Provenance for items added from the Hugging Face catalog. Their image URLs are
 * signed and expire, so this is what lets an item fetch a fresh one later.
 */
export interface ClosetCatalogMeta {
  source: "hf-catalog";
  dataset: string;
  itemId: string;
  rowIdx: number;
}

export interface ClosetItem {
  id: string;
  name: string;
  category: ClosetCategory;
  season: ClosetSeason;
  color: ClosetColor;
  imageSrc: string;
  imageSource?: ClosetImageSource;
  sourceUrl?: string;
  material?: string;
  fit?: ClosetFit;
  formality?: ClosetFormality;
  styleTags: string[];
  backgroundRemoved: boolean;
  createdAt: string;
  catalogMeta?: ClosetCatalogMeta;
}

/** New items may bring their own id when their photo was stored under it first. */
export type NewClosetItem = Omit<ClosetItem, "id" | "createdAt"> & { id?: string };

/**
 * The only item shape sent to the outfit recommender. It deliberately has no
 * image fields, so photos never leave the browser for outfit picking.
 */
export interface WardrobeItemMetadata {
  id: string;
  name: string;
  category: GarmentCategory;
  color: ClosetColor;
  season: ClosetSeason;
  material?: string;
  fit?: ClosetFit;
  formality?: ClosetFormality;
  styleTags: string[];
}

/** Structured attributes returned once per photo by the tagging endpoint. */
export interface GarmentTags {
  name: string;
  category: GarmentCategory;
  color: ClosetColor;
  material: string;
  fit: ClosetFit;
  season: ClosetSeason;
  formality: ClosetFormality;
  styleTags: string[];
}

export type StyleOccasion = "Casual" | "Work" | "Night Out";

export type WeatherProfile = "Warm" | "Mild" | "Cool";

export interface GeneratedClosetOutfit {
  id: string;
  title: string;
  reason: string;
  occasion: StyleOccasion;
  weather: WeatherProfile;
  itemIds: string[];
}

/** Which engine produced an AI result. "fallback" is the deterministic local engine. */
export type AiResultSource = "groq" | "openai" | "gemini" | "fallback";

export type AiFallbackReason = "no-api-key" | "provider-error" | "invalid-ai-response";

export interface GarmentTagResponse {
  tags: GarmentTags;
  source: AiResultSource;
  model?: string;
  fallbackReason?: AiFallbackReason;
}

export interface RecommendedOutfit {
  id: string;
  title: string;
  reason: string;
  itemIds: string[];
}

export interface OutfitRecommendResponse {
  outfits: RecommendedOutfit[];
  source: AiResultSource;
  model?: string;
  fallbackReason?: AiFallbackReason;
}

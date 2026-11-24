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

export type AiProviderName = Exclude<AiResultSource, "fallback">;

export type AiFallbackReason = "no-api-key" | "provider-error" | "invalid-ai-response";

/** Whether a live vision model looked at the photo, or the local heuristics guessed. */
export type TagSource = "ai-vision" | "local-fallback";

/** Why tagging fell back. Safe to show: it never carries provider error text. */
export type TagFallbackReason = "missing_api_key" | "api_error" | "parse_error";

export type GarmentPhotoType = "hanger" | "flat-lay" | "worn" | "other";

/**
 * The vision model's notes, written before it picks fit and color. Shown in
 * the review card as "Why AI picked this" and never persisted on the item.
 */
export interface GarmentVisualAnalysis {
  photoType: GarmentPhotoType;
  shoulderConstruction: string;
  sleeveProportion: string;
  bodySilhouette: string;
  trueGarmentColor: string;
}

export interface GarmentTagResponse {
  tags: GarmentTags;
  tagSource: TagSource;
  provider?: AiProviderName;
  model?: string;
  fallbackReason?: TagFallbackReason;
  visualAnalysis?: GarmentVisualAnalysis;
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

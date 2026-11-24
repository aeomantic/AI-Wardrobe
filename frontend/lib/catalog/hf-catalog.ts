import type { ClosetCategory, ClosetColor, ClosetSeason } from "@/types/closet";

export const HF_DATASETS_SERVER = "https://datasets-server.huggingface.co";
export const HF_CATALOG_DATASET = "ashraq/fashion-product-images-small";
export const HF_CATALOG_CONFIG = "default";
export const HF_CATALOG_SPLIT = "train";

export const CATALOG_CATEGORY_KEYS = [
  "all",
  "tops",
  "bottoms",
  "outerwear",
  "footwear",
  "accessories",
] as const;

export type CatalogCategoryKey = (typeof CATALOG_CATEGORY_KEYS)[number];

export interface CatalogItem {
  dataset: string;
  itemId: string;
  rowIdx: number;
  name: string;
  imageUrl: string;
  category: ClosetCategory;
  season: ClosetSeason;
  color: ClosetColor;
  usage: string | null;
  articleType: string;
  styleTags: string[];
}

export interface CatalogSearchResponse {
  items: CatalogItem[];
  nextOffset: number;
  hasMore: boolean;
}

export interface CatalogRefreshResponse {
  imageUrl: string;
}

export interface CatalogErrorResponse {
  error: string;
  retryable: boolean;
}

/* -------------------------------------------------------------------------- */
/* Category rules                                                             */
/* -------------------------------------------------------------------------- */

type CatalogColumn = "gender" | "masterCategory" | "subCategory" | "articleType";

interface CatalogClause {
  column: CatalogColumn;
  op: "=" | "<>";
  value: string;
}

/** A row matches a term when every clause in it matches (logical AND). */
type CatalogTerm = readonly CatalogClause[];

const eq = (column: CatalogColumn, value: string): CatalogClause => ({ column, op: "=", value });
const ne = (column: CatalogColumn, value: string): CatalogClause => ({ column, op: "<>", value });

const MENS_GENDERS = ["Men", "Unisex"] as const;

// Jackets and blazers are filed under "Topwear" in this dataset, so they are
// carved out of tops and promoted to their own category.
const OUTERWEAR_ARTICLE_TYPES = ["Jackets", "Blazers", "Rain Jacket", "Nehru Jackets", "Waistcoat"];

// Wearable accessories only. Socks, gift sets, water bottles, umbrellas, and
// similar sub-categories would make poor Style Me picks.
const ACCESSORY_SUB_CATEGORIES = [
  "Bags",
  "Watches",
  "Jewellery",
  "Eyewear",
  "Wallets",
  "Belts",
  "Headwear",
  "Ties",
  "Scarves",
  "Cufflinks",
  "Stoles",
  "Mufflers",
  "Gloves",
];

/**
 * Single source of truth for both the Hugging Face `where` predicate and the
 * row-to-closet mapper, so filtered results and mapped categories cannot drift.
 * The rules are disjoint: a row matches at most one category.
 */
const CATEGORY_RULES: Record<Exclude<CatalogCategoryKey, "all">, {
  closetCategory: ClosetCategory;
  terms: readonly CatalogTerm[];
}> = {
  tops: {
    closetCategory: "top",
    terms: [[
      eq("masterCategory", "Apparel"),
      eq("subCategory", "Topwear"),
      ...OUTERWEAR_ARTICLE_TYPES.map((articleType) => ne("articleType", articleType)),
    ]],
  },
  bottoms: {
    closetCategory: "bottom",
    terms: [[eq("masterCategory", "Apparel"), eq("subCategory", "Bottomwear")]],
  },
  outerwear: {
    closetCategory: "outerwear",
    terms: OUTERWEAR_ARTICLE_TYPES.map((articleType) => [eq("articleType", articleType)]),
  },
  footwear: {
    closetCategory: "footwear",
    terms: [[eq("masterCategory", "Footwear")]],
  },
  accessories: {
    closetCategory: "accessory",
    terms: ACCESSORY_SUB_CATEGORIES.map((subCategory) => [
      eq("masterCategory", "Accessories"),
      eq("subCategory", subCategory),
    ]),
  },
};

const CATEGORY_RULE_ENTRIES = Object.entries(CATEGORY_RULES) as [
  Exclude<CatalogCategoryKey, "all">,
  (typeof CATEGORY_RULES)[keyof typeof CATEGORY_RULES],
][];

export function parseCatalogCategory(value: string | null): CatalogCategoryKey | null {
  const normalized = (value ?? "all").trim().toLowerCase();
  return (CATALOG_CATEGORY_KEYS as readonly string[]).includes(normalized)
    ? (normalized as CatalogCategoryKey)
    : null;
}

function toSqlClause({ column, op, value }: CatalogClause): string {
  // Values come from the static allowlists above, never from user input.
  // Quotes are still escaped so a future edit cannot break the predicate.
  return `"${column}"${op}'${value.replaceAll("'", "''")}'`;
}

/**
 * Builds a Dataset Viewer `where` clause for the allowlisted category.
 *
 * The viewer rejects nested parentheses, `IN` lists, and commas, so the
 * predicate keeps a single level of grouping and relies on SQL's AND-before-OR
 * precedence: `(gender) AND (a AND b OR c AND d ...)`.
 */
export function buildCatalogWhere(category: CatalogCategoryKey): string {
  const terms = category === "all"
    ? CATEGORY_RULE_ENTRIES.flatMap(([, rule]) => rule.terms)
    : CATEGORY_RULES[category].terms;
  const genderGroup = MENS_GENDERS.map((gender) => toSqlClause(eq("gender", gender))).join(" OR ");
  const categoryGroup = terms.map((term) => term.map(toSqlClause).join(" AND ")).join(" OR ");
  return `(${genderGroup}) AND (${categoryGroup})`;
}

function clauseMatches(row: HfCatalogRow, { column, op, value }: CatalogClause): boolean {
  return op === "=" ? row[column] === value : row[column] !== value;
}

function termsMatch(row: HfCatalogRow, terms: readonly CatalogTerm[]): boolean {
  return terms.some((term) => term.every((clause) => clauseMatches(row, clause)));
}

export function mapCatalogCategory(row: HfCatalogRow): ClosetCategory | null {
  for (const [, rule] of CATEGORY_RULE_ENTRIES) {
    if (termsMatch(row, rule.terms)) return rule.closetCategory;
  }
  return null;
}

function isMensRow(row: HfCatalogRow): boolean {
  return (MENS_GENDERS as readonly string[]).includes(row.gender);
}

export function rowMatchesCatalogCategory(row: HfCatalogRow, category: CatalogCategoryKey): boolean {
  if (!isMensRow(row)) return false;
  return category === "all"
    ? mapCatalogCategory(row) !== null
    : termsMatch(row, CATEGORY_RULES[category].terms);
}

/* -------------------------------------------------------------------------- */
/* Search query expansion                                                     */
/* -------------------------------------------------------------------------- */

// The dataset uses retail vocabulary ("Tshirts", "Hooded Sweatshirt"). Search is
// ranked full-text OR matching, so appending synonyms widens recall without
// pushing exact matches down.
const SEARCH_SYNONYMS: Record<string, string> = {
  tee: "tshirt",
  tees: "tshirt",
  hoodie: "hooded sweatshirt",
  hoodies: "hooded sweatshirt",
  pants: "trousers",
  joggers: "track pants",
  trainers: "sports shoes",
  jumper: "sweater",
};

export const MAX_CATALOG_QUERY_LENGTH = 80;

export function normalizeCatalogQuery(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CATALOG_QUERY_LENGTH);
}

export function expandCatalogQuery(query: string): string {
  // Full-text search ignores case. Lowercasing also lets "Hoodie" and "hoodie"
  // share one cached upstream response.
  const lowered = query.toLowerCase();
  const expansions = lowered.split(" ").flatMap((word) => SEARCH_SYNONYMS[word] ?? []);
  return [lowered, ...new Set(expansions)].join(" ");
}

/* -------------------------------------------------------------------------- */
/* Row normalization                                                          */
/* -------------------------------------------------------------------------- */

export interface HfCatalogRow {
  id: number;
  gender: string;
  masterCategory: string;
  subCategory: string;
  articleType: string;
  baseColour: string | null;
  season: string | null;
  usage: string | null;
  productDisplayName: string | null;
  image: { src: string } | null;
}

export interface HfCatalogRowEntry {
  rowIdx: number;
  row: HfCatalogRow;
}

export interface HfCatalogPage {
  rows: HfCatalogRowEntry[];
  totalRows: number;
}

const SEASON_MAP: Record<string, ClosetSeason> = {
  Spring: "Spring",
  Summer: "Summer",
  Fall: "Autumn",
  Winter: "Winter",
};

const COLOR_HEX: Record<string, string> = {
  Black: "#252525",
  White: "#F4F2EC",
  "Off White": "#EFEAE0",
  Cream: "#E8E0D0",
  Beige: "#D9C8A9",
  Skin: "#E2B99A",
  Nude: "#D8B49C",
  Peach: "#F1B999",
  Tan: "#C09A6B",
  Khaki: "#B6A57A",
  Taupe: "#8B7D6B",
  "Mushroom Brown": "#9A8676",
  Brown: "#6E4B33",
  "Coffee Brown": "#4E3527",
  Rust: "#A8502F",
  Copper: "#B0653A",
  Bronze: "#9C6B35",
  Gold: "#C9A54A",
  Mustard: "#C99A2E",
  Yellow: "#E3C341",
  Orange: "#E07B34",
  Red: "#B3322E",
  Maroon: "#6E2232",
  Burgundy: "#6B1F2E",
  Pink: "#E4A3B5",
  Rose: "#D9808F",
  Magenta: "#B0306F",
  Mauve: "#A8879A",
  Lavender: "#B9A7D6",
  Purple: "#6B4C8A",
  "Navy Blue": "#273349",
  Blue: "#3E5F9A",
  "Turquoise Blue": "#3FA7B5",
  Teal: "#2D7A7A",
  "Sea Green": "#4C9A7A",
  Green: "#3F7A4A",
  Olive: "#74745B",
  "Lime Green": "#9CC63B",
  "Fluorescent Green": "#6FE04A",
  Grey: "#8A8D90",
  "Grey Melange": "#9DA0A3",
  Charcoal: "#3D4043",
  Steel: "#7A8590",
  Silver: "#B9BAB8",
  Metallic: "#A3A6A8",
  Multi: "#B7A99A",
};

const FALLBACK_COLOR: ClosetColor = { name: "Uncategorized", hex: "#D8D3C8" };

function toClosetColor(baseColour: string | null): ClosetColor {
  const name = baseColour?.trim();
  if (!name) return FALLBACK_COLOR;
  return { name, hex: COLOR_HEX[name] ?? FALLBACK_COLOR.hex };
}

function isHuggingFaceAssetUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && (host === "huggingface.co" || host.endsWith(".huggingface.co") || host === "hf.co" || host.endsWith(".hf.co"));
  } catch {
    return false;
  }
}

/** Returns a validated image URL from a raw row, or null when unusable. */
export function readCatalogImageUrl(row: HfCatalogRow): string | null {
  const src = row.image?.src;
  return typeof src === "string" && isHuggingFaceAssetUrl(src) ? src : null;
}

/**
 * Dataset Viewer signs asset URLs with an `Expires` epoch-seconds parameter.
 * Unsigned URLs (no parameter) are treated as fresh.
 */
export function signedUrlExpiresWithin(imageUrl: string, windowMs: number): boolean {
  try {
    const expires = Number(new URL(imageUrl).searchParams.get("Expires"));
    if (!Number.isFinite(expires) || expires <= 0) return false;
    return expires * 1000 - Date.now() < windowMs;
  } catch {
    return false;
  }
}

export function normalizeCatalogRow({ rowIdx, row }: HfCatalogRowEntry): CatalogItem | null {
  if (!isMensRow(row)) return null;
  const category = mapCatalogCategory(row);
  const imageUrl = readCatalogImageUrl(row);
  if (!category || !imageUrl) return null;

  const color = toClosetColor(row.baseColour);
  const usage = row.usage?.trim() || null;
  const name = (row.productDisplayName ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
    || `${color.name} ${row.articleType}`;

  return {
    dataset: HF_CATALOG_DATASET,
    itemId: String(row.id),
    rowIdx,
    name,
    imageUrl,
    category,
    season: SEASON_MAP[row.season ?? ""] ?? "All season",
    color,
    usage,
    articleType: row.articleType,
    styleTags: [...new Set([usage, row.articleType].flatMap((tag) => tag ? [tag.toLowerCase()] : []))],
  };
}

/* -------------------------------------------------------------------------- */
/* Upstream access (server only)                                              */
/* -------------------------------------------------------------------------- */

/** Attaches `HF_TOKEN` for higher rate limits when configured; works without it. */
export function buildHfHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.HF_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export class CatalogError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable: boolean,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

const UPSTREAM_TIMEOUT_MS = 10_000;
const TRANSIENT_RETRY_DELAYS_MS = [400, 1_200];
// Default time budget for one upstream page, including retries. Routes that
// make several calls pass a shared `deadline` instead.
export const HF_DEFAULT_BUDGET_MS = 20_000;
// Not worth starting an attempt with less time than this left.
const MIN_ATTEMPT_MS = 2_500;

// The Dataset Viewer reports cold DuckDB indexes and Hub auth hiccups as 5xx,
// and it occasionally stalls on a query that succeeds instantly when repeated.
// All of these clear within seconds, so they are retried before surfacing.
function isTransientUpstreamFailure(status: number, message: string): boolean {
  if ([502, 503, 504].includes(status)) return true;
  return status >= 500 && /index is loading|temporary|timed out|try again/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isHfCatalogRow(value: unknown): value is HfCatalogRow {
  if (!isRecord(value)) return false;
  return typeof value.id === "number"
    && typeof value.gender === "string"
    && typeof value.masterCategory === "string"
    && typeof value.subCategory === "string"
    && typeof value.articleType === "string";
}

function parseCatalogPage(payload: unknown): HfCatalogPage {
  if (!isRecord(payload) || !Array.isArray(payload.rows)) {
    throw new CatalogError(502, "The catalog returned an unexpected response.", true);
  }

  const rows = payload.rows.flatMap((entry): HfCatalogRowEntry[] => {
    if (!isRecord(entry) || typeof entry.row_idx !== "number" || !isHfCatalogRow(entry.row)) return [];
    return [{ rowIdx: entry.row_idx, row: entry.row }];
  });
  const totalRows = typeof payload.num_rows_total === "number" ? payload.num_rows_total : rows.length;
  return { rows, totalRows };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type HfFetchCache = { revalidate: number } | "no-store";

export interface HfFetchOptions {
  cache: HfFetchCache;
  /** Epoch ms after which no further attempt is started. */
  deadline?: number;
}

export async function fetchHfCatalogPage(
  endpoint: "filter" | "search" | "rows",
  params: Record<string, string | number>,
  { cache: cachePolicy, deadline = Date.now() + HF_DEFAULT_BUDGET_MS }: HfFetchOptions,
): Promise<HfCatalogPage> {
  const url = new URL(`/${endpoint}`, HF_DATASETS_SERVER);
  url.searchParams.set("dataset", HF_CATALOG_DATASET);
  url.searchParams.set("config", HF_CATALOG_CONFIG);
  url.searchParams.set("split", HF_CATALOG_SPLIT);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  if (deadline - Date.now() < MIN_ATTEMPT_MS) {
    throw new CatalogError(504, "The catalog took too long to respond. Try again.", true);
  }

  for (let attempt = 0; ; attempt += 1) {
    let transientFailure: CatalogError;

    try {
      const response = await fetch(url, {
        headers: buildHfHeaders(),
        signal: AbortSignal.timeout(Math.min(UPSTREAM_TIMEOUT_MS, deadline - Date.now())),
        ...(cachePolicy === "no-store"
          ? { cache: "no-store" as const }
          : { next: { revalidate: cachePolicy.revalidate } }),
      });

      if (response.ok) {
        return parseCatalogPage(await response.json().catch(() => null));
      }

      if (response.status === 429) {
        throw new CatalogError(
          429,
          "The catalog is rate limiting requests. Wait a moment and try again.",
          true,
          response.headers.get("retry-after"),
        );
      }

      const payload: unknown = await response.json().catch(() => null);
      const upstreamMessage = isRecord(payload) && typeof payload.error === "string" ? payload.error : "";

      if (!isTransientUpstreamFailure(response.status, upstreamMessage)) {
        throw response.status === 404
          ? new CatalogError(404, "That catalog item could not be found.", false)
          : new CatalogError(502, "The catalog could not complete this request.", false);
      }
      transientFailure = new CatalogError(503, "The catalog is warming up. Try again in a few seconds.", true);
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      transientFailure = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? new CatalogError(504, "The catalog took too long to respond. Try again.", true)
        : new CatalogError(502, "Could not reach the catalog. Try again shortly.", true);
    }

    // Only start another attempt if it has a realistic chance before the deadline.
    const retryDelay = TRANSIENT_RETRY_DELAYS_MS[attempt];
    if (retryDelay === undefined || deadline - Date.now() - retryDelay < MIN_ATTEMPT_MS) {
      throw transientFailure;
    }
    await delay(retryDelay);
  }
}

export function catalogErrorResponse(error: unknown): Response {
  const catalogError = error instanceof CatalogError
    ? error
    : new CatalogError(500, "Something went wrong while loading the catalog.", true);

  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (catalogError.retryAfter) headers["Retry-After"] = catalogError.retryAfter;

  const body: CatalogErrorResponse = { error: catalogError.message, retryable: catalogError.retryable };
  return Response.json(body, { status: catalogError.status, headers });
}

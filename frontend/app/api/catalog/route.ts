import type { NextRequest } from "next/server";

import {
  buildCatalogWhere,
  catalogErrorResponse,
  CatalogError,
  expandCatalogQuery,
  fetchHfCatalogPage,
  normalizeCatalogQuery,
  normalizeCatalogRow,
  parseCatalogCategory,
  rowMatchesCatalogCategory,
  signedUrlExpiresWithin,
  type CatalogCategoryKey,
  type CatalogItem,
  type CatalogSearchResponse,
  type HfCatalogPage,
  type HfFetchCache,
} from "@/lib/catalog/hf-catalog";

// Hugging Face can stall for several seconds, so the function gets explicit
// headroom above the route's own time budget.
export const maxDuration = 30;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const MAX_OFFSET = 100_000;
const CACHE_SECONDS = 300;
const ROUTE_BUDGET_MS = 25_000;
// /search has no `where` support, so men's rows are filtered here. Each
// request scans at most this many upstream pages to fill one response page.
const SEARCH_PAGE_LENGTH = 100;
const MAX_SEARCH_PAGES = 3;
// Cached pages are served stale-while-revalidate, so a long-idle cache entry
// can carry signed URLs that are about to expire. Those pages are refetched.
const MIN_SIGNED_URL_LIFETIME_MS = 30 * 60 * 1000;

interface CatalogQuery {
  q: string;
  category: CatalogCategoryKey;
  offset: number;
  limit: number;
}

function parseNonNegativeInteger(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return 0;
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

async function browseCatalog(
  { category, offset, limit }: CatalogQuery,
  cache: HfFetchCache,
  deadline: number,
): Promise<CatalogSearchResponse> {
  const page = await fetchHfCatalogPage(
    "filter",
    { where: buildCatalogWhere(category), offset, length: limit },
    { cache, deadline },
  );
  const items = page.rows.flatMap((entry) => normalizeCatalogRow(entry) ?? []);
  const nextOffset = offset + page.rows.length;

  return { items, nextOffset, hasMore: page.rows.length > 0 && nextOffset < page.totalRows };
}

async function searchCatalog(
  { q, category, offset, limit }: CatalogQuery,
  cache: HfFetchCache,
  deadline: number,
): Promise<CatalogSearchResponse> {
  const query = expandCatalogQuery(q);
  const items: CatalogItem[] = [];
  // `cursor` is an upstream row position, so the next response resumes exactly
  // after the last row this one consumed.
  let cursor = offset;
  let totalRows = Number.POSITIVE_INFINITY;

  for (let pageIndex = 0; pageIndex < MAX_SEARCH_PAGES && items.length < limit && cursor < totalRows; pageIndex += 1) {
    // Search ranking differs between offsets (an offset-28 window is not rows
    // 28+ of the offset-0 window), so always request aligned pages and slice
    // locally. Consecutive "Load more" calls then see one consistent order.
    const pageStart = Math.floor(cursor / SEARCH_PAGE_LENGTH) * SEARCH_PAGE_LENGTH;

    let page: HfCatalogPage;
    try {
      page = await fetchHfCatalogPage(
        "search",
        { query, offset: pageStart, length: SEARCH_PAGE_LENGTH },
        { cache, deadline },
      );
    } catch (error) {
      // A later scan page failing should not discard rows already found.
      // Returning a partial page lets "Load more" resume from this cursor.
      if (pageIndex === 0) throw error;
      break;
    }
    totalRows = page.totalRows;

    const pageRows = page.rows.slice(cursor - pageStart);
    if (pageRows.length === 0) {
      cursor = totalRows;
      break;
    }

    for (const entry of pageRows) {
      cursor += 1;
      if (!rowMatchesCatalogCategory(entry.row, category)) continue;
      const item = normalizeCatalogRow(entry);
      if (item) items.push(item);
      if (items.length === limit) break;
    }
  }

  return { items, nextOffset: cursor, hasMore: cursor < totalRows };
}

function loadCatalog(query: CatalogQuery, cache: HfFetchCache, deadline: number): Promise<CatalogSearchResponse> {
  return query.q ? searchCatalog(query, cache, deadline) : browseCatalog(query, cache, deadline);
}

export async function GET(request: NextRequest): Promise<Response> {
  const deadline = Date.now() + ROUTE_BUDGET_MS;
  const { searchParams } = request.nextUrl;

  const category = parseCatalogCategory(searchParams.get("category"));
  if (!category) {
    return catalogErrorResponse(new CatalogError(400, "Choose a supported catalog category.", false));
  }

  const offset = parseNonNegativeInteger(searchParams.get("offset"));
  if (offset === null || offset > MAX_OFFSET) {
    return catalogErrorResponse(new CatalogError(400, "The catalog offset must be a non-negative integer.", false));
  }

  const requestedLimit = parseNonNegativeInteger(searchParams.get("limit"));
  if (requestedLimit === null) {
    return catalogErrorResponse(new CatalogError(400, "The catalog limit must be a positive integer.", false));
  }

  const query: CatalogQuery = {
    q: normalizeCatalogQuery(searchParams.get("q")),
    category,
    offset,
    limit: Math.min(Math.max(requestedLimit || DEFAULT_LIMIT, 1), MAX_LIMIT),
  };

  try {
    let result = await loadCatalog(query, { revalidate: CACHE_SECONDS }, deadline);
    if (result.items.some((item) => signedUrlExpiresWithin(item.imageUrl, MIN_SIGNED_URL_LIFETIME_MS))) {
      // Best effort: if the uncached refetch fails, the cached page is still
      // better than an error, and saved items self-heal via /refresh anyway.
      result = await loadCatalog(query, "no-store", deadline).catch(() => result);
    }

    return Response.json(result, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

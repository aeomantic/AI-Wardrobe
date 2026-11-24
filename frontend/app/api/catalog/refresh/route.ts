import type { NextRequest } from "next/server";

import {
  catalogErrorResponse,
  CatalogError,
  fetchHfCatalogPage,
  readCatalogImageUrl,
  type CatalogRefreshResponse,
} from "@/lib/catalog/hf-catalog";

export const maxDuration = 30;

const MAX_ROW_INDEX = 10_000_000;

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const rawRowIdx = searchParams.get("rowIdx")?.trim() ?? "";
  const rowIdx = /^\d+$/.test(rawRowIdx) ? Number(rawRowIdx) : Number.NaN;

  if (!Number.isSafeInteger(rowIdx) || rowIdx > MAX_ROW_INDEX) {
    return catalogErrorResponse(new CatalogError(400, "rowIdx must be a non-negative integer.", false));
  }

  // Optional guard: if the dataset is ever re-ordered, a stale rowIdx would
  // point at a different product. Callers that know the item id can detect it.
  const itemId = searchParams.get("itemId")?.trim() || null;
  if (itemId !== null && !/^\d{1,15}$/.test(itemId)) {
    return catalogErrorResponse(new CatalogError(400, "itemId must be a numeric catalog id.", false));
  }

  try {
    // Signed URLs are the whole point of this endpoint, so it is never cached.
    const page = await fetchHfCatalogPage("rows", { offset: rowIdx, length: 1 }, { cache: "no-store" });
    const entry = page.rows.find((candidate) => candidate.rowIdx === rowIdx);

    if (!entry) {
      throw new CatalogError(404, "That catalog item could not be found.", false);
    }
    if (itemId !== null && String(entry.row.id) !== itemId) {
      throw new CatalogError(409, "That catalog item has moved and cannot be refreshed.", false);
    }

    const imageUrl = readCatalogImageUrl(entry.row);
    if (!imageUrl) {
      throw new CatalogError(502, "The catalog did not return an image for this item.", true);
    }

    const body: CatalogRefreshResponse = { imageUrl };
    return Response.json(body, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

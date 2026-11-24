"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ImageOff } from "lucide-react";
import {
  parseIdbImageUrl,
  peekGarmentObjectUrl,
  resolveGarmentObjectUrl,
  subscribeGarmentObjectUrls,
} from "@/lib/storage/image-store";
import { getCatalogKey, useCloset } from "@/providers/ClosetProvider";
import type { ClosetCatalogMeta, ClosetItem } from "@/types/closet";

interface WardrobeImageProps {
  item: ClosetItem;
  alt?: string;
  className?: string;
}

interface SettledImage {
  src: string;
  status: "loaded" | "failed";
}

function isRefreshPayload(value: unknown): value is { imageUrl: string } {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { imageUrl?: unknown }).imageUrl === "string";
}

// The same closet item can be on screen more than once (closet grid and Style
// Me cards). Those instances share one in-flight refresh instead of each
// calling the API when the signed URL they all use expires.
const pendingRefreshes = new Map<string, Promise<string>>();

function refreshCatalogImage(meta: ClosetCatalogMeta): Promise<string> {
  const key = `${getCatalogKey(meta)}@${meta.rowIdx}`;
  const pending = pendingRefreshes.get(key);
  if (pending) return pending;

  const params = new URLSearchParams({ rowIdx: String(meta.rowIdx), itemId: meta.itemId });
  const request = fetch(`/api/catalog/refresh?${params.toString()}`, { cache: "no-store" })
    .then(async (response) => {
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRefreshPayload(payload)) throw new Error("Catalog image refresh failed");
      return payload.imageUrl;
    })
    .finally(() => pendingRefreshes.delete(key));

  pendingRefreshes.set(key, request);
  return request;
}

const noObjectUrl = () => undefined;

/**
 * Object URL for a photo stored in IndexedDB: a string once resolved, `null`
 * when the photo is missing, `undefined` while loading. The URL comes from a
 * shared cache, so every card showing the item reuses it, and a replaced or
 * deleted photo updates every card at once.
 */
function useGarmentObjectUrl(blobId: string | null): string | null | undefined {
  const getSnapshot = useCallback(
    () => (blobId ? peekGarmentObjectUrl(blobId) : undefined),
    [blobId],
  );
  const objectUrl = useSyncExternalStore(subscribeGarmentObjectUrls, getSnapshot, noObjectUrl);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);

  useEffect(() => {
    if (!blobId || objectUrl !== undefined) return;
    // IndexedDB can be blocked (some private modes), so failures settle as missing.
    resolveGarmentObjectUrl(blobId).catch(() => setUnavailableId(blobId));
  }, [blobId, objectUrl]);

  if (blobId && unavailableId === blobId && objectUrl === undefined) return null;
  return objectUrl;
}

/**
 * Renders any closet item photo with a plain <img>: IndexedDB blobs, signed
 * catalog URLs, and external links. None of them may go through /_next/image
 * (blob: URLs cannot, and signed URLs would expire in the optimizer cache).
 *
 * Catalog items whose signed URL has expired ask the refresh endpoint for a
 * new one and save it to the closet, at most once per mount.
 */
export function WardrobeImage({ item, alt = item.name, className = "" }: WardrobeImageProps) {
  const { updateItemImage } = useCloset();
  const hasRetriedRef = useRef(false);
  const [settled, setSettled] = useState<SettledImage | null>(null);

  const blobId = parseIdbImageUrl(item.imageSrc);
  const objectUrl = useGarmentObjectUrl(blobId);
  const src = blobId ? (typeof objectUrl === "string" ? objectUrl : null) : item.imageSrc;
  const isMissingBlob = blobId !== null && objectUrl === null;
  const status = isMissingBlob ? "failed" : src && settled?.src === src ? settled.status : "loading";

  const handleError = useCallback(async () => {
    if (!src) return;
    const meta = item.catalogMeta;
    if (blobId || meta?.source !== "hf-catalog" || hasRetriedRef.current) {
      setSettled({ src, status: "failed" });
      return;
    }

    hasRetriedRef.current = true;
    try {
      const imageUrl = await refreshCatalogImage(meta);
      if (imageUrl === src) throw new Error("Catalog returned the same failing URL");
      // The store update changes `src`, which remounts the <img> below.
      updateItemImage(item.id, imageUrl);
    } catch {
      setSettled({ src, status: "failed" });
    }
  }, [blobId, item.catalogMeta, item.id, src, updateItemImage]);

  // Server-rendered images can finish (or fail) before hydration attaches
  // onLoad/onError, so check the element's state once it mounts.
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    if (!node?.complete || !src) return;
    if (node.naturalWidth > 0) {
      setSettled({ src, status: "loaded" });
    } else {
      void handleError();
    }
  }, [handleError, src]);

  return (
    <>
      {status === "loading" && (
        <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-[#e8e4da]" />
      )}

      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          ref={imageRef}
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setSettled({ src, status: "loaded" })}
          onError={() => void handleError()}
          className={`${className} transition-opacity duration-200 ${
            status === "loaded" ? "opacity-100" : status === "failed" ? "invisible" : "opacity-0"
          }`}
        />
      )}

      {status === "failed" && (
        <span
          role="img"
          aria-label={`${alt} (image unavailable)`}
          className="absolute inset-0 grid place-items-center bg-[#ebe7dc] p-3 text-center text-[var(--muted)]"
        >
          <span>
            <ImageOff aria-hidden="true" size={20} strokeWidth={1.5} className="mx-auto" />
            <span className="mt-2 block text-[9px] font-medium">
              {isMissingBlob ? "Photo not on this device" : "Image unavailable"}
            </span>
          </span>
        </span>
      )}
    </>
  );
}

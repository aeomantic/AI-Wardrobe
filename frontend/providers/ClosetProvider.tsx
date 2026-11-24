"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SEED_CLOSET_ITEMS } from "@/lib/mock-closet";
import { compressGarmentImage, dataUrlToBlob } from "@/lib/storage/image-compressor";
import {
  deleteGarmentBlob,
  deleteGarmentBlobs,
  getActivePendingGarmentUploads,
  isGarmentStorageAvailable,
  listGarmentBlobIds,
  parseIdbImageUrl,
  saveGarmentBlob,
  toIdbImageUrl,
  untrackPendingGarmentUploads,
} from "@/lib/storage/image-store";
import {
  CLOSET_FITS,
  CLOSET_FORMALITIES,
  CLOSET_SEASONS,
} from "@/lib/wardrobe/garment-tags";
import type { ClosetCatalogMeta, ClosetItem, NewClosetItem } from "@/types/closet";

interface ClosetStoreSnapshot {
  items: ClosetItem[];
  selectedItemIds: string[];
}

interface ClosetContextValue extends ClosetStoreSnapshot {
  addItems: (items: NewClosetItem[]) => ClosetItem[];
  /** Restores items from a backup, keeping their ids. Existing ids are skipped. */
  importItems: (items: ClosetItem[]) => ClosetItem[];
  removeItem: (itemId: string) => void;
  updateItemImage: (itemId: string, imageSrc: string) => void;
  toggleItemSelection: (itemId: string) => void;
  clearSelection: () => void;
}

// Metadata only. Photos live in IndexedDB (see lib/storage/image-store.ts), so
// this stays far below the ~5 MB localStorage quota even for large closets.
const STORAGE_KEY = "threadline-closet-v2";
// Earlier builds kept the closet, including full-size base64 photos, in
// sessionStorage. It is migrated once on first load.
const LEGACY_SESSION_STORAGE_KEY = "threadline-closet-session-v1";
// Inline photos above this size are re-compressed while moving to IndexedDB.
const LEGACY_RECOMPRESS_BYTES = 200 * 1024;

const SERVER_SNAPSHOT: ClosetStoreSnapshot = {
  items: SEED_CLOSET_ITEMS,
  selectedItemIds: [],
};

let closetSnapshot: ClosetStoreSnapshot = SERVER_SNAPSHOT;
let hasLoadedBrowserState = false;
let hasCrossTabListener = false;
let maintenancePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function isCatalogMeta(value: unknown): value is ClosetCatalogMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<ClosetCatalogMeta>;
  return meta.source === "hf-catalog"
    && typeof meta.dataset === "string"
    && typeof meta.itemId === "string"
    && typeof meta.rowIdx === "number"
    && Number.isSafeInteger(meta.rowIdx)
    && meta.rowIdx >= 0;
}

function isOptionalOneOf(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || (typeof value === "string" && allowed.includes(value));
}

export function isClosetItem(value: unknown): value is ClosetItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ClosetItem>;
  return Boolean(
    typeof item.id === "string"
      && item.id.length > 0
      && typeof item.name === "string"
      && typeof item.imageSrc === "string"
      && isOptionalOneOf(item.imageSource, ["indexeddb", "external", "hf-catalog"])
      && (item.sourceUrl === undefined || typeof item.sourceUrl === "string")
      && (item.catalogMeta === undefined || isCatalogMeta(item.catalogMeta))
      && (item.material === undefined || typeof item.material === "string")
      && isOptionalOneOf(item.fit, CLOSET_FITS)
      && isOptionalOneOf(item.formality, CLOSET_FORMALITIES)
      && typeof item.category === "string"
      && typeof item.season === "string"
      && CLOSET_SEASONS.includes(item.season)
      && Array.isArray(item.styleTags)
      && item.color
      && typeof item.color.name === "string"
      && typeof item.color.hex === "string",
  );
}

export function getCatalogKey(meta: Pick<ClosetCatalogMeta, "dataset" | "itemId">): string {
  return `${meta.dataset}#${meta.itemId}`;
}

/** The IndexedDB key of an item's photo, or null when it uses a URL. */
export function getItemBlobId(item: Pick<ClosetItem, "imageSrc">): string | null {
  return parseIdbImageUrl(item.imageSrc);
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

function parseSnapshot(raw: string | null): ClosetStoreSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ClosetStoreSnapshot>;
    if (!Array.isArray(parsed.items)) return null;
    // Drop individual corrupt entries rather than discarding the whole closet.
    const items = parsed.items.filter(isClosetItem);
    const validIds = new Set(items.map((item) => item.id));
    const selectedItemIds = Array.isArray(parsed.selectedItemIds)
      ? parsed.selectedItemIds.filter((id): id is string => typeof id === "string" && validIds.has(id))
      : [];
    return { items, selectedItemIds };
  } catch {
    return null;
  }
}

function readStorage(storage: "localStorage" | "sessionStorage", key: string): string | null {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

function persistBrowserState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(closetSnapshot));
  } catch {
    // Quota or privacy-mode failures leave the in-memory closet working.
  }
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function loadBrowserState(): void {
  if (typeof window === "undefined" || hasLoadedBrowserState) return;
  hasLoadedBrowserState = true;

  const current = parseSnapshot(readStorage("localStorage", STORAGE_KEY));
  if (current) {
    closetSnapshot = current;
    return;
  }

  const legacy = parseSnapshot(readStorage("sessionStorage", LEGACY_SESSION_STORAGE_KEY));
  if (legacy) {
    closetSnapshot = legacy;
    persistBrowserState();
    try {
      window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    } catch {
      // The legacy copy is harmless if it cannot be removed.
    }
  }
}

function listenForOtherTabs(): void {
  if (typeof window === "undefined" || hasCrossTabListener) return;
  hasCrossTabListener = true;
  // Without this, two open tabs would overwrite each other's additions, and
  // the losing tab's photos would later be cleaned up as orphans.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || event.storageArea !== window.localStorage) return;
    const next = parseSnapshot(event.newValue) ?? { items: [], selectedItemIds: [] };
    closetSnapshot = next;
    notifyListeners();
  });
}

function getSnapshot(): ClosetStoreSnapshot {
  loadBrowserState();
  return closetSnapshot;
}

function getServerSnapshot(): ClosetStoreSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  loadBrowserState();
  listenForOtherTabs();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateStore(update: (current: ClosetStoreSnapshot) => ClosetStoreSnapshot): void {
  const nextSnapshot = update(closetSnapshot);
  if (nextSnapshot === closetSnapshot) return;
  closetSnapshot = nextSnapshot;
  persistBrowserState();
  notifyListeners();
}

/* -------------------------------------------------------------------------- */
/* Startup media maintenance                                                  */
/* -------------------------------------------------------------------------- */

/** Moves inline `data:image/...` photos out of localStorage into IndexedDB. */
async function migrateInlineImages(): Promise<void> {
  const inlineItems = closetSnapshot.items.filter((item) => item.imageSrc.startsWith("data:image/"));
  if (inlineItems.length === 0) return;

  const migrated = new Map<string, string>();
  for (const item of inlineItems) {
    try {
      let blob = dataUrlToBlob(item.imageSrc);
      // Old uploads were stored at full camera resolution.
      if (blob.size > LEGACY_RECOMPRESS_BYTES && blob.type !== "image/svg+xml") {
        blob = await compressGarmentImage(blob).then((result) => result.blob).catch(() => blob);
      }
      await saveGarmentBlob(item.id, blob);
      migrated.set(item.id, item.imageSrc);
    } catch {
      // Leave this item inline. It still renders, and migration retries next load.
    }
  }

  if (migrated.size === 0) return;
  updateStore((current) => ({
    ...current,
    items: current.items.map((item) => (
      migrated.get(item.id) === item.imageSrc
        ? { ...item, imageSrc: toIdbImageUrl(item.id), imageSource: "indexeddb" as const }
        : item
    )),
  }));
}

/**
 * Deletes photos no closet item references, such as uploads abandoned when a
 * tab closed mid-review. Reads the shared localStorage copy as well as memory
 * so photos added by another open tab are never treated as orphans.
 */
async function removeOrphanedBlobs(): Promise<void> {
  const referenced = new Set<string>();
  const persisted = parseSnapshot(readStorage("localStorage", STORAGE_KEY));
  for (const item of [...closetSnapshot.items, ...(persisted?.items ?? [])]) {
    const blobId = getItemBlobId(item);
    if (blobId) referenced.add(blobId);
  }
  const pending = getActivePendingGarmentUploads();
  const orphans = (await listGarmentBlobIds()).filter((id) => !referenced.has(id) && !pending.has(id));
  await deleteGarmentBlobs(orphans);
}

function runMediaMaintenance(): Promise<void> {
  maintenancePromise ??= (async () => {
    if (!isGarmentStorageAvailable()) return;
    try {
      await migrateInlineImages();
      await removeOrphanedBlobs();
    } catch {
      // Maintenance is best effort and must never break the closet.
    }
  })();
  return maintenancePromise;
}

/* -------------------------------------------------------------------------- */
/* Item helpers                                                               */
/* -------------------------------------------------------------------------- */

function normalizeDeduplicationKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

export function createClosetItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `closet-${crypto.randomUUID()}`;
  }
  return `closet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Appends candidates that are not already in the closet. Duplicates are
 * detected by id, source URL, image URL, and catalog id (catalog image URLs
 * are re-signed on every fetch, so the stable dataset id is what matters).
 */
function mergeItems(current: ClosetItem[], candidates: ClosetItem[]): { items: ClosetItem[]; added: ClosetItem[] } {
  const knownIds = new Set(current.map((item) => item.id));
  const knownSourceUrls = new Set(current.flatMap((item) => normalizeDeduplicationKey(item.sourceUrl) ?? []));
  const knownImageSources = new Set(current.flatMap((item) => normalizeDeduplicationKey(item.imageSrc) ?? []));
  const knownCatalogKeys = new Set(current.flatMap((item) => (item.catalogMeta ? [getCatalogKey(item.catalogMeta)] : [])));

  const added = candidates.filter((candidate) => {
    const sourceUrl = normalizeDeduplicationKey(candidate.sourceUrl);
    const imageSrc = normalizeDeduplicationKey(candidate.imageSrc);
    const catalogKey = candidate.catalogMeta ? getCatalogKey(candidate.catalogMeta) : null;
    const isDuplicate = knownIds.has(candidate.id)
      || (sourceUrl !== null && knownSourceUrls.has(sourceUrl))
      || (imageSrc !== null && knownImageSources.has(imageSrc))
      || (catalogKey !== null && knownCatalogKeys.has(catalogKey));
    if (isDuplicate) return false;

    knownIds.add(candidate.id);
    if (sourceUrl !== null) knownSourceUrls.add(sourceUrl);
    if (imageSrc !== null) knownImageSources.add(imageSrc);
    if (catalogKey !== null) knownCatalogKeys.add(catalogKey);
    return true;
  });

  return { items: added.length > 0 ? [...added, ...current] : current, added };
}

const ClosetContext = createContext<ClosetContextValue | null>(null);

export function ClosetProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void runMediaMaintenance();
  }, []);

  const addItems = useCallback((inputs: NewClosetItem[]): ClosetItem[] => {
    if (inputs.length === 0) return [];

    const createdAt = new Date().toISOString();
    const candidates = inputs.map(({ id, ...input }): ClosetItem => ({
      ...input,
      id: id ?? createClosetItemId(),
      createdAt,
    }));

    let savedItems: ClosetItem[] = [];
    updateStore((current) => {
      const merged = mergeItems(current.items, candidates);
      savedItems = merged.added;
      return merged.added.length > 0 ? { ...current, items: merged.items } : current;
    });

    untrackPendingGarmentUploads(savedItems.flatMap((item) => getItemBlobId(item) ?? []));
    return savedItems;
  }, []);

  const importItems = useCallback((items: ClosetItem[]): ClosetItem[] => {
    let imported: ClosetItem[] = [];
    updateStore((current) => {
      const merged = mergeItems(current.items, items.filter(isClosetItem));
      imported = merged.added;
      return merged.added.length > 0 ? { ...current, items: merged.items } : current;
    });
    return imported;
  }, []);

  const removeItem = useCallback((itemId: string) => {
    const removed = closetSnapshot.items.find((item) => item.id === itemId);
    updateStore((current) => ({
      items: current.items.filter((item) => item.id !== itemId),
      selectedItemIds: current.selectedItemIds.filter((id) => id !== itemId),
    }));

    const blobId = removed ? getItemBlobId(removed) : null;
    if (blobId) {
      // Fire and forget. If this fails, startup orphan cleanup removes it.
      void deleteGarmentBlob(blobId).catch(() => undefined);
    }
  }, []);

  const updateItemImage = useCallback((itemId: string, imageSrc: string) => {
    updateStore((current) => {
      const target = current.items.find((item) => item.id === itemId);
      if (!target || target.imageSrc === imageSrc) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? { ...item, imageSrc } : item)),
      };
    });
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    updateStore((current) => ({
      ...current,
      selectedItemIds: current.selectedItemIds.includes(itemId)
        ? current.selectedItemIds.filter((id) => id !== itemId)
        : [...current.selectedItemIds, itemId],
    }));
  }, []);

  const clearSelection = useCallback(() => {
    updateStore((current) => ({ ...current, selectedItemIds: [] }));
  }, []);

  const value = useMemo<ClosetContextValue>(
    () => ({
      ...snapshot,
      addItems,
      importItems,
      removeItem,
      updateItemImage,
      toggleItemSelection,
      clearSelection,
    }),
    [snapshot, addItems, importItems, removeItem, updateItemImage, toggleItemSelection, clearSelection],
  );

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>;
}

export function useCloset(): ClosetContextValue {
  const context = useContext(ClosetContext);
  if (!context) throw new Error("useCloset must be used within ClosetProvider");
  return context;
}

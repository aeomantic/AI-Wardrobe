import {
  clear,
  createStore,
  del,
  delMany,
  entries,
  get,
  keys,
  set,
  type UseStore,
} from "idb-keyval";

/**
 * Persistent garment photo storage. Compressed photos live in IndexedDB as
 * Blobs keyed by closet item id. Wardrobe metadata stays in the JSON closet
 * store and points here with `idb://<itemId>`.
 *
 * Every helper is SSR-safe: nothing touches IndexedDB or object URLs until it
 * is called in a browser.
 */

export const IDB_IMAGE_PREFIX = "idb://";
const DB_NAME = "closet-media-db";
const STORE_NAME = "garment-blobs";

export class GarmentStorageUnavailableError extends Error {
  constructor() {
    super("Photo storage is unavailable in this browser. Private browsing modes can block it.");
    this.name = "GarmentStorageUnavailableError";
  }
}

let garmentStore: UseStore | null = null;

export function isGarmentStorageAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB !== null;
}

function getGarmentStore(): UseStore {
  if (!isGarmentStorageAvailable()) throw new GarmentStorageUnavailableError();
  garmentStore ??= createStore(DB_NAME, STORE_NAME);
  return garmentStore;
}

export function toIdbImageUrl(itemId: string): string {
  return `${IDB_IMAGE_PREFIX}${itemId}`;
}

export function parseIdbImageUrl(imageUrl: string): string | null {
  if (!imageUrl.startsWith(IDB_IMAGE_PREFIX)) return null;
  const itemId = imageUrl.slice(IDB_IMAGE_PREFIX.length);
  return itemId.length > 0 ? itemId : null;
}

/* -------------------------------------------------------------------------- */
/* Blob CRUD                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveGarmentBlob(id: string, blob: Blob): Promise<void> {
  await set(id, blob, getGarmentStore());
  // A replaced photo must not keep showing the old cached object URL.
  if (objectUrlCache.has(id) || missingIds.has(id)) revokeGarmentObjectUrl(id);
}

export async function getGarmentBlob(id: string): Promise<Blob | undefined> {
  const value: unknown = await get(id, getGarmentStore());
  return value instanceof Blob ? value : undefined;
}

export async function deleteGarmentBlob(id: string): Promise<void> {
  revokeGarmentObjectUrl(id);
  if (!isGarmentStorageAvailable()) return;
  await del(id, getGarmentStore());
}

export async function deleteGarmentBlobs(ids: string[]): Promise<void> {
  ids.forEach(revokeGarmentObjectUrl);
  if (ids.length === 0 || !isGarmentStorageAvailable()) return;
  await delMany(ids, getGarmentStore());
}

export async function listGarmentBlobIds(): Promise<string[]> {
  if (!isGarmentStorageAvailable()) return [];
  const ids = await keys(getGarmentStore());
  return ids.filter((id): id is string => typeof id === "string");
}

export async function getAllGarmentBlobs(): Promise<Array<[string, Blob]>> {
  if (!isGarmentStorageAvailable()) return [];
  const rows = await entries(getGarmentStore());
  return rows.flatMap(([id, value]) => (
    typeof id === "string" && value instanceof Blob ? [[id, value] as [string, Blob]] : []
  ));
}

export async function clearAllGarmentBlobs(): Promise<void> {
  [...objectUrlCache.keys(), ...missingIds].forEach(revokeGarmentObjectUrl);
  if (!isGarmentStorageAvailable()) return;
  await clear(getGarmentStore());
}

/* -------------------------------------------------------------------------- */
/* Storage quota                                                              */
/* -------------------------------------------------------------------------- */

/** Asks the browser not to evict photos under storage pressure. Never throws. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usageBytes: usage ?? 0, quotaBytes: quota ?? 0 };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Object URL cache                                                           */
/* -------------------------------------------------------------------------- */

// One object URL per item id, shared by every component showing that item, so
// re-renders reuse the same URL instead of flickering or leaking new ones.
const objectUrlCache = new Map<string, string>();
const missingIds = new Set<string>();
const pendingResolves = new Map<string, Promise<string | null>>();
const cacheListeners = new Set<() => void>();

function notifyCacheListeners(): void {
  cacheListeners.forEach((listener) => listener());
}

export function subscribeGarmentObjectUrls(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

/**
 * Synchronous cache lookup for `useSyncExternalStore`.
 * Returns the URL, `null` when the photo is known to be missing, or
 * `undefined` when it has not been resolved yet.
 */
export function peekGarmentObjectUrl(id: string): string | null | undefined {
  if (objectUrlCache.has(id)) return objectUrlCache.get(id);
  return missingIds.has(id) ? null : undefined;
}

/** Caches an object URL for a blob that is already in memory (fresh uploads). */
export function primeGarmentObjectUrl(id: string, blob: Blob): string {
  const previous = objectUrlCache.get(id);
  if (previous) URL.revokeObjectURL(previous);
  missingIds.delete(id);
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  notifyCacheListeners();
  return url;
}

export function resolveGarmentObjectUrl(id: string): Promise<string | null> {
  const cached = peekGarmentObjectUrl(id);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = pendingResolves.get(id);
  if (pending) return pending;

  const request = getGarmentBlob(id)
    .then((blob) => {
      // The entry may have been revoked or replaced while the read was in flight.
      if (pendingResolves.get(id) !== request) return peekGarmentObjectUrl(id) ?? null;
      if (!blob) {
        missingIds.add(id);
        notifyCacheListeners();
        return null;
      }
      return primeGarmentObjectUrl(id, blob);
    })
    .finally(() => {
      if (pendingResolves.get(id) === request) pendingResolves.delete(id);
    });

  pendingResolves.set(id, request);
  return request;
}

export function revokeGarmentObjectUrl(id: string): void {
  const url = objectUrlCache.get(id);
  const hadEntry = url !== undefined || missingIds.has(id);
  if (url) URL.revokeObjectURL(url);
  objectUrlCache.delete(id);
  missingIds.delete(id);
  pendingResolves.delete(id);
  if (hadEntry) notifyCacheListeners();
}

/* -------------------------------------------------------------------------- */
/* Pending uploads                                                            */
/* -------------------------------------------------------------------------- */

// Upload review saves a photo before its closet item exists. This registry
// (shared across tabs through localStorage) keeps orphan cleanup from deleting
// photos that another tab is still reviewing.
const PENDING_UPLOADS_KEY = "threadline-closet-pending-media-v1";
const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function readPendingUploads(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PENDING_UPLOADS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    );
  } catch {
    return {};
  }
}

function writePendingUploads(pending: Record<string, number>): void {
  try {
    if (Object.keys(pending).length === 0) window.localStorage.removeItem(PENDING_UPLOADS_KEY);
    else window.localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(pending));
  } catch {
    // Best effort. Without the registry, cleanup simply waits for the next load.
  }
}

export function trackPendingGarmentUpload(id: string): void {
  if (typeof window === "undefined") return;
  writePendingUploads({ ...readPendingUploads(), [id]: Date.now() });
}

export function untrackPendingGarmentUploads(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const pending = readPendingUploads();
  ids.forEach((id) => delete pending[id]);
  writePendingUploads(pending);
}

/** Pending ids younger than the TTL. Expired entries are pruned. */
export function getActivePendingGarmentUploads(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const now = Date.now();
  const pending = readPendingUploads();
  const active = Object.entries(pending).filter(([, startedAt]) => now - startedAt < PENDING_UPLOAD_TTL_MS);
  if (active.length !== Object.keys(pending).length) writePendingUploads(Object.fromEntries(active));
  return new Set(active.map(([id]) => id));
}

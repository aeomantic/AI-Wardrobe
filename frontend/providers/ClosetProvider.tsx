"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SEED_CLOSET_ITEMS } from "@/lib/mock-closet";
import type { ClosetItem, NewClosetItem } from "@/types/closet";

interface ClosetStoreSnapshot {
  items: ClosetItem[];
  selectedItemIds: string[];
}

interface ClosetContextValue extends ClosetStoreSnapshot {
  addItem: (item: NewClosetItem) => ClosetItem;
  addItems: (items: NewClosetItem[]) => ClosetItem[];
  removeItem: (itemId: string) => void;
  toggleItemSelection: (itemId: string) => void;
  clearSelection: () => void;
}

const STORAGE_KEY = "threadline-closet-session-v1";
const SERVER_SNAPSHOT: ClosetStoreSnapshot = {
  items: SEED_CLOSET_ITEMS,
  selectedItemIds: [],
};

let closetSnapshot: ClosetStoreSnapshot = SERVER_SNAPSHOT;
let hasLoadedBrowserState = false;
const listeners = new Set<() => void>();

function isClosetItem(value: unknown): value is ClosetItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ClosetItem>;
  return Boolean(
    typeof item.id === "string"
      && typeof item.name === "string"
      && typeof item.imageSrc === "string"
      && (item.sourceUrl === undefined || typeof item.sourceUrl === "string")
      && typeof item.category === "string"
      && item.color
      && typeof item.color.name === "string"
      && typeof item.color.hex === "string",
  );
}

function loadBrowserState(): void {
  if (typeof window === "undefined" || hasLoadedBrowserState) return;
  hasLoadedBrowserState = true;

  try {
    const rawState = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawState) return;
    const parsed = JSON.parse(rawState) as Partial<ClosetStoreSnapshot>;
    if (!Array.isArray(parsed.items) || !parsed.items.every(isClosetItem)) return;

    const validIds = new Set(parsed.items.map((item) => item.id));
    const selectedItemIds = Array.isArray(parsed.selectedItemIds)
      ? parsed.selectedItemIds.filter((id): id is string => typeof id === "string" && validIds.has(id))
      : [];
    closetSnapshot = { items: parsed.items, selectedItemIds };
  } catch {
    // Storage is optional. The seeded closet still provides a complete demo if it is unavailable.
  }
}

function persistBrowserState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(closetSnapshot));
  } catch {
    // A private browser session can reject writes. In-memory context continues to work.
  }
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
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateStore(update: (current: ClosetStoreSnapshot) => ClosetStoreSnapshot): void {
  const nextSnapshot = update(closetSnapshot);
  if (nextSnapshot === closetSnapshot) return;
  closetSnapshot = nextSnapshot;
  persistBrowserState();
  listeners.forEach((listener) => listener());
}

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

function createItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `closet-${crypto.randomUUID()}`;
  }
  return `closet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ClosetContext = createContext<ClosetContextValue | null>(null);

export function ClosetProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addItem = useCallback((input: NewClosetItem): ClosetItem => {
    const item: ClosetItem = {
      ...input,
      id: createItemId(),
      createdAt: new Date().toISOString(),
    };
    updateStore((current) => ({ ...current, items: [item, ...current.items] }));
    return item;
  }, []);

  const addItems = useCallback((inputs: NewClosetItem[]): ClosetItem[] => {
    if (inputs.length === 0) return [];

    let savedItems: ClosetItem[] = [];
    updateStore((current) => {
      const knownSourceUrls = new Set(
        current.items
          .map((item) => normalizeDeduplicationKey(item.sourceUrl))
          .filter((value): value is string => value !== null),
      );
      const knownImageSources = new Set(
        current.items
          .map((item) => normalizeDeduplicationKey(item.imageSrc))
          .filter((value): value is string => value !== null),
      );
      const createdAt = new Date().toISOString();

      savedItems = inputs.flatMap((input) => {
        const sourceUrl = normalizeDeduplicationKey(input.sourceUrl);
        const imageSrc = normalizeDeduplicationKey(input.imageSrc);
        const isDuplicate = (sourceUrl !== null && knownSourceUrls.has(sourceUrl))
          || (imageSrc !== null && knownImageSources.has(imageSrc));

        if (isDuplicate) return [];

        if (sourceUrl !== null) knownSourceUrls.add(sourceUrl);
        if (imageSrc !== null) knownImageSources.add(imageSrc);

        return [{
          ...input,
          id: createItemId(),
          createdAt,
        }];
      });

      if (savedItems.length === 0) return current;
      return { ...current, items: [...savedItems, ...current.items] };
    });

    return savedItems;
  }, []);

  const removeItem = useCallback((itemId: string) => {
    updateStore((current) => ({
      items: current.items.filter((item) => item.id !== itemId),
      selectedItemIds: current.selectedItemIds.filter((id) => id !== itemId),
    }));
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
    () => ({ ...snapshot, addItem, addItems, removeItem, toggleItemSelection, clearSelection }),
    [snapshot, addItem, addItems, removeItem, toggleItemSelection, clearSelection],
  );

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>;
}

export function useCloset(): ClosetContextValue {
  const context = useContext(ClosetContext);
  if (!context) throw new Error("useCloset must be used within ClosetProvider");
  return context;
}

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ImageOff,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/mock-closet";
import { getCatalogKey, useCloset } from "@/providers/ClosetProvider";
import type {
  CatalogCategoryKey,
  CatalogItem,
  CatalogSearchResponse,
} from "@/lib/catalog/hf-catalog";
import type { NewClosetItem } from "@/types/closet";

interface CatalogSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 350;

const QUICK_SEARCHES = ["Oversized Tee", "Chinos", "Denim Jacket", "White Sneakers", "Hoodie"];

const CATEGORY_PILLS: Record<CatalogCategoryKey, string> = {
  all: "All",
  tops: "Tops",
  bottoms: "Bottoms",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessories: "Accessories",
};

interface CatalogPage extends CatalogSearchResponse {
  requestKey: string;
  query: string;
  category: CatalogCategoryKey;
  error: string | null;
}

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isCatalogItem(value: unknown): value is CatalogItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CatalogItem>;
  return typeof item.itemId === "string"
    && typeof item.dataset === "string"
    && typeof item.rowIdx === "number"
    && typeof item.name === "string"
    && typeof item.imageUrl === "string"
    && typeof item.category === "string"
    && typeof item.season === "string"
    && Boolean(item.color && typeof item.color.name === "string" && typeof item.color.hex === "string")
    && Array.isArray(item.styleTags);
}

function isCatalogSearchResponse(value: unknown): value is CatalogSearchResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<CatalogSearchResponse>;
  return Array.isArray(payload.items)
    && payload.items.every(isCatalogItem)
    && typeof payload.nextOffset === "number"
    && typeof payload.hasMore === "boolean";
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function fetchCatalogPage(
  { query, category, offset }: { query: string; category: CatalogCategoryKey; offset: number },
  signal: AbortSignal,
): Promise<CatalogSearchResponse> {
  const params = new URLSearchParams({ category, offset: String(offset), limit: String(PAGE_SIZE) });
  if (query) params.set("q", query);

  const response = await fetch(`/api/catalog?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : "The catalog could not be loaded. Try again.";
    throw new Error(message);
  }
  if (!isCatalogSearchResponse(payload)) {
    throw new Error("The catalog returned an unexpected response. Try again.");
  }
  return payload;
}

function toNewClosetItem(item: CatalogItem): NewClosetItem {
  return {
    name: item.name,
    category: item.category,
    season: item.season,
    color: item.color,
    imageSrc: item.imageUrl,
    imageSource: "hf-catalog",
    sourceUrl: `https://huggingface.co/datasets/${item.dataset}/viewer/default/train?row=${item.rowIdx}`,
    styleTags: item.styleTags,
    backgroundRemoved: false,
    catalogMeta: {
      source: "hf-catalog",
      dataset: item.dataset,
      itemId: item.itemId,
      rowIdx: item.rowIdx,
    },
  };
}

function CatalogThumbnail({ item }: { item: CatalogItem }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === item.imageUrl) {
    return (
      <span role="img" aria-label={`${item.name} (image unavailable)`} className="grid size-full place-items-center text-[var(--muted)]">
        <ImageOff aria-hidden="true" size={20} strokeWidth={1.5} />
      </span>
    );
  }

  return (
    // Signed catalog URLs expire, so they must never go through /_next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.name}
      decoding="async"
      onError={() => setFailedSrc(item.imageUrl)}
      className="size-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]"
    />
  );
}

function CatalogSkeletonGrid() {
  return (
    <ul aria-hidden="true" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index} className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel)]">
          <div className="aspect-[3/4] animate-pulse bg-[#e8e4da]" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-full animate-pulse rounded bg-[var(--canvas)]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--canvas)]" />
            <div className="h-8 animate-pulse rounded-full bg-[var(--canvas)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CatalogSearchDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { items: closetItems, addItems } = useCloset();
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const loadMoreRequestRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategoryKey>("all");
  const [reloadToken, setReloadToken] = useState(0);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<{ requestKey: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const requestKey = `${category}\u0000${debouncedQuery}\u0000${reloadToken}`;
  const isLoading = page?.requestKey !== requestKey;

  const addedCatalogKeys = useMemo(
    () => new Set(closetItems.flatMap((item) => (item.catalogMeta ? [getCatalogKey(item.catalogMeta)] : []))),
    [closetItems],
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      loadMoreRequestRef.current?.abort();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  useEffect(() => {
    const normalized = normalizeQuery(query);
    if (normalized === debouncedQuery) return;
    const timer = window.setTimeout(() => setDebouncedQuery(normalized), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery, query]);

  // Loads the first page whenever the search, category, or retry token changes.
  // Loading state is derived from `requestKey`, so no state is set synchronously here.
  useEffect(() => {
    const controller = new AbortController();
    loadMoreRequestRef.current?.abort();
    resultsRef.current?.scrollTo({ top: 0 });

    fetchCatalogPage({ query: debouncedQuery, category, offset: 0 }, controller.signal)
      .then((result) => {
        setPage({ ...result, requestKey, query: debouncedQuery, category, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPage({
          items: [],
          nextOffset: 0,
          hasMore: false,
          requestKey,
          query: debouncedQuery,
          category,
          error: getErrorMessage(error, "The catalog could not be loaded. Try again."),
        });
      });

    return () => controller.abort();
  }, [category, debouncedQuery, requestKey]);

  const runQuickSearch = (value: string) => {
    setQuery(value);
    setDebouncedQuery(value);
    inputRef.current?.focus();
  };

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
    inputRef.current?.focus();
  };

  const loadMore = async () => {
    if (!page || isLoading || page.error || !page.hasMore || isLoadingMore) return;

    const { requestKey: pageKey, query: pageQuery, category: pageCategory, nextOffset } = page;
    const controller = new AbortController();
    loadMoreRequestRef.current = controller;
    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const result = await fetchCatalogPage(
        { query: pageQuery, category: pageCategory, offset: nextOffset },
        controller.signal,
      );
      setPage((current) => {
        if (!current || current.requestKey !== pageKey) return current;
        const knownRows = new Set(current.items.map((item) => item.rowIdx));
        return {
          ...current,
          items: [...current.items, ...result.items.filter((item) => !knownRows.has(item.rowIdx))],
          nextOffset: result.nextOffset,
          hasMore: result.hasMore,
        };
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadMoreError({ requestKey: pageKey, message: getErrorMessage(error, "More results could not be loaded.") });
      }
    } finally {
      if (loadMoreRequestRef.current === controller) {
        loadMoreRequestRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  const addToCloset = (item: CatalogItem) => {
    const [saved] = addItems([toNewClosetItem(item)]);
    setAnnouncement(saved ? `${item.name} added to your closet.` : `${item.name} is already in your closet.`);
  };

  const visibleItems = !isLoading && page ? page.items : [];
  const visibleLoadMoreError = loadMoreError && loadMoreError.requestKey === page?.requestKey
    ? loadMoreError.message
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#181815]/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isLoading || isLoadingMore}
        className="my-auto flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-[var(--panel)] shadow-[0_32px_100px_rgba(0,0,0,0.34)]"
      >
        <header className="shrink-0 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label">Catalog intake</p>
              <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
                Search men&apos;s catalog
              </h2>
              <p id={descriptionId} className="mt-1 max-w-2xl text-[10px] leading-4 text-[var(--muted)]">
                Find pieces that match what you own and add them in one tap. Each one arrives tagged and ready for Style Me.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close catalog search"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <X size={15} />
            </button>
          </div>

          <form
            role="search"
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setDebouncedQuery(normalizeQuery(query));
            }}
          >
            <label htmlFor={inputId} className="sr-only">Search the men&apos;s catalog</label>
            <div className="relative">
              <Search
                aria-hidden="true"
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                autoComplete="off"
                enterKeyHint="search"
                maxLength={80}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tees, chinos, sneakers…"
                className="h-11 w-full rounded-xl border border-[var(--line)] bg-white py-2 pl-10 pr-10 text-[11px] outline-none transition-colors placeholder:text-[var(--muted)]/65 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--selection)] [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </form>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Try</span>
            {QUICK_SEARCHES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => runQuickSearch(suggestion)}
                aria-pressed={debouncedQuery === suggestion}
                className={`rounded-full border px-2.5 py-1 text-[9px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  debouncedQuery === suggestion
                    ? "border-[var(--accent)] bg-[var(--selection)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Filter catalog by category"
            className="inspector-scroll mt-3 flex gap-1 overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--canvas)] p-1"
          >
            {(Object.entries(CATEGORY_PILLS) as [CatalogCategoryKey, string][]).map(([key, label]) => {
              const active = key === category;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(key)}
                  className={`shrink-0 rounded-[10px] px-3 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    active
                      ? "bg-[var(--ink)] text-[#f3f0e8] shadow-sm"
                      : "text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </header>

        <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

          {isLoading ? (
            <div role="status" aria-label="Loading catalog results">
              <CatalogSkeletonGrid />
            </div>
          ) : page?.error ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-[16px] border border-[#d8968f] bg-[#fae8e5] px-4 py-3 text-[10px] leading-5 text-[#87362f] sm:flex-row sm:items-center sm:justify-between">
              <p>{page.error}</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#d8968f] bg-white/70 px-3 py-1.5 text-[10px] font-semibold text-[#87362f] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#87362f]"
              >
                <RotateCcw size={12} /> Try again
              </button>
            </div>
          ) : visibleItems.length === 0 && !page?.hasMore ? (
            <div className="grid min-h-72 place-items-center py-10 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-full border border-[var(--line)] bg-[var(--canvas)] text-[var(--muted)]">
                  <SearchX size={21} strokeWidth={1.5} />
                </span>
                <p className="mt-4 text-sm font-semibold">No matching pieces</p>
                <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">
                  Try a broader word like &ldquo;shirt&rdquo; or &ldquo;shoes&rdquo;, or switch the category back to All.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-[10px] text-[var(--muted)]">
                {visibleItems.length > 0
                  ? `${visibleItems.length} ${visibleItems.length === 1 ? "piece" : "pieces"}${page?.query ? ` for “${page.query}”` : ""}`
                  : "No men's matches in the first results yet. Load more to keep looking."}
              </p>

              {visibleItems.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                  {visibleItems.map((item) => {
                    const added = addedCatalogKeys.has(getCatalogKey(item));
                    return (
                      <li
                        key={item.rowIdx}
                        className="group flex flex-col overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel)] transition-colors hover:border-[var(--line-strong)]"
                      >
                        <div className="relative aspect-[3/4] overflow-hidden bg-white">
                          <CatalogThumbnail item={item} />
                          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur">
                            {CATEGORY_LABELS[item.category]}
                          </span>
                        </div>

                        <div className="flex flex-1 flex-col p-3">
                          <h3 className="line-clamp-2 text-[11px] font-semibold leading-4 tracking-[-0.01em]" title={item.name}>
                            {item.name}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[8px] text-[var(--muted)]">
                              <span
                                aria-hidden="true"
                                className="size-2 rounded-full border border-black/10"
                                style={{ backgroundColor: item.color.hex }}
                              />
                              {item.color.name}
                            </span>
                            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[8px] text-[var(--muted)]">
                              {item.season}
                            </span>
                            {item.usage && (
                              <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[8px] text-[var(--muted)]">
                                {item.usage}
                              </span>
                            )}
                          </div>

                          <div className="mt-auto pt-3">
                            <button
                              type="button"
                              onClick={() => addToCloset(item)}
                              disabled={added}
                              aria-label={added ? `${item.name} is in your closet` : `Add ${item.name} to closet`}
                              className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
                                added
                                  ? "cursor-default bg-[#e2efe2] text-[#315d3b]"
                                  : "bg-[var(--ink)] text-[#f3f0e8] hover:-translate-y-0.5"
                              }`}
                            >
                              {added ? <><Check size={12} strokeWidth={2.6} /> Added</> : <><Plus size={12} /> Add to Closet</>}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {page?.hasMore && (
                <div className="mt-5 flex flex-col items-center gap-2">
                  {visibleLoadMoreError && (
                    <p role="alert" className="text-[10px] font-medium text-[#a63f37]">{visibleLoadMoreError}</p>
                  )}
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-5 py-2.5 text-[10px] font-semibold text-[var(--ink)] transition-all hover:-translate-y-0.5 hover:border-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-60"
                  >
                    {isLoadingMore ? (
                      <><LoaderCircle size={13} className="animate-spin" /> Loading more</>
                    ) : visibleLoadMoreError ? (
                      <><RotateCcw size={13} /> Retry</>
                    ) : (
                      <>Load more</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--line)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[9px] leading-4 text-[var(--muted)]">
            Product data and images from the public{" "}
            <a
              href="https://huggingface.co/datasets/ashraq/fashion-product-images-small"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--ink)] underline-offset-2 hover:underline"
            >
              Fashion Product Images
            </a>{" "}
            dataset on Hugging Face.
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-[10px] font-semibold text-white shadow-[0_10px_24px_rgba(38,69,255,0.2)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export function CatalogSearchModal({ open, onOpenChange }: CatalogSearchModalProps) {
  // Mounting the dialog only while open gives every session fresh search state
  // and keeps catalog requests from firing in the background.
  return open ? <CatalogSearchDialog onOpenChange={onOpenChange} /> : null;
}

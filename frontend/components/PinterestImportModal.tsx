"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  Check,
  CloudDownload,
  Images,
  Link2,
  LoaderCircle,
  X,
} from "lucide-react";
import type { PinterestImportItem } from "@/types/pinterest";

interface PinterestImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (items: PinterestImportItem[]) => void | Promise<void>;
}

interface PinterestErrorResponse {
  error?: unknown;
}

function isPinterestImportItem(value: unknown): value is PinterestImportItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.title === "string" &&
    typeof item.imageUrl === "string" &&
    item.imageUrl.length > 0 &&
    typeof item.link === "string" &&
    item.link.length > 0
  );
}

function getApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const { error } = payload as PinterestErrorResponse;
    if (typeof error === "string" && error.trim()) return error;
  }

  return fallback;
}

export function PinterestImportModal({
  open,
  onOpenChange,
  onSave,
}: PinterestImportModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const isSavingRef = useRef(false);
  const [boardUrl, setBoardUrl] = useState("");
  const [items, setItems] = useState<PinterestImportItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const resetDialog = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setBoardUrl("");
    setItems([]);
    setError(null);
    setIsLoading(false);
    setIsSaving(false);
    isSavingRef.current = false;
  }, []);

  const closeDialog = useCallback(() => {
    if (isSavingRef.current) return;
    resetDialog();
    onOpenChange(false);
  }, [onOpenChange, resetDialog]);

  useEffect(() => {
    return () => activeRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));

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
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      activeRequestRef.current?.abort();
      previousFocusRef.current?.focus();
    };
  }, [closeDialog, open]);

  const importBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUrl = boardUrl.trim();
    if (!normalizedUrl) {
      setError("Paste a Pinterest board URL first.");
      inputRef.current?.focus();
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setItems([]);
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/pinterest?url=${encodeURIComponent(normalizedUrl)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiError(payload, "Pinterest could not read that board. Check that it is public and try again."),
        );
      }

      if (!Array.isArray(payload) || !payload.every(isPinterestImportItem)) {
        throw new Error("The importer received an unexpected response. Please try again.");
      }

      if (payload.length === 0) {
        throw new Error("No public pins with images were found on that board.");
      }

      setItems(payload);
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") return;
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while importing this board.",
      );
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const saveItems = async () => {
    if (items.length === 0 || isSaving) return;

    setError(null);
    setIsSaving(true);
    isSavingRef.current = true;
    try {
      await onSave(items);
      resetDialog();
      onOpenChange(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Those pins could not be saved to your closet.",
      );
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#181815]/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isLoading || isSaving}
        className="my-auto flex max-h-[min(90vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-[var(--panel)] shadow-[0_32px_100px_rgba(0,0,0,0.34)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <p className="section-label">Bulk closet intake</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
              Import from Pinterest
            </h2>
            <p id={descriptionId} className="mt-1 max-w-2xl text-[10px] leading-4 text-[var(--muted)]">
              Paste a public board URL, preview the pins Pinterest exposes through RSS, then save the collection to your closet.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            disabled={isSaving}
            aria-label="Close Pinterest import dialog"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <form onSubmit={importBoard} className="rounded-[20px] border border-[var(--line)] bg-[var(--canvas)] p-3 sm:p-4">
            <label htmlFor={inputId} className="section-label">
              Pinterest board URL
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Link2
                  aria-hidden="true"
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  ref={inputRef}
                  id={inputId}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  required
                  value={boardUrl}
                  onChange={(event) => {
                    setBoardUrl(event.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading || isSaving}
                  placeholder="https://www.pinterest.com/username/board-name/"
                  className="h-11 w-full rounded-xl border border-[var(--line)] bg-white py-2 pl-9 pr-3 text-[11px] outline-none transition-colors placeholder:text-[var(--muted)]/65 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--selection)] disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || isSaving || !boardUrl.trim()}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-[10px] font-semibold text-[#f3f0e8] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-45"
              >
                {isLoading ? (
                  <>
                    <LoaderCircle size={14} className="animate-spin" /> Reading board
                  </>
                ) : (
                  <>
                    <CloudDownload size={14} /> Import collection
                  </>
                )}
              </button>
            </div>
          </form>

          <div aria-live="polite" aria-atomic="true">
            {error && (
              <div role="alert" className="mt-4 rounded-[16px] border border-[#d8968f] bg-[#fae8e5] px-4 py-3 text-[10px] leading-5 text-[#87362f]">
                {error}
              </div>
            )}

            {isLoading && (
              <div role="status" className="grid min-h-72 place-items-center py-10 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--selection)] text-[var(--accent)]">
                    <LoaderCircle size={22} className="animate-spin" />
                  </span>
                  <p className="mt-4 text-sm font-semibold">Collecting public pins</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">Reading the RSS feed and preparing image previews.</p>
                </div>
              </div>
            )}
          </div>

          {!isLoading && items.length === 0 && !error && (
            <div className="grid min-h-72 place-items-center py-10 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-full border border-[var(--line)] bg-[var(--canvas)] text-[var(--accent)]">
                  <Images size={21} />
                </span>
                <p className="mt-4 text-sm font-semibold">Your preview will show up here</p>
                <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">
                  Public boards work best. Private or secret boards cannot be read through Pinterest RSS.
                </p>
              </div>
            </div>
          )}

          {!isLoading && items.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="section-label">Import preview</p>
                  <p className="mt-1 text-sm font-semibold">
                    {items.length} {items.length === 1 ? "pin" : "pins"} found
                  </p>
                </div>
                <p className="text-[9px] text-[var(--muted)]">Everything shown below will be saved.</p>
              </div>

              <p className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-[9px] leading-4 text-[var(--muted)]">
                Pinterest controls its RSS feed and may expose only recent public pins from very large boards.
              </p>

              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="group relative aspect-[4/5] overflow-hidden rounded-[16px] border border-[var(--line)] bg-[#e7e2d8]"
                  >
                    <Image
                      src={item.imageUrl}
                      alt={item.title || "Pinterest wardrobe inspiration"}
                      fill
                      sizes="(max-width: 640px) 46vw, (max-width: 1024px) 29vw, 220px"
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 via-black/48 to-transparent px-3 pb-3 pt-10 text-white">
                      <p className="line-clamp-2 text-[9px] font-semibold leading-4">
                        {item.title || "Untitled pin"}
                      </p>
                    </div>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${item.title || "Pinterest pin"} in a new tab`}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/68 text-white opacity-100 backdrop-blur transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <ArrowUpRight size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {items.length > 0 && !isLoading && (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setError(null);
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
              disabled={isSaving}
              className="rounded-full border border-[var(--line)] px-4 py-2.5 text-[10px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-45"
            >
              Use another board
            </button>
            <button
              type="button"
              onClick={saveItems}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-[10px] font-semibold text-white shadow-[0_10px_24px_rgba(38,69,255,0.2)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" /> Saving collection
                </>
              ) : (
                <>
                  <Check size={14} /> Save to closet ({items.length})
                </>
              )}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

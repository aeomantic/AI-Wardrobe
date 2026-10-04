"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { Check, ImagePlus, LoaderCircle, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  COLOR_OPTIONS,
  inferMockTags,
  SEASON_OPTIONS,
} from "@/lib/mock-closet";
import { useCloset } from "@/providers/ClosetProvider";
import type { ClosetCategory, ClosetColor, ClosetSeason } from "@/types/closet";

type DialogStep = "upload" | "processing" | "review";

interface AddClosetItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).filter(
  (entry): entry is [ClosetCategory, string] => entry[0] !== "all",
);

export function AddClosetItemDialog({ open, onOpenChange }: AddClosetItemDialogProps) {
  const { addItem } = useCloset();
  const inputId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const processingTimerRef = useRef<number | null>(null);
  const [step, setStep] = useState<DialogStep>("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemName, setItemName] = useState("New Closet Piece");
  const [category, setCategory] = useState<ClosetCategory>("top");
  const [season, setSeason] = useState<ClosetSeason>("All season");
  const [color, setColor] = useState<ClosetColor>(COLOR_OPTIONS[0]);
  const [styleTags, setStyleTags] = useState<string[]>(["everyday", "versatile"]);

  const clearTimer = useCallback(() => {
    if (processingTimerRef.current !== null) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  }, []);

  const resetDialog = useCallback(() => {
    clearTimer();
    setStep("upload");
    setPreview(null);
    setError(null);
    setItemName("New Closet Piece");
    setCategory("top");
    setSeason("All season");
    setColor(COLOR_OPTIONS[0]);
    setStyleTags(["everyday", "versatile"]);
  }, [clearTimer]);

  const closeDialog = useCallback(() => {
    onOpenChange(false);
    resetDialog();
  }, [onOpenChange, resetDialog]);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closeDialog]);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Keep the image under 10 MB for this demo.");
      return;
    }

    clearTimer();
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError("That image could not be read. Try another file.");
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const inferred = inferMockTags(file.name);
      setPreview(reader.result);
      setStep("processing");

      processingTimerRef.current = window.setTimeout(() => {
        setItemName(inferred.name);
        setCategory(inferred.category);
        setSeason(inferred.season);
        setColor(inferred.color);
        setStyleTags(inferred.styleTags);
        setStep("review");
        processingTimerRef.current = null;
      }, 1450);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const saveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preview) return;
    addItem({
      name: itemName.trim() || "New Closet Piece",
      category,
      season,
      color,
      imageSrc: preview,
      styleTags,
      backgroundRemoved: true,
    });
    closeDialog();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#181815]/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-item-title"
        aria-describedby="add-item-description"
        className="my-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/20 bg-[var(--panel)] shadow-[0_32px_100px_rgba(0,0,0,0.34)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <p className="section-label">Closet intake</p>
            <h2 id="add-item-title" className="mt-1 text-xl font-semibold tracking-[-0.04em]">Add a clothing item</h2>
            <p id="add-item-description" className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
              Upload one piece at a time. Mock AI will isolate and tag it for you.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDialog}
            aria-label="Close add item dialog"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X size={15} />
          </button>
        </header>

        <div className="max-h-[min(78vh,720px)] overflow-y-auto p-5 sm:p-6">
          {step === "upload" && (
            <div>
              <label
                htmlFor={inputId}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                className="group grid min-h-[340px] cursor-pointer place-items-center rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[var(--canvas)] p-8 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--selection)]/35 focus-within:ring-2 focus-within:ring-[var(--accent)]"
              >
                <input
                  id={inputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileInput}
                  className="sr-only"
                />
                <div className="max-w-sm">
                  <span className="mx-auto grid size-16 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--accent)] shadow-sm transition-transform group-hover:-translate-y-1">
                    <ImagePlus size={25} strokeWidth={1.5} />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.03em]">Drop a clean item photo here</h3>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                    A simple background gives the cleanest result. JPG, PNG, or WebP up to 10 MB.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold text-[#f3f0e8]">
                    <Upload size={14} /> Choose photo
                  </span>
                </div>
              </label>
              {error && <p role="alert" className="mt-3 text-center text-[10px] font-medium text-[#a63f37]">{error}</p>}
            </div>
          )}

          {step === "processing" && (
            <div role="status" aria-live="polite" className="grid gap-6 md:grid-cols-[1fr_0.9fr]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-[#e9e5db]">
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Uploaded closet item" className="size-full object-contain opacity-55 blur-[2px]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/18 to-white/55" />
                <div className="scan-line" />
                <span className="absolute inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/76 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                  <LoaderCircle size={13} className="animate-spin" /> Removing background
                </span>
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <WandSparkles size={17} />
                  <p className="text-sm font-semibold">AI closet prep</p>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                  Isolating the garment, reading its visual attributes, and preparing editable tags.
                </p>
                <div className="mt-6 space-y-3" aria-hidden="true">
                  <div className="h-10 animate-pulse rounded-xl bg-[var(--canvas)]" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-16 animate-pulse rounded-xl bg-[var(--canvas)]" />
                    <div className="h-16 animate-pulse rounded-xl bg-[var(--canvas)]" />
                  </div>
                  <div className="h-16 animate-pulse rounded-xl bg-[var(--canvas)]" />
                </div>
              </div>
            </div>
          )}

          {step === "review" && preview && (
            <form onSubmit={saveItem} className="grid gap-6 md:grid-cols-[1fr_1.05fr]">
              <div>
                <div
                  className="relative aspect-[4/5] overflow-hidden rounded-[22px] border border-[var(--line)] bg-[#e9e5db]"
                  style={{
                    backgroundImage: "radial-gradient(#c8c3b8 0.8px, transparent 0.8px)",
                    backgroundSize: "12px 12px",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Isolated closet item preview" className="size-full object-contain p-4 mix-blend-multiply" />
                  <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-[#315d3b] px-2.5 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-white">
                    <Check size={11} /> Background removed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setStep("upload");
                  }}
                  className="mt-3 w-full rounded-full border border-[var(--line)] py-2 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
                >
                  Use a different photo
                </button>
              </div>

              <div>
                <div className="mb-5 rounded-[18px] border border-[var(--accent)]/20 bg-[var(--selection)]/60 p-3">
                  <p className="flex items-center gap-2 text-[10px] font-semibold text-[var(--accent)]">
                    <Sparkles size={13} /> Auto-tags ready
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">Review anything the mock AI guessed before saving.</p>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="section-label">Item name</span>
                    <input
                      value={itemName}
                      onChange={(event) => setItemName(event.target.value)}
                      required
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[11px] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--selection)]"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="section-label">Category</span>
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value as ClosetCategory)}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[11px] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--selection)]"
                      >
                        {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="section-label">Season</span>
                      <select
                        value={season}
                        onChange={(event) => setSeason(event.target.value as ClosetSeason)}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[11px] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--selection)]"
                      >
                        {SEASON_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  </div>

                  <fieldset>
                    <legend className="section-label">Color</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((option) => (
                        <button
                          key={option.name}
                          type="button"
                          onClick={() => setColor(option)}
                          aria-pressed={color.name === option.name}
                          aria-label={`Set color to ${option.name}`}
                          title={option.name}
                          className={`grid size-8 place-items-center rounded-full border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
                            color.name === option.name ? "border-[var(--ink)] ring-2 ring-[var(--panel)]" : "border-black/10"
                          }`}
                          style={{ backgroundColor: option.hex }}
                        >
                          {color.name === option.name && (
                            <Check size={12} className={option.name === "Black" || option.name === "Navy" ? "text-white" : "text-black"} />
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[9px] text-[var(--muted)]">Detected: {color.name}</p>
                  </fieldset>

                  <div>
                    <p className="section-label">Style tags</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {styleTags.map((tag) => (
                        <span key={tag} className="rounded-full border border-[var(--line)] bg-[var(--canvas)] px-2.5 py-1.5 text-[9px] text-[var(--muted)]">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(38,69,255,0.2)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  <Check size={14} /> Add to my closet
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

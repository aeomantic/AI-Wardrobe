"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Cpu,
  HardDrive,
  ImagePlus,
  Info,
  LoaderCircle,
  Minimize2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/mock-closet";
import {
  blobToDataUrl,
  compressGarmentImage,
  ImageCompressionError,
} from "@/lib/storage/image-compressor";
import {
  deleteGarmentBlobs,
  GarmentStorageUnavailableError,
  primeGarmentObjectUrl,
  requestPersistentStorage,
  saveGarmentBlob,
  toIdbImageUrl,
  trackPendingGarmentUpload,
  untrackPendingGarmentUploads,
} from "@/lib/storage/image-store";
import {
  CLOSET_FITS,
  CLOSET_FORMALITIES,
  CLOSET_SEASONS,
  GARMENT_CATEGORIES,
  GARMENT_COLOR_PALETTE,
  paletteColorByName,
  sanitizeGarmentTags,
  sanitizeStyleTags,
  sanitizeVisualAnalysis,
} from "@/lib/wardrobe/garment-tags";
import { inferGarmentTagsLocally } from "@/lib/wardrobe/local-tagger";
import { createClosetItemId, useCloset } from "@/providers/ClosetProvider";
import type {
  AiProviderName,
  ClosetFit,
  ClosetFormality,
  ClosetSeason,
  GarmentCategory,
  GarmentPhotoType,
  GarmentTags,
  GarmentVisualAnalysis,
  NewClosetItem,
  TagFallbackReason,
  TagSource,
} from "@/types/closet";

interface AddClosetItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DraftStage = "compressing" | "saving" | "tagging" | "review" | "error";

interface TagHints {
  fileName: string;
  dominantHex: string | null;
  width: number;
  height: number;
}

interface TagResult {
  tags: GarmentTags;
  tagSource: TagSource;
  fallbackReason: TagFallbackReason | null;
  provider: AiProviderName | null;
  model: string | null;
  /** Shown as "Why AI picked this". Deliberately not saved on the closet item. */
  visualAnalysis: GarmentVisualAnalysis | null;
}

interface UploadDraft extends Partial<Omit<TagResult, "tags">> {
  id: string;
  fileName: string;
  stage: DraftStage;
  previewUrl: string | null;
  sizeBytes: number | null;
  tags: GarmentTags | null;
  tagsText: string;
  reanalyzing: boolean;
  notice: string | null;
  error: string | null;
}

const MAX_FILES_PER_BATCH = 12;
const PARALLEL_UPLOADS = 2;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

const PIPELINE_STEPS: { stage: DraftStage | "save"; label: string; icon: typeof Cpu }[] = [
  { stage: "compressing", label: "Compressing", icon: Minimize2 },
  { stage: "saving", label: "Saving locally", icon: HardDrive },
  { stage: "tagging", label: "AI tagging", icon: Sparkles },
  { stage: "review", label: "Review tags", icon: Check },
  { stage: "save", label: "Save", icon: Plus },
];

const STAGE_ORDER: Record<DraftStage, number> = { compressing: 0, saving: 1, tagging: 2, review: 3, error: 3 };

const PROVIDER_NAMES: Record<AiProviderName, string> = { groq: "Groq", openai: "OpenAI", gemini: "Gemini" };

const FALLBACK_LABELS: Record<TagFallbackReason, string> = {
  missing_api_key: "Local fallback · No vision key",
  api_error: "Local fallback · Vision API error",
  parse_error: "Local fallback · Unreadable AI reply",
};

const FALLBACK_HELP: Record<TagFallbackReason, string> = {
  missing_api_key: "No vision AI key is set on the server, so these tags are a best guess from the file name and photo colors. Add OPENAI_API_KEY or GEMINI_API_KEY, then re-analyze.",
  api_error: "The vision AI could not be reached, so these tags are a best guess from the file name and photo colors.",
  parse_error: "The vision AI sent back an answer that could not be used, so these tags are a best guess.",
};

const PHOTO_TYPE_LABELS: Record<GarmentPhotoType, string> = {
  hanger: "On a hanger",
  "flat-lay": "Flat lay",
  worn: "Worn",
  other: "Product shot",
};

function formatKilobytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isOneOf<T extends string>(value: unknown, options: Record<T, unknown>): value is T {
  return typeof value === "string" && Object.hasOwn(options, value);
}

/** Validates the tagging API's reply. Anything malformed is treated as an API failure. */
function parseTagResponse(payload: unknown): TagResult | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const tags = sanitizeGarmentTags(record.tags);
  if (!tags || (record.tagSource !== "ai-vision" && record.tagSource !== "local-fallback")) return null;
  const isVision = record.tagSource === "ai-vision";
  return {
    tags,
    tagSource: record.tagSource,
    fallbackReason: isVision ? null : isOneOf(record.fallbackReason, FALLBACK_LABELS) ? record.fallbackReason : "api_error",
    provider: isOneOf(record.provider, PROVIDER_NAMES) ? record.provider : null,
    model: typeof record.model === "string" ? record.model.slice(0, 80) : null,
    visualAnalysis: isVision ? sanitizeVisualAnalysis(record.visualAnalysis) : null,
  };
}

function tagResultPatch(result: TagResult): Partial<UploadDraft> {
  return {
    tags: result.tags,
    tagsText: result.tags.styleTags.join(", "),
    tagSource: result.tagSource,
    fallbackReason: result.fallbackReason,
    provider: result.provider,
    model: result.model,
    visualAnalysis: result.visualAnalysis,
  };
}

function describeError(error: unknown): string {
  if (error instanceof ImageCompressionError || error instanceof GarmentStorageUnavailableError) return error.message;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "This device is out of storage space for photos.";
  }
  return "This photo could not be processed. Try another one.";
}

/**
 * Tags one photo. If the tagging API itself cannot be reached or rejects the
 * request, the local tagger runs here and the result says so.
 */
async function tagPhoto(blob: Blob, hints: TagHints, signal: AbortSignal): Promise<TagResult> {
  try {
    const response = await fetch("/api/wardrobe/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        imageDataUrl: await blobToDataUrl(blob),
        fileName: hints.fileName,
        dominantHex: hints.dominantHex ?? undefined,
        width: hints.width,
        height: hints.height,
      }),
      signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    const result = response.ok ? parseTagResponse(payload) : null;
    if (result) return result;
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return {
    tags: inferGarmentTagsLocally({ ...hints, dominantHex: hints.dominantHex ?? undefined }),
    tagSource: "local-fallback",
    fallbackReason: "api_error",
    provider: null,
    model: null,
    visualAnalysis: null,
  };
}

function StageChip({ draft }: { draft: UploadDraft }) {
  if (draft.stage === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fae8e5] px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-[#87362f]">
        <CircleAlert size={10} /> Failed
      </span>
    );
  }
  if (draft.stage === "review" && draft.tagSource === "ai-vision") {
    const engine = [draft.provider ? PROVIDER_NAMES[draft.provider] : null, draft.model].filter(Boolean).join(" · ");
    return (
      <span
        title={engine ? `Tagged by ${engine}` : undefined}
        className="inline-flex items-center gap-1 rounded-full bg-[var(--selection)] px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]"
      >
        <Sparkles size={10} /> AI Vision Tagged
      </span>
    );
  }
  if (draft.stage === "review") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f8ecd6] px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-[#7a5418]">
        <CircleAlert size={10} /> {FALLBACK_LABELS[draft.fallbackReason ?? "api_error"]}
      </span>
    );
  }
  const label = PIPELINE_STEPS.find((step) => step.stage === draft.stage)?.label ?? "Working";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/72 px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-white">
      <LoaderCircle size={10} className="animate-spin" /> {label}
    </span>
  );
}

const fieldClass = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2.5 py-2 text-[10px] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--selection)]";

function DraftEditor({
  tags,
  tagsText,
  onChange,
  onTagsTextChange,
}: {
  tags: GarmentTags;
  tagsText: string;
  onChange: (patch: Partial<GarmentTags>) => void;
  onTagsTextChange: (value: string) => void;
}) {
  const colorOptions = paletteColorByName(tags.color.name) ? GARMENT_COLOR_PALETTE : [tags.color, ...GARMENT_COLOR_PALETTE];

  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
      <label className="col-span-2 block">
        <span className="section-label">Name</span>
        <input
          value={tags.name}
          maxLength={80}
          onChange={(event) => onChange({ name: event.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="section-label">Category</span>
        <select
          value={tags.category}
          onChange={(event) => onChange({ category: event.target.value as GarmentCategory })}
          className={fieldClass}
        >
          {GARMENT_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="section-label">Color</span>
        <span className="relative block">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-[calc(50%+2px)] size-3 -translate-y-1/2 rounded-full border border-black/15"
            style={{ backgroundColor: tags.color.hex }}
          />
          <select
            value={tags.color.name}
            onChange={(event) => {
              const color = colorOptions.find((option) => option.name === event.target.value);
              if (color) onChange({ color });
            }}
            className={`${fieldClass} pl-7`}
          >
            {colorOptions.map((color) => <option key={color.name} value={color.name}>{color.name}</option>)}
          </select>
        </span>
      </label>
      <label className="block">
        <span className="section-label">Material</span>
        <input
          value={tags.material}
          maxLength={40}
          onChange={(event) => onChange({ material: event.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="section-label">Fit</span>
        <select value={tags.fit} onChange={(event) => onChange({ fit: event.target.value as ClosetFit })} className={fieldClass}>
          {CLOSET_FITS.map((fit) => <option key={fit} value={fit}>{fit}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="section-label">Season</span>
        <select value={tags.season} onChange={(event) => onChange({ season: event.target.value as ClosetSeason })} className={fieldClass}>
          {CLOSET_SEASONS.map((season) => <option key={season} value={season}>{season}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="section-label">Formality</span>
        <select
          value={tags.formality}
          onChange={(event) => onChange({ formality: event.target.value as ClosetFormality })}
          className={fieldClass}
        >
          {CLOSET_FORMALITIES.map((formality) => <option key={formality} value={formality}>{formality}</option>)}
        </select>
      </label>
      <label className="col-span-2 block">
        <span className="section-label">Style tags</span>
        <input
          value={tagsText}
          maxLength={200}
          placeholder="minimal, layering, weekend"
          onChange={(event) => onTagsTextChange(event.target.value)}
          className={fieldClass}
        />
      </label>
    </div>
  );
}

function VisualAnalysisDetails({ analysis }: { analysis: GarmentVisualAnalysis }) {
  const rows: [string, string][] = [
    ["Photo", PHOTO_TYPE_LABELS[analysis.photoType]],
    ["Shoulders", analysis.shoulderConstruction],
    ["Sleeves / legs", analysis.sleeveProportion],
    ["Silhouette", analysis.bodySilhouette],
    ["True color", analysis.trueGarmentColor],
  ];

  return (
    <details className="group mt-2.5 rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-2.5 py-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[9px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <Info size={11} /> Why AI picked this
        <ChevronDown size={11} className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <dl className="mt-1.5 space-y-1 pb-0.5 text-[9px] leading-4">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[68px_minmax(0,1fr)] gap-2">
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd className="text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function UploadDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { addItems } = useCloset();
  const inputId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController>(new AbortController());
  // Photo ids written to IndexedDB by this dialog that are not in the closet yet.
  const uncommittedIdsRef = useRef(new Set<string>());
  // Compressed photos kept in memory so "Re-analyze with AI" can resend them.
  const tagSourcesRef = useRef(new Map<string, { blob: Blob; hints: TagHints }>());
  const hasRequestedPersistenceRef = useRef(false);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateDraft = useCallback((id: string, patch: Partial<UploadDraft>) => {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }, []);

  const updateDraftTags = useCallback((id: string, patch: Partial<GarmentTags>) => {
    setDrafts((current) => current.map((draft) => (
      draft.id === id && draft.tags ? { ...draft, tags: { ...draft.tags, ...patch } } : draft
    )));
  }, []);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const uncommittedIds = uncommittedIdsRef.current;
    const tagSources = tagSourcesRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      controller.abort();
      tagSources.clear();
      // Photos the user never saved must not linger in IndexedDB.
      const orphanIds = [...uncommittedIds];
      uncommittedIds.clear();
      untrackPendingGarmentUploads(orphanIds);
      void deleteGarmentBlobs(orphanIds).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  const processFile = useCallback(async (id: string, file: File) => {
    const signal = abortRef.current.signal;
    try {
      const compressed = await compressGarmentImage(file);
      if (signal.aborted) return;
      updateDraft(id, { stage: "saving", sizeBytes: compressed.sizeBytes });

      trackPendingGarmentUpload(id);
      uncommittedIdsRef.current.add(id);
      await saveGarmentBlob(id, compressed.blob);
      if (signal.aborted) return;
      updateDraft(id, { stage: "tagging", previewUrl: primeGarmentObjectUrl(id, compressed.blob) });

      if (!hasRequestedPersistenceRef.current) {
        hasRequestedPersistenceRef.current = true;
        void requestPersistentStorage();
      }

      const hints: TagHints = {
        fileName: file.name,
        dominantHex: compressed.dominantHex,
        width: compressed.width,
        height: compressed.height,
      };
      tagSourcesRef.current.set(id, { blob: compressed.blob, hints });
      const result = await tagPhoto(compressed.blob, hints, signal);
      if (signal.aborted) return;
      updateDraft(id, { stage: "review", ...tagResultPatch(result) });
    } catch (error) {
      if (signal.aborted) return;
      updateDraft(id, { stage: "error", error: describeError(error) });
    }
  }, [updateDraft]);

  const reanalyzeDraft = async (id: string) => {
    const source = tagSourcesRef.current.get(id);
    const signal = abortRef.current.signal;
    if (!source) return;
    updateDraft(id, { reanalyzing: true, notice: null });
    try {
      const result = await tagPhoto(source.blob, source.hints, signal);
      if (signal.aborted) return;
      if (result.tagSource === "ai-vision") {
        updateDraft(id, { ...tagResultPatch(result), reanalyzing: false });
      } else {
        // Vision is still unavailable: keep the user's edits, refresh only the reason.
        updateDraft(id, {
          reanalyzing: false,
          fallbackReason: result.fallbackReason,
          notice: "Vision AI is still unavailable. Your edits were kept.",
        });
      }
    } catch {
      if (!signal.aborted) updateDraft(id, { reanalyzing: false });
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => !file.type || file.type.startsWith("image/"));
    if (files.length === 0) {
      setNotice("Choose JPG, PNG, or WebP photos.");
      return;
    }

    const room = MAX_FILES_PER_BATCH - drafts.length;
    const accepted = files.slice(0, Math.max(0, room));
    setNotice(files.length > accepted.length ? `Up to ${MAX_FILES_PER_BATCH} photos per batch. Save these, then add more.` : null);
    if (accepted.length === 0) return;

    const queued = accepted.map((file) => ({ file, id: createClosetItemId() }));
    setDrafts((current) => [
      ...current,
      ...queued.map(({ file, id }): UploadDraft => ({
        id,
        fileName: file.name,
        stage: "compressing",
        previewUrl: null,
        sizeBytes: null,
        tags: null,
        tagsText: "",
        reanalyzing: false,
        notice: null,
        error: null,
      })),
    ]);

    // A small worker pool keeps the UI responsive and the tagging API unflooded.
    const queue = [...queued];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await processFile(next.id, next.file);
    };
    for (let index = 0; index < Math.min(PARALLEL_UPLOADS, queue.length); index += 1) void worker();
  };

  const discardDraft = (id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    tagSourcesRef.current.delete(id);
    if (uncommittedIdsRef.current.delete(id)) {
      untrackPendingGarmentUploads([id]);
      void deleteGarmentBlobs([id]).catch(() => undefined);
    }
  };

  const readyDrafts = drafts.filter((draft): draft is UploadDraft & { tags: GarmentTags } => draft.stage === "review" && draft.tags !== null);
  const processingCount = drafts.filter((draft) => STAGE_ORDER[draft.stage] < STAGE_ORDER.review).length;
  const isProcessing = processingCount > 0;
  const reanalyzingCount = drafts.filter((draft) => draft.reanalyzing).length;
  const isBusy = isProcessing || reanalyzingCount > 0;
  const currentStep = drafts.length === 0
    ? -1
    : isProcessing
      ? Math.min(...drafts.filter((draft) => draft.stage !== "error").map((draft) => STAGE_ORDER[draft.stage]))
      : 3;

  const saveDrafts = () => {
    if (readyDrafts.length === 0 || isBusy) return;
    const items = readyDrafts.map(({ id, tags, tagsText }): NewClosetItem => ({
      id,
      name: tags.name.trim() || `${tags.color.name} ${CATEGORY_LABELS[tags.category]}`,
      category: tags.category,
      season: tags.season,
      color: tags.color,
      material: tags.material.trim() || undefined,
      fit: tags.fit,
      formality: tags.formality,
      styleTags: sanitizeStyleTags(tagsText.split(",")),
      imageSrc: toIdbImageUrl(id),
      imageSource: "indexeddb",
      backgroundRemoved: false,
    }));
    const saved = addItems(items);
    saved.forEach((item) => uncommittedIdsRef.current.delete(item.id));
    close();
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#181815]/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isBusy}
        className="my-auto flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-[var(--panel)] shadow-[0_32px_100px_rgba(0,0,0,0.34)]"
      >
        <header className="shrink-0 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label">Closet intake</p>
              <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-[-0.04em]">Add clothes you own</h2>
              <p id={descriptionId} className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
                Photos are compressed and stored on this device. Each one is tagged once so Style Me can use it.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label="Close add item dialog"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <X size={15} />
            </button>
          </div>

          {drafts.length > 0 && (
            <ol aria-label="Upload progress" className="mt-4 grid grid-cols-5 gap-1">
              {PIPELINE_STEPS.map(({ stage, label, icon: Icon }, index) => {
                const done = index < currentStep;
                const active = index === currentStep;
                return (
                  <li
                    key={stage}
                    aria-current={active ? "step" : undefined}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center text-[8px] font-semibold sm:flex-row sm:justify-center sm:text-[9px] ${
                      active
                        ? "border-[var(--accent)] bg-[var(--selection)] text-[var(--accent)]"
                        : done
                          ? "border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)]"
                          : "border-[var(--line)] text-[var(--muted)]"
                    }`}
                  >
                    {done ? <Check size={12} /> : active && isProcessing ? <LoaderCircle size={12} className="animate-spin" /> : <Icon size={12} />}
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {drafts.length === 0 ? (
            <label
              htmlFor={inputId}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`group grid min-h-[340px] cursor-pointer place-items-center rounded-[24px] border border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)] ${
                isDragging
                  ? "border-[var(--accent)] bg-[var(--selection)]/50"
                  : "border-[var(--line-strong)] bg-[var(--canvas)] hover:border-[var(--accent)] hover:bg-[var(--selection)]/35"
              }`}
            >
              <input id={inputId} type="file" multiple accept={ACCEPTED_TYPES} onChange={handleFileInput} className="sr-only" />
              <div className="max-w-sm">
                <span className="mx-auto grid size-16 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--accent)] shadow-sm transition-transform group-hover:-translate-y-1">
                  <ImagePlus size={25} strokeWidth={1.5} />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.03em]">Drop clothing photos here</h3>
                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                  One piece per photo works best. JPG, PNG, or WebP, up to {MAX_FILES_PER_BATCH} at a time.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold text-[#f3f0e8]">
                  <Upload size={14} /> Choose photos
                </span>
              </div>
            </label>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-live="polite">
              {drafts.map((draft) => (
                <li key={draft.id} className="flex gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-3">
                  <div className="w-24 shrink-0 sm:w-28">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] border border-[var(--line)] bg-[#ebe7dc]">
                      {draft.previewUrl ? (
                        // Local blob: URLs cannot go through /_next/image.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={draft.previewUrl} alt={draft.tags?.name ?? draft.fileName} className="size-full object-contain" />
                      ) : (
                        <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-[#e8e4da]" />
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-center font-mono text-[7px] uppercase tracking-[0.08em] text-[var(--muted)]" title={draft.fileName}>
                      {draft.sizeBytes ? formatKilobytes(draft.sizeBytes) : draft.fileName}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <StageChip draft={draft} />
                      <button
                        type="button"
                        onClick={() => discardDraft(draft.id)}
                        aria-label={`Discard ${draft.tags?.name ?? draft.fileName}`}
                        className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[#fae8e5] hover:text-[#9b3932] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b3932]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {draft.stage === "error" ? (
                      <p role="alert" className="text-[10px] leading-5 text-[#87362f]">{draft.error}</p>
                    ) : draft.stage === "review" && draft.tags ? (
                      <>
                        {draft.tagSource === "local-fallback" && (
                          <div className="mb-2.5 rounded-lg border border-[#ecd9b8] bg-[#fbf4e6] px-2.5 py-2">
                            <p className="text-[9px] leading-4 text-[#6f4c16]">{FALLBACK_HELP[draft.fallbackReason ?? "api_error"]}</p>
                            {draft.notice && <p role="status" className="mt-1 text-[9px] font-semibold leading-4 text-[#6f4c16]">{draft.notice}</p>}
                            <button
                              type="button"
                              onClick={() => void reanalyzeDraft(draft.id)}
                              disabled={draft.reanalyzing}
                              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1.5 text-[9px] font-semibold text-[#f3f0e8] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 disabled:translate-y-0 disabled:opacity-55"
                            >
                              {draft.reanalyzing ? <LoaderCircle size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                              {draft.reanalyzing ? "Re-analyzing…" : "Re-analyze with AI"}
                            </button>
                          </div>
                        )}
                        <fieldset disabled={draft.reanalyzing} className="m-0 min-w-0 border-0 p-0 disabled:opacity-60">
                          <legend className="sr-only">Tags for {draft.tags.name || draft.fileName}</legend>
                          <DraftEditor
                            tags={draft.tags}
                            tagsText={draft.tagsText}
                            onChange={(patch) => updateDraftTags(draft.id, patch)}
                            onTagsTextChange={(tagsText) => updateDraft(draft.id, { tagsText })}
                          />
                        </fieldset>
                        {draft.tagSource === "ai-vision" && draft.visualAnalysis && (
                          <VisualAnalysisDetails analysis={draft.visualAnalysis} />
                        )}
                      </>
                    ) : (
                      <div className="space-y-2" aria-hidden="true">
                        <div className="h-8 animate-pulse rounded-lg bg-[var(--canvas)]" />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-8 animate-pulse rounded-lg bg-[var(--canvas)]" />
                          <div className="h-8 animate-pulse rounded-lg bg-[var(--canvas)]" />
                        </div>
                        <p className="text-[9px] text-[var(--muted)]">{draft.fileName}</p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {notice && <p role="alert" className="mt-3 text-center text-[10px] font-medium text-[#a63f37]">{notice}</p>}
        </div>

        {drafts.length > 0 && (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label
              htmlFor={`${inputId}-more`}
              className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--line)] px-4 py-2.5 text-[10px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-within:ring-2 focus-within:ring-[var(--accent)] ${
                drafts.length >= MAX_FILES_PER_BATCH ? "pointer-events-none opacity-45" : ""
              }`}
            >
              <input
                id={`${inputId}-more`}
                type="file"
                multiple
                accept={ACCEPTED_TYPES}
                onChange={handleFileInput}
                disabled={drafts.length >= MAX_FILES_PER_BATCH}
                className="sr-only"
              />
              <ImagePlus size={13} /> Add more photos
            </label>
            <button
              type="button"
              onClick={saveDrafts}
              disabled={readyDrafts.length === 0 || isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(38,69,255,0.2)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-45"
            >
              {isProcessing ? (
                <><LoaderCircle size={14} className="animate-spin" /> Preparing {processingCount} more</>
              ) : reanalyzingCount > 0 ? (
                <><LoaderCircle size={14} className="animate-spin" /> Re-analyzing {reanalyzingCount}</>
              ) : (
                <><Check size={14} /> Save {readyDrafts.length} to closet</>
              )}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

export function AddClosetItemDialog({ open, onOpenChange }: AddClosetItemDialogProps) {
  // Mounting only while open gives each session a clean slate, and unmounting
  // is what deletes any photos the user did not save.
  return open ? <UploadDialog onOpenChange={onOpenChange} /> : null;
}

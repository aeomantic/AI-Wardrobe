"use client";

import { useId, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
  UploadCloud,
  Video,
  WandSparkles,
} from "lucide-react";

const ACCEPTED_EXTENSIONS = ["jpg", "png", "webp", "mp4", "mov"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

interface MediaDropzoneProps {
  file: File | null;
  previewUrl: string | null;
  isLoading: boolean;
  error?: string | null;
  onFileSelect: (file: File) => void;
  onUseDemo: () => void;
}

function validateFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return "Use a JPG, PNG, WEBP, MP4, or MOV file.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "That file is over the 25 MB upload limit.";
  }
  return null;
}

export function MediaDropzone({
  file,
  previewUrl,
  isLoading,
  error,
  onFileSelect,
  onUseDemo,
}: MediaDropzoneProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const acceptFile = (nextFile?: File) => {
    if (!nextFile || isLoading) return;
    const validationError = validateFile(nextFile);
    setLocalError(validationError);
    if (!validationError) onFileSelect(nextFile);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const isVideo =
    file?.type.startsWith("video/") ||
    file?.name.toLowerCase().endsWith(".mov") ||
    file?.name.toLowerCase().endsWith(".mp4");
  const visibleError = localError ?? error;

  return (
    <section aria-labelledby="media-input-title">
      <div className="mb-3 flex items-center justify-between">
        <p id="media-input-title" className="section-label">Input media</p>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">25 MB max</span>
      </div>

      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`group relative block min-h-52 cursor-pointer overflow-hidden rounded-[20px] border transition-all duration-300 focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--selection)] shadow-[0_12px_34px_rgba(38,69,255,0.14)]"
            : "border-dashed border-[var(--line-strong)] bg-[var(--canvas)] hover:border-[var(--ink)]"
        }`}
      >
        <input
          id={inputId}
          type="file"
          accept=".jpg,.png,.webp,.mp4,.mov,image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          className="sr-only"
          disabled={isLoading}
          onChange={handleInput}
        />

        {previewUrl ? (
          <div className="absolute inset-0 bg-[#d8d3c9]">
            {isVideo ? (
              <video src={previewUrl} muted playsInline className="size-full object-cover" aria-label="Selected video preview" />
            ) : (
              // Blob URLs and dynamic user media are intentionally rendered without optimization.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Selected outfit preview" className="size-full object-cover" />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-10 text-white">
              <div className="flex items-center gap-2">
                {isVideo ? <Video size={14} /> : <ImageIcon size={14} />}
                <span className="min-w-0 truncate text-xs font-medium">{file?.name}</span>
              </div>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/65">Click to replace</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center">
            <span className="mb-4 grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] transition-transform duration-300 group-hover:-translate-y-1">
              <UploadCloud size={19} strokeWidth={1.7} />
            </span>
            <p className="text-sm font-semibold">Drop a full outfit here</p>
            <p className="mt-1.5 max-w-44 text-xs leading-5 text-[var(--muted)]">Images or short video clips work best with one clear subject.</p>
            <span className="mt-4 rounded-full bg-[var(--ink)] px-4 py-2 text-[11px] font-semibold text-[#f3f0e8]">Choose media</span>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--ink)]/82 text-white backdrop-blur-sm">
            <div className="text-center">
              <LoaderCircle className="mx-auto animate-spin" size={25} />
              <p className="mt-3 text-sm font-semibold">Reading the look</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-white/60">Detect · crop · style</p>
            </div>
          </div>
        )}
      </label>

      <button
        type="button"
        onClick={() => {
          setLocalError(null);
          onUseDemo();
        }}
        disabled={isLoading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-xs font-semibold transition-colors hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {file ? <RotateCcw size={14} /> : <WandSparkles size={14} />}
        {file ? "Reset to demo look" : "Explore the demo look"}
      </button>

      {visibleError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#d8a59f] bg-[#f7e7e4] px-3 py-2.5 text-[11px] leading-4 text-[#7e3029]" role="alert">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{visibleError}</span>
        </div>
      )}
    </section>
  );
}

"use client";

import { useId, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  UploadCloud,
} from "lucide-react";

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

interface InspectorDropzoneProps {
  imageSource: string | null;
  sourceName: string | null;
  isProcessing: boolean;
  onFileSelect: (file: File) => void;
  onUseDemo: () => void;
  onReset: () => void;
}

function validateImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_EXTENSIONS.includes(extension) || !file.type.startsWith("image/")) {
    return "Choose a JPG, PNG, or WEBP image.";
  }
  if (file.size > MAX_IMAGE_SIZE) return "That image is over the 15 MB limit.";
  return null;
}

export function InspectorDropzone({
  imageSource,
  sourceName,
  isProcessing,
  onFileSelect,
  onUseDemo,
  onReset,
}: InspectorDropzoneProps) {
  const inputId = useId();
  const descriptionId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptImage = (file?: File) => {
    if (!file || isProcessing) return;
    const validationError = validateImage(file);
    setError(validationError);
    if (!validationError) onFileSelect(file);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    acceptImage(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptImage(event.dataTransfer.files?.[0]);
  };

  return (
    <section aria-labelledby="inspector-upload-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="section-label">01 / Add a reference</p>
          <h2 id="inspector-upload-title" className="mt-1 text-lg font-semibold tracking-[-0.03em]">
            Upload an outfit photo
          </h2>
        </div>
        <span className="rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          Local mock
        </span>
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
        className={`group relative flex min-h-44 cursor-pointer items-center overflow-hidden rounded-[20px] border border-dashed px-5 py-6 outline-none transition focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--selection)]"
            : "border-[var(--line-strong)] bg-[var(--canvas)] hover:border-[var(--ink)]"
        } ${isProcessing ? "cursor-wait" : ""}`}
      >
        <input
          id={inputId}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-describedby={descriptionId}
          disabled={isProcessing}
          onChange={handleInput}
        />

        {imageSource ? (
          <div className="flex w-full items-center gap-4">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-black/10 bg-[#ddd7cd]">
              {/* Blob URLs from local uploads cannot use static image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSource} alt="Selected outfit" className="size-full object-cover" />
              {isProcessing && <span className="absolute inset-0 animate-pulse bg-[var(--accent)]/15" />}
            </div>
            <div className="min-w-0">
              <span className="mb-2 grid size-8 place-items-center rounded-full bg-[var(--ink)] text-[#f3f0e8]">
                <ImageIcon size={14} />
              </span>
              <p className="truncate text-sm font-semibold">{sourceName}</p>
              <p id={descriptionId} className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                {isProcessing ? "AI mock is reading the look" : "Click or drop another image to replace it"}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto text-center">
            <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] transition-transform group-hover:-translate-y-1">
              <UploadCloud size={18} strokeWidth={1.7} />
            </span>
            <p className="text-sm font-semibold">Drop an inspiration photo here</p>
            <p id={descriptionId} className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
              JPG, PNG, or WEBP, up to 15 MB
            </p>
          </div>
        )}
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            onUseDemo();
          }}
          disabled={isProcessing}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold text-[#f3f0e8] transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Sparkles size={13} /> Try demo
        </button>
        {imageSource && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onReset();
            }}
            className="flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-[11px] font-semibold transition hover:border-[var(--ink)]"
          >
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-[#f7e7e4] px-3 py-2 text-[11px] font-medium text-[#7e3029]">
          {error}
        </p>
      )}
    </section>
  );
}

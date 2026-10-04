"use client";

import { Check, ScanSearch } from "lucide-react";
import { colorToCss } from "@/lib/outfit";
import type { GarmentBox } from "@/types/outfit";

interface InspectorGarmentCardProps {
  garment: GarmentBox;
  sourceImage: string;
  selected: boolean;
  onSelect: () => void;
}

export function InspectorGarmentCard({
  garment,
  sourceImage,
  selected,
  onSelect,
}: InspectorGarmentCardProps) {
  const [ymin, xmin, ymax, xmax] = garment.box_2d;
  const objectPosition = `${(xmin + xmax) / 20}% ${(ymin + ymax) / 20}%`;

  return (
    <article id={`inspector-garment-${garment.id}`}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Inspect ${garment.label}`}
        onClick={onSelect}
        className={`group flex w-full gap-3 rounded-[18px] border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
          selected
            ? "border-[var(--accent)] bg-[var(--selection)] shadow-[0_12px_30px_rgba(38,69,255,0.1)]"
            : "border-[var(--line)] bg-[var(--panel)] hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
        }`}
      >
        <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[14px] border border-black/5 bg-[#ddd7cd]">
          {/* Local upload URLs are displayed directly for the mock crop preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sourceImage}
            alt=""
            className="size-full scale-[1.55] object-cover transition duration-300 group-hover:scale-[1.62]"
            style={{ objectPosition }}
          />
          <span className="absolute left-2 top-2 rounded-full bg-black/72 px-2 py-1 font-mono text-[8px] font-bold text-white">
            {Math.round(garment.confidence * 100)}%
          </span>
          {selected && (
            <span className="absolute bottom-2 right-2 grid size-6 place-items-center rounded-full bg-[var(--accent)] text-white">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="category-badge">{garment.category}</span>
            <span className="flex items-center gap-1 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
              <ScanSearch size={11} /> AI tag
            </span>
          </div>
          <h3 className="mt-2.5 text-[13px] font-semibold leading-tight tracking-[-0.02em]">{garment.label}</h3>
          <div className="mt-2 flex items-center gap-2 text-[10px] capitalize text-[var(--muted)]">
            <span
              className="size-3.5 shrink-0 rounded-full border border-black/15"
              style={{ backgroundColor: colorToCss(garment.color) }}
              aria-hidden="true"
            />
            <span>{garment.color}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1">
            <span className="attribute-chip">{garment.silhouette}</span>
            <span className="attribute-chip">{garment.material_estimate}</span>
          </div>
        </div>
      </button>
    </article>
  );
}

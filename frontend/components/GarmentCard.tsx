"use client";

import { ArrowUpRight, Check, Layers3 } from "lucide-react";
import { colorToCss, toImageSource } from "@/lib/outfit";
import type { GarmentBox } from "@/types/outfit";

interface GarmentCardProps {
  garment: GarmentBox;
  selected: boolean;
  sourceImage: string;
  onSelect: () => void;
  onFindAlternatives: () => void;
}

const FALLBACK_POSITION: Record<GarmentBox["category"], string> = {
  outerwear: "50% 31%",
  top: "50% 32%",
  bottom: "50% 69%",
  footwear: "50% 96%",
  accessory: "61% 37%",
  "one-piece": "50% 50%",
};

export function GarmentCard({
  garment,
  selected,
  sourceImage,
  onSelect,
  onFindAlternatives,
}: GarmentCardProps) {
  const cropSource = toImageSource(garment.crop_base64);
  const imageSource = cropSource ?? sourceImage;

  return (
    <article
      id={`garment-${garment.id}`}
      className={`group overflow-hidden rounded-[18px] border bg-[var(--panel)] text-left transition-all duration-200 ${
        selected
          ? "border-[var(--accent)] shadow-[0_10px_30px_rgba(38,69,255,0.12)]"
          : "border-[var(--line)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[0_10px_28px_rgba(28,26,20,0.08)]"
      }`}
    >
      <button
        type="button"
        aria-label={`Inspect ${garment.label}`}
        aria-pressed={selected}
        onClick={onSelect}
        className="flex w-full gap-3 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <div className="relative h-[104px] w-[88px] shrink-0 overflow-hidden rounded-[13px] border border-black/5 bg-[#e2ddd2]">
          {/* API crop data and blob-like sources are not compatible with static image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSource}
            alt={`${garment.label} crop`}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            style={{ objectPosition: cropSource ? "center" : FALLBACK_POSITION[garment.category] }}
          />
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-1.5 py-1 font-mono text-[8px] font-bold text-white backdrop-blur">
            {Math.round(garment.confidence * 100)}%
          </span>
          {selected && (
            <span className="absolute bottom-2 right-2 grid size-5 place-items-center rounded-full bg-[var(--accent)] text-white">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <span className="category-badge">{garment.category}</span>
            <span
              className="mt-0.5 size-4 shrink-0 rounded-full border border-black/15 shadow-inner"
              style={{ backgroundColor: colorToCss(garment.color) }}
              title={garment.color}
              aria-label={`Color: ${garment.color}`}
            />
          </div>
          <h3 className="mt-2 line-clamp-2 text-[13px] font-semibold leading-[1.2] tracking-[-0.02em]">{garment.label}</h3>
          <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{garment.color}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="attribute-chip">{garment.silhouette}</span>
            <span className="attribute-chip">{garment.material_estimate}</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFindAlternatives();
        }}
        className={`flex w-full items-center justify-between border-t px-3 py-2.5 text-[10px] font-semibold transition-colors ${
          selected
            ? "border-[var(--accent)]/20 bg-[var(--selection)] text-[var(--accent)]"
            : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
        }`}
      >
        <span className="flex items-center gap-1.5"><Layers3 size={12} /> Find styling alternatives</span>
        <ArrowUpRight size={12} />
      </button>
    </article>
  );
}

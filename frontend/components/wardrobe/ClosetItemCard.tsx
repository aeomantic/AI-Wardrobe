"use client";

import { Check, Pin, Trash2 } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/mock-closet";
import type { ClosetItem } from "@/types/closet";

interface ClosetItemCardProps {
  item: ClosetItem;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

export function ClosetItemCard({ item, selected, onToggle, onRemove }: ClosetItemCardProps) {
  return (
    <article
      className={`group relative overflow-hidden rounded-[22px] border bg-[var(--panel)] transition-all duration-200 ${
        selected
          ? "border-[var(--accent)] shadow-[0_14px_36px_rgba(38,69,255,0.13)]"
          : "border-[var(--line)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[0_12px_30px_rgba(28,26,20,0.08)]"
      }`}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[#ebe7dc]">
        {/* Uploaded data URLs and generated mock SVGs are intentionally rendered without optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageSrc}
          alt={item.name}
          className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.025]"
        />

        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`${selected ? "Unpin" : "Pin"} ${item.name} for outfit generation`}
          className={`absolute left-3 top-3 grid size-9 place-items-center rounded-full border shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
            selected
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-white/70 bg-white/82 text-[var(--ink)] hover:bg-white"
          }`}
        >
          {selected ? <Check size={15} strokeWidth={2.8} /> : <Pin size={14} />}
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name} from closet`}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-white/70 bg-white/82 text-[var(--muted)] opacity-0 shadow-sm backdrop-blur transition-all hover:bg-white hover:text-[#9b3932] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b3932] focus-visible:ring-offset-2 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>

        {item.backgroundRemoved && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/72 px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur">
            Isolated
          </span>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-[var(--muted)]">
              {CATEGORY_LABELS[item.category]} · {item.season}
            </p>
            <h3 className="mt-1 truncate text-[13px] font-semibold tracking-[-0.02em]">{item.name}</h3>
          </div>
          <span
            className="mt-1 size-4 shrink-0 rounded-full border border-black/15 shadow-inner"
            style={{ backgroundColor: item.color.hex }}
            aria-label={`Color: ${item.color.name}`}
            title={item.color.name}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {item.styleTags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--line)] px-2 py-1 text-[8px] text-[var(--muted)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

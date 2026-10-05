"use client";

import { Archive, Download, Plus, Sparkles } from "lucide-react";
import { CATEGORY_TABS } from "@/lib/mock-closet";
import type { ClosetFilter, ClosetItem } from "@/types/closet";
import { ClosetItemCard } from "./ClosetItemCard";

interface ClosetGridProps {
  items: ClosetItem[];
  activeFilter: ClosetFilter;
  selectedItemIds: string[];
  onFilterChange: (filter: ClosetFilter) => void;
  onToggleItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onAddItem: () => void;
  onImportPinterest: () => void;
}

export function ClosetGrid({
  items,
  activeFilter,
  selectedItemIds,
  onFilterChange,
  onToggleItem,
  onRemoveItem,
  onAddItem,
  onImportPinterest,
}: ClosetGridProps) {
  const filteredItems = activeFilter === "all"
    ? items
    : items.filter((item) => item.category === activeFilter);

  return (
    <section aria-labelledby="closet-heading" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label">Your pieces</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <h2 id="closet-heading" className="text-2xl font-semibold tracking-[-0.045em]">Digital closet</h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {items.length} items
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onImportPinterest}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2 text-[11px] font-semibold text-[var(--ink)] transition-all hover:-translate-y-0.5 hover:border-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <Download size={14} /> Import Pinterest
          </button>
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2 text-[11px] font-semibold text-[#f3f0e8] shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <Plus size={14} /> Add item
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Filter closet by category"
        className="inspector-scroll mb-5 flex gap-1 overflow-x-auto rounded-[16px] border border-[var(--line)] bg-[var(--panel)] p-1.5"
      >
        {CATEGORY_TABS.map(([filter, label]) => {
          const count = filter === "all" ? items.length : items.filter((item) => item.category === filter).length;
          const active = filter === activeFilter;
          return (
            <button
              key={filter}
              id={`closet-tab-${filter}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="closet-items-panel"
              onClick={() => onFilterChange(filter)}
              className={`shrink-0 rounded-[11px] px-3 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                active
                  ? "bg-[var(--ink)] text-[#f3f0e8] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
              }`}
            >
              {label} <span className={active ? "text-white/55" : "text-[var(--line-strong)]"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div
        id="closet-items-panel"
        role="tabpanel"
        aria-labelledby={`closet-tab-${activeFilter}`}
      >
        {filteredItems.length > 0 ? (
          <>
            <p className="mb-3 flex items-center gap-2 text-[10px] text-[var(--muted)]">
              <Sparkles size={12} /> Pin pieces you want the outfit builder to prioritize.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item) => (
                <ClosetItemCard
                  key={item.id}
                  item={item}
                  selected={selectedItemIds.includes(item.id)}
                  onToggle={() => onToggleItem(item.id)}
                  onRemove={() => onRemoveItem(item.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="grid min-h-[390px] place-items-center rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[var(--panel)] p-8 text-center">
            <div className="max-w-xs">
              <span className="mx-auto grid size-14 place-items-center rounded-full border border-[var(--line)] bg-[var(--canvas)] text-[var(--muted)]">
                <Archive size={22} strokeWidth={1.5} />
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">
                {items.length === 0 ? "Your closet is ready when you are" : "Nothing in this category yet"}
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                Add a clear photo of one piece. We will isolate it, tag it, and make it available to Style Me.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={onImportPinterest}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2.5 text-[11px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  <Download size={14} /> Import board
                </button>
                <button
                  type="button"
                  onClick={onAddItem}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[11px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  <Plus size={14} /> Add your first item
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

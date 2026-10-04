"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Shirt, Sparkles } from "lucide-react";
import { useCloset } from "@/providers/ClosetProvider";
import type { ClosetFilter } from "@/types/closet";
import { AddClosetItemDialog } from "./AddClosetItemDialog";
import { ClosetGrid } from "./ClosetGrid";
import { StyleMePanel } from "./StyleMePanel";

export function WardrobeDashboard() {
  const { items, selectedItemIds, removeItem, toggleItemSelection } = useCloset();
  const [activeFilter, setActiveFilter] = useState<ClosetFilter>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const scrollToStyleMe = () => {
    document.getElementById("style-me")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="mb-8 overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--ink)] text-[#f3f0e8] shadow-[0_18px_54px_rgba(31,29,23,0.12)]">
          <div className="grid gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <Link href="/" className="mb-6 inline-flex items-center gap-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-white/55 transition-colors hover:text-white">
                <ArrowLeft size={11} /> Studio home
              </Link>
              <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#aeb9ff]">
                <Shirt size={13} /> Personal wardrobe memory
              </p>
              <h1 className="mt-3 max-w-3xl text-[clamp(2.6rem,6vw,5.6rem)] font-semibold leading-[0.88] tracking-[-0.07em]">
                Your closet,<br />finally remixable.
              </h1>
            </div>

            <div className="rounded-[20px] border border-white/12 bg-white/[0.055] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-white/48">Closet memory</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.05em]">{items.length}</p>
                </div>
                <span className="grid size-11 place-items-center rounded-full bg-white/10 text-[#b9c3ff]">
                  <Shirt size={18} />
                </span>
              </div>
              <p className="mt-3 text-[10px] leading-5 text-white/55">
                Add real pieces, pin the ones you want to wear, then build three closet-only outfits around your day.
              </p>
              <button
                type="button"
                onClick={scrollToStyleMe}
                className="mt-4 flex w-full items-center justify-between rounded-full bg-[var(--canvas)] px-4 py-2.5 text-[10px] font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="flex items-center gap-2"><Sparkles size={13} /> Style me now</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </section>

        <ClosetGrid
          items={items}
          activeFilter={activeFilter}
          selectedItemIds={selectedItemIds}
          onFilterChange={setActiveFilter}
          onToggleItem={toggleItemSelection}
          onRemoveItem={removeItem}
          onAddItem={() => setIsAddDialogOpen(true)}
        />

        <StyleMePanel />

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          <p>Threadline Closet · Session-saved mock data</p>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-1.5 hover:text-[var(--ink)]">
            Back to top <ArrowUpRight size={11} />
          </button>
        </footer>
      </div>

      <AddClosetItemDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
    </main>
  );
}

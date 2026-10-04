"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  CloudSun,
  Coffee,
  LoaderCircle,
  MoonStar,
  Snowflake,
  Sparkles,
  Sun,
  WandSparkles,
} from "lucide-react";
import { buildMockOutfits } from "@/lib/mock-closet";
import { useCloset } from "@/providers/ClosetProvider";
import type {
  ClosetItem,
  GeneratedClosetOutfit,
  StyleOccasion,
  WeatherProfile,
} from "@/types/closet";

const OCCASIONS: { value: StyleOccasion; icon: typeof Coffee }[] = [
  { value: "Casual", icon: Coffee },
  { value: "Work", icon: BriefcaseBusiness },
  { value: "Night Out", icon: MoonStar },
];

const WEATHER: { value: WeatherProfile; icon: typeof Sun }[] = [
  { value: "Warm", icon: Sun },
  { value: "Mild", icon: CloudSun },
  { value: "Cool", icon: Snowflake },
];

function OutfitCard({ outfit, items, index }: { outfit: GeneratedClosetOutfit; items: ClosetItem[]; index: number }) {
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const outfitItems = outfit.itemIds.flatMap((itemId) => {
    const item = itemById.get(itemId);
    return item ? [item] : [];
  });

  return (
    <article className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_34px_rgba(31,29,23,0.06)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <div>
          <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Look 0{index + 1}</p>
          <h3 className="mt-0.5 text-sm font-semibold tracking-[-0.025em]">{outfit.title}</h3>
        </div>
        <span className="grid size-8 place-items-center rounded-full bg-[var(--selection)] text-[var(--accent)]">
          <Sparkles size={13} />
        </span>
      </div>

      <div className={`grid h-[230px] grid-rows-2 gap-px bg-[var(--line)] sm:h-[250px] lg:h-[220px] xl:h-[245px] ${outfitItems.length >= 5 ? "grid-cols-3" : "grid-cols-2"}`}>
        {outfitItems.slice(0, 5).map((item, itemIndex) => (
          <figure
            key={item.id}
            className={`relative min-h-0 overflow-hidden bg-[#eeeae1] ${
              outfitItems.length >= 5 && itemIndex === 0
                ? "row-span-2"
                : outfitItems.length === 3 && itemIndex === 2
                  ? "col-span-2"
                  : outfitItems.length === 2
                    ? "row-span-2"
                    : outfitItems.length === 1
                      ? "col-span-2 row-span-2"
                      : ""
            }`}
          >
            {/* Data URL mock art and user uploads are rendered as-is. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageSrc} alt={item.name} className="size-full object-contain p-1" />
            <figcaption className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full bg-black/68 px-2 py-1 text-center text-[7px] font-medium text-white backdrop-blur">
              {item.name}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="p-4">
        <p className="text-[10px] leading-[1.6] text-[var(--ink)]">{outfit.description}</p>
        <p className="mt-2 border-l-2 border-[var(--accent)] pl-2.5 text-[9px] leading-4 text-[var(--muted)]">{outfit.stylingNote}</p>
        <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
          <span>{outfit.occasion}</span>
          <span>{outfitItems.length} closet pieces</span>
          <span>{outfit.weather}</span>
        </div>
      </div>
    </article>
  );
}

export function StyleMePanel() {
  const { items, selectedItemIds, clearSelection } = useCloset();
  const [occasion, setOccasion] = useState<StyleOccasion>("Casual");
  const [weather, setWeather] = useState<WeatherProfile>("Mild");
  const [isGenerating, setIsGenerating] = useState(false);
  const [outfits, setOutfits] = useState<GeneratedClosetOutfit[]>([]);
  const generationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (generationTimerRef.current !== null) window.clearTimeout(generationTimerRef.current);
    };
  }, []);

  const generateOutfits = () => {
    if (items.length === 0) return;
    if (generationTimerRef.current !== null) window.clearTimeout(generationTimerRef.current);
    setIsGenerating(true);
    setOutfits([]);
    generationTimerRef.current = window.setTimeout(() => {
      setOutfits(buildMockOutfits(items, occasion, weather, selectedItemIds));
      setIsGenerating(false);
      generationTimerRef.current = null;
    }, 1350);
  };

  return (
    <section id="style-me" aria-labelledby="style-me-heading" className="mt-10 scroll-mt-24 border-t border-[var(--line)] pt-8">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="h-fit rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_16px_54px_rgba(31,29,23,0.06)] lg:sticky lg:top-20">
          <div className="flex items-center gap-2 text-[var(--accent)]">
            <WandSparkles size={16} />
            <p className="section-label !text-[var(--accent)]">AI outfit builder</p>
          </div>
          <h2 id="style-me-heading" className="mt-2 text-[2rem] font-semibold leading-[0.95] tracking-[-0.055em]">Style me from my closet.</h2>
          <p className="mt-3 text-[10px] leading-[1.7] text-[var(--muted)]">
            Pick the brief. Every result below uses only items already saved in your Digital Closet.
          </p>

          <fieldset className="mt-6">
            <legend className="section-label">Occasion</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Occasion">
              {OCCASIONS.map(({ value, icon: Icon }) => {
                const active = value === occasion;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setOccasion(value)}
                    className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                      active
                        ? "border-[var(--ink)] bg-[var(--ink)] text-[#f3f0e8]"
                        : "border-[var(--line)] bg-[var(--canvas)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Icon size={15} /> {value}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="section-label">Weather</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Weather">
              {WEATHER.map(({ value, icon: Icon }) => {
                const active = value === weather;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setWeather(value)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                      active
                        ? "border-[var(--accent)] bg-[var(--selection)] text-[var(--accent)]"
                        : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Icon size={13} /> {value}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 rounded-[14px] border border-[var(--line)] bg-[var(--canvas)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold">Pinned for this brief</span>
              {selectedItemIds.length > 0 && (
                <button type="button" onClick={clearSelection} className="text-[8px] font-semibold text-[var(--accent)] hover:underline">Clear</button>
              )}
            </div>
            <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">
              {selectedItemIds.length > 0
                ? `${selectedItemIds.length} ${selectedItemIds.length === 1 ? "piece" : "pieces"} will be prioritized.`
                : "No pins yet. We will use your whole closet."}
            </p>
          </div>

          <button
            type="button"
            onClick={generateOutfits}
            disabled={items.length === 0 || isGenerating}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(38,69,255,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            {isGenerating ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? "Building 3 looks" : "Generate 3 outfits"}
          </button>
        </div>

        <div aria-live="polite" aria-busy={isGenerating}>
          {isGenerating ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)]">
                  <div className="h-16 animate-pulse border-b border-[var(--line)] bg-[var(--canvas)]" />
                  <div className="grid h-[230px] grid-cols-2 gap-px bg-[var(--line)]">
                    {Array.from({ length: 4 }, (_, cell) => <div key={cell} className="animate-pulse bg-[#e8e4da]" />)}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="h-3 w-full animate-pulse rounded bg-[var(--canvas)]" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--canvas)]" />
                    <div className="h-10 animate-pulse rounded bg-[var(--canvas)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : outfits.length === 3 ? (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="section-label">Generated from {items.length} owned pieces</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em]">Your three outfit edits</h3>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-[#e2efe2] px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#315d3b]">
                  <Check size={11} /> Closet-only results
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {outfits.map((outfit, index) => (
                  <OutfitCard key={outfit.id} outfit={outfit} items={items} index={index} />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[480px] place-items-center rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[var(--panel)] p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--selection)] text-[var(--accent)]">
                  <WandSparkles size={25} strokeWidth={1.5} />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em]">
                  {items.length > 0 ? "Your closet is ready to remix" : "Add a few pieces first"}
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                  {items.length > 0
                    ? "Choose an occasion and weather, then generate three combinations using only your saved pieces."
                    : "Style Me never invents products. It needs at least one item from your Digital Closet."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

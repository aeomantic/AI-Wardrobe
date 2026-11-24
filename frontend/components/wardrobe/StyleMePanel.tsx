"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  CloudSun,
  Coffee,
  LoaderCircle,
  MoonStar,
  RotateCcw,
  Snowflake,
  Sparkles,
  Sun,
  WandSparkles,
} from "lucide-react";
import { WardrobeImage } from "@/components/WardrobeImage";
import { toWardrobeMetadata } from "@/lib/wardrobe/garment-tags";
import { useCloset } from "@/providers/ClosetProvider";
import type {
  AiResultSource,
  ClosetItem,
  GeneratedClosetOutfit,
  OutfitRecommendResponse,
  StyleOccasion,
  WardrobeItemMetadata,
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

const SOURCE_LABELS: Record<AiResultSource, string> = {
  groq: "AI stylist · Groq",
  openai: "AI stylist · OpenAI",
  gemini: "AI stylist · Gemini",
  fallback: "Smart local stylist",
};

function isRecommendResponse(value: unknown): value is OutfitRecommendResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<OutfitRecommendResponse>;
  return typeof payload.source === "string"
    && payload.source in SOURCE_LABELS
    && Array.isArray(payload.outfits)
    && payload.outfits.every((outfit) => (
      typeof outfit?.id === "string"
      && typeof outfit.title === "string"
      && typeof outfit.reason === "string"
      && Array.isArray(outfit.itemIds)
      && outfit.itemIds.every((itemId) => typeof itemId === "string")
    ));
}

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
            <WardrobeImage item={item} className="size-full object-contain p-1" />
            <figcaption className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full bg-black/68 px-2 py-1 text-center text-[7px] font-medium text-white backdrop-blur">
              {item.name}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="p-4">
        <p className="border-l-2 border-[var(--accent)] pl-2.5 text-[10px] leading-[1.6] text-[var(--ink)]">{outfit.reason}</p>
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
  const styleNoteId = useId();
  const [occasion, setOccasion] = useState<StyleOccasion>("Casual");
  const [weather, setWeather] = useState<WeatherProfile>("Mild");
  const [styleNote, setStyleNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [outfits, setOutfits] = useState<GeneratedClosetOutfit[]>([]);
  const [resultSource, setResultSource] = useState<AiResultSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  // Only image-free metadata is ever sent; inspiration pins are not garments.
  const garments = useMemo(
    () => items.flatMap((item) => toWardrobeMetadata(item) ?? []),
    [items],
  );

  useEffect(() => () => requestRef.current?.abort(), []);

  const generateOutfits = async () => {
    if (garments.length === 0) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsGenerating(true);
    setOutfits([]);
    setError(null);

    try {
      const body: {
        items: WardrobeItemMetadata[];
        occasion: StyleOccasion;
        weather: WeatherProfile;
        styleNote?: string;
        pinnedItemIds: string[];
      } = {
        items: garments,
        occasion,
        weather,
        ...(styleNote.trim() ? { styleNote: styleNote.trim() } : {}),
        pinnedItemIds: selectedItemIds,
      };
      const response = await fetch("/api/outfits/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Outfits could not be generated. Try again.";
        throw new Error(message);
      }
      if (!isRecommendResponse(payload)) throw new Error("The stylist returned an unexpected response. Try again.");
      if (payload.outfits.length === 0) {
        throw new Error("Add at least a top, a bottom, or shoes so the stylist can build a complete look.");
      }

      setOutfits(payload.outfits.map((outfit) => ({ ...outfit, occasion, weather })));
      setResultSource(payload.source);
    } catch (caughtError) {
      if (controller.signal.aborted) return;
      setError(caughtError instanceof Error ? caughtError.message : "Outfits could not be generated. Try again.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsGenerating(false);
      }
    }
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
            Pick the brief. Only your items&apos; tags go to the stylist, never your photos, and every look uses pieces you own.
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

          <label htmlFor={styleNoteId} className="mt-5 block">
            <span className="section-label">Style vibe <span className="normal-case tracking-normal text-[var(--muted)]">(optional)</span></span>
            <input
              id={styleNoteId}
              value={styleNote}
              maxLength={200}
              onChange={(event) => setStyleNote(event.target.value)}
              placeholder="e.g. relaxed, monochrome, linen"
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2.5 text-[10px] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)] focus:bg-white focus:ring-2 focus:ring-[var(--selection)]"
            />
          </label>

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
            onClick={() => void generateOutfits()}
            disabled={garments.length === 0 || isGenerating}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(38,69,255,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            {isGenerating ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? "Picking outfits" : "Pick my outfits"}
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
          ) : error ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-[18px] border border-[#d8968f] bg-[#fae8e5] px-4 py-3 text-[10px] leading-5 text-[#87362f] sm:flex-row sm:items-center sm:justify-between">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void generateOutfits()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#d8968f] bg-white/70 px-3 py-1.5 font-semibold transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#87362f]"
              >
                <RotateCcw size={12} /> Try again
              </button>
            </div>
          ) : outfits.length > 0 ? (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="section-label">Picked from {garments.length} owned pieces</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                    {outfits.length === 1 ? "Your outfit edit" : `Your ${outfits.length === 2 ? "two" : "three"} outfit edits`}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {resultSource && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[var(--selection)] px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
                      <Sparkles size={11} /> {SOURCE_LABELS[resultSource]}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 rounded-full bg-[#e2efe2] px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#315d3b]">
                    <Check size={11} /> Closet-only results
                  </span>
                </div>
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
                  {garments.length > 0 ? "Your closet is ready to remix" : "Add a few pieces first"}
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                  {garments.length > 0
                    ? "Choose an occasion and weather, then pick up to three combinations made only from your saved pieces."
                    : "Style Me never invents products. It needs clothing in your Digital Closet, not only inspiration pins."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

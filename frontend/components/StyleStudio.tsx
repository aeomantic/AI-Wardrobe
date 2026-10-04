import { ArrowRight, Palette, Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import { colorToCss, humanizeKey } from "@/lib/outfit";
import type { GarmentBox } from "@/types/outfit";

interface StyleStudioProps {
  overallVibe: string;
  styleBreakdown: Record<string, string>;
  suggestions: Array<Record<string, string>>;
  garments: GarmentBox[];
  focusGarment?: GarmentBox;
}

const TITLE_KEYS = ["title", "name", "variation", "look"];
const DESCRIPTION_KEYS = [
  "description",
  "styling_notes",
  "recipe",
  "outfit_formula",
  "pieces",
  "recommendation",
  "vibe",
];
const DETAIL_PRIORITY = ["keep", "add", "swap", "anchor_piece", "color_direction", "why_it_works"];

function firstValue(record: Record<string, string>, keys: string[], fallback: string) {
  const key = keys.find((candidate) => record[candidate]);
  return { key, value: key ? record[key] : fallback };
}

export function StyleStudio({
  overallVibe,
  styleBreakdown,
  suggestions,
  garments,
  focusGarment,
}: StyleStudioProps) {
  const palette = garments.reduce<Array<{ name: string; css: string }>>((colors, garment) => {
    const css = colorToCss(garment.color);
    if (!colors.some((color) => color.css === css)) colors.push({ name: garment.color, css });
    return colors;
  }, []);

  return (
    <section id="style-studio" className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_18px_60px_rgba(31,29,23,0.08)]" aria-labelledby="style-studio-title">
      <div className="border-b border-[var(--line)] p-5">
        <div className="flex items-center justify-between">
          <p className="section-label">AI Outfit Builder</p>
          <span className="grid size-8 place-items-center rounded-full bg-[var(--selection)] text-[var(--accent)]">
            <Sparkles size={15} />
          </span>
        </div>
        <h2 id="style-studio-title" className="mt-4 text-[26px] font-semibold leading-[1.02] tracking-[-0.045em]">{overallVibe}</h2>
        {focusGarment && (
          <p className="mt-3 flex items-center gap-2 text-[11px] leading-5 text-[var(--muted)]">
            <span className="size-1.5 rounded-full bg-[var(--accent)]" /> Building around {focusGarment.label.toLowerCase()}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-3">
          <div className="flex items-center gap-2">
            <Palette size={14} className="text-[var(--muted)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Detected palette</span>
          </div>
          <div className="flex -space-x-1.5">
            {palette.slice(0, 6).map((color) => (
              <span
                key={`${color.name}-${color.css}`}
                className="size-7 rounded-full border-2 border-[var(--panel)] shadow-sm"
                style={{ backgroundColor: color.css }}
                title={color.name}
                aria-label={color.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--line)] p-5">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal size={13} />
          <p className="section-label">Aesthetic breakdown</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Object.entries(styleBreakdown).map(([key, value]) => (
            <div key={key} className="border-t border-[var(--line)] pt-2.5">
              <dt className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-[var(--muted)]">{humanizeKey(key)}</dt>
              <dd className="mt-1 text-[11px] font-medium leading-4">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="section-label">Complete or rebuild</p>
          <span className="font-mono text-[9px] text-[var(--muted)]">{String(suggestions.length).padStart(2, "0")} RECIPES</span>
        </div>

        <div className="space-y-2.5">
          {suggestions.map((suggestion, index) => {
            const title = firstValue(suggestion, TITLE_KEYS, `Variation ${index + 1}`);
            const description = firstValue(suggestion, DESCRIPTION_KEYS, "Build a complementary look from the detected pieces.");
            const hiddenKeys = new Set([title.key, description.key, ...TITLE_KEYS, ...DESCRIPTION_KEYS].filter(Boolean));
            const details = Object.entries(suggestion)
              .filter(([key, value]) => !hiddenKeys.has(key) && value)
              .sort(([left], [right]) => {
                const leftRank = DETAIL_PRIORITY.indexOf(left);
                const rightRank = DETAIL_PRIORITY.indexOf(right);
                return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
              })
              .slice(0, 5);

            return (
              <article
                key={`${title.value}-${index}`}
                className={`group rounded-[18px] border p-4 transition-transform duration-200 hover:-translate-y-0.5 ${
                  index === 0
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]"
                    : "border-[var(--line)] bg-[var(--canvas)]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`font-mono text-[8px] font-bold uppercase tracking-[0.16em] ${index === 0 ? "text-white/45" : "text-[var(--muted)]"}`}>
                      Look {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.025em]">{title.value}</h3>
                  </div>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full ${index === 0 ? "bg-white/10" : "bg-[var(--panel)]"}`}>
                    {index === 0 ? <ArrowRight size={13} /> : <Plus size={13} />}
                  </span>
                </div>
                <p className={`mt-2.5 text-[11px] leading-[1.55] ${index === 0 ? "text-white/62" : "text-[var(--muted)]"}`}>{description.value}</p>
                {details.length > 0 && (
                  <div className={`mt-3 border-t pt-3 ${index === 0 ? "border-white/10" : "border-[var(--line)]"}`}>
                    {details.map(([key, value]) => (
                      <p key={key} className="mb-1 text-[9px] leading-4 last:mb-0">
                        <span className={index === 0 ? "text-white/40" : "text-[var(--muted)]"}>{humanizeKey(key)}:</span> {value}
                      </p>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

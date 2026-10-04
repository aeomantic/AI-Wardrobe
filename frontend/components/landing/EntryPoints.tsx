import Link from "next/link";
import {
  ArrowRight,
  CloudSun,
  ScanLine,
  Shirt,
  Sparkles,
} from "lucide-react";

export function EntryPoints() {
  return (
    <section className="bg-[var(--canvas)]" aria-labelledby="choose-path-title">
      <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 sm:py-24 lg:px-10 xl:px-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Choose your starting point</p>
            <h2 id="choose-path-title" className="mt-4 max-w-xl text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl">
              What do you want to style today?
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[var(--muted)]">
            Both paths stay connected, so every analyzed look can inspire what you build from your own wardrobe.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Link
            href="/inspector"
            className="group relative min-h-[380px] overflow-hidden rounded-[30px] bg-[var(--ink)] p-7 text-[#f3f0e8] shadow-[0_24px_70px_rgba(25,25,23,0.15)] transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] sm:p-9"
          >
            <div aria-hidden="true" className="absolute -right-20 -top-20 size-72 rounded-full border border-white/10" />
            <div aria-hidden="true" className="absolute -right-8 -top-8 size-44 rounded-full border border-white/10" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-2xl bg-white/10">
                  <ScanLine aria-hidden="true" size={21} />
                </span>
                <span className="grid size-11 place-items-center rounded-full border border-white/20 transition group-hover:translate-x-1 group-hover:bg-white group-hover:text-[var(--ink)]">
                  <ArrowRight aria-hidden="true" size={18} />
                </span>
              </div>
              <div className="mt-auto pt-24">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">Outfit Inspector</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Analyze a Look</h3>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/60 sm:text-base sm:leading-7">
                  Upload a reference photo and see every jacket, top, bottom, shoe, and accessory mapped in seconds.
                </p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {["Garment detection", "Color + material", "Style breakdown"].map((label) => (
                    <span key={label} className="rounded-full border border-white/15 px-3 py-1.5 text-[9px] text-white/65">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>

          <Link
            href="/wardrobe"
            className="group relative min-h-[380px] overflow-hidden rounded-[30px] bg-[var(--accent)] p-7 text-white shadow-[0_24px_70px_rgba(38,69,255,0.18)] transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)] sm:p-9"
          >
            <div aria-hidden="true" className="absolute right-0 top-0 grid h-52 w-52 grid-cols-3 gap-2 p-6 opacity-20">
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={index} className="rounded-lg border border-white/60" />
              ))}
            </div>
            <div className="relative flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-2xl bg-white/15">
                  <Shirt aria-hidden="true" size={21} />
                </span>
                <span className="grid size-11 place-items-center rounded-full border border-white/25 transition group-hover:translate-x-1 group-hover:bg-white group-hover:text-[var(--accent)]">
                  <ArrowRight aria-hidden="true" size={18} />
                </span>
              </div>
              <div className="mt-auto pt-24">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Digital Closet + AI Builder</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Open My Closet</h3>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                  Organize what you own, then generate complete outfits for your occasion and the weather outside.
                </p>
                <div className="mt-7 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[9px] text-white/75">
                    <Sparkles aria-hidden="true" size={11} /> Auto-tagged closet
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[9px] text-white/75">
                    <CloudSun aria-hidden="true" size={11} /> Weather-aware looks
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-[var(--line)] pt-5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Threadline · Your style, made usable</p>
          <p>No shopping feed · No catalog noise · Just your wardrobe</p>
        </div>
      </div>
    </section>
  );
}

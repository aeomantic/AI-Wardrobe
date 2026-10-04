import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  ScanLine,
  Shirt,
  Sparkles,
} from "lucide-react";

const proofPoints = [
  "Understand every piece",
  "Save what you own",
  "Build outfits in seconds",
];

export function Hero() {
  return (
    <section className="relative isolate border-b border-[var(--line)]" aria-labelledby="hero-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-44 -top-44 size-[34rem] rounded-full bg-[var(--selection)]/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 bottom-0 h-56 w-56 rounded-full bg-[#e6d5b8]/50 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(400px,0.78fr)] lg:gap-14 lg:px-10 lg:py-16 xl:px-16 xl:py-20">
        <div className="max-w-[780px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--muted)] shadow-[0_8px_30px_rgba(25,25,23,0.04)]">
            <Sparkles aria-hidden="true" size={13} className="text-[var(--accent)]" />
            Your personal AI wardrobe studio
          </div>

          <h1
            id="hero-title"
            className="text-[clamp(3.15rem,5.8vw,6.2rem)] font-semibold leading-[0.88] tracking-[-0.074em]"
          >
            Digitize your wardrobe. Analyze any look. Let AI build your outfits.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg sm:leading-8">
            Turn inspiration photos and the clothes you already own into a wardrobe that understands your style, then get complete looks made just for you.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/inspector"
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-[#f3f0e8] shadow-[0_16px_40px_rgba(25,25,23,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(25,25,23,0.2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              <ScanLine aria-hidden="true" size={17} />
              Analyze a Look
              <ArrowRight aria-hidden="true" size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/wardrobe"
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-6 py-3 text-sm font-semibold shadow-[0_10px_30px_rgba(25,25,23,0.04)] transition hover:-translate-y-0.5 hover:border-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              <Shirt aria-hidden="true" size={17} />
              Open My Closet
              <ArrowRight aria-hidden="true" size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2" aria-label="Product benefits">
            {proofPoints.map((point) => (
              <li key={point} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <CircleCheck aria-hidden="true" size={14} className="text-[#49714c]" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[540px] lg:mx-0 lg:justify-self-end">
      <div
        aria-hidden="true"
        className="absolute -inset-5 -z-10 rounded-[42px] border border-[var(--line)] bg-[var(--panel)]/50"
      />
      <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[var(--ink)] p-3 shadow-[0_34px_90px_rgba(25,25,23,0.25)] sm:p-4">
        <div className="flex items-center justify-between px-2 pb-3 pt-1 text-[#f3f0e8]">
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-white/50">Live outfit read</p>
            <p className="mt-1 text-sm font-semibold tracking-[-0.02em]">Soft utility minimalism</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em]">
            <span className="size-1.5 rounded-full bg-[#91e68d]" />
            5 pieces found
          </div>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-[#dad5ca]">
          <Image
            src="/demo-outfit.png"
            alt="Outfit analysis preview with individual garments identified"
            fill
            priority
            sizes="(min-width: 1024px) 42vw, (min-width: 640px) 540px, 92vw"
            className="object-cover object-[center_38%]"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/5" />

          <PreviewBox className="left-[25%] top-[16%] h-[35%] w-[52%]" label="01 / Outerwear" />
          <PreviewBox className="left-[31%] top-[49%] h-[35%] w-[43%]" label="02 / Bottom" align="right" />
          <PreviewBox className="left-[30%] top-[84%] h-[9%] w-[48%]" label="03 / Footwear" />

          <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2 sm:inset-x-4 sm:bottom-4">
            {[
              ["Palette", "Oat / charcoal"],
              ["Silhouette", "Relaxed"],
              ["Style", "Quiet utility"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/15 bg-[#171714]/80 p-2.5 text-white backdrop-blur-md sm:p-3">
                <p className="font-mono text-[7px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</p>
                <p className="mt-1 truncate text-[9px] font-semibold sm:text-[10px]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -left-5 top-[22%] hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[0_18px_50px_rgba(25,25,23,0.14)] sm:block lg:-left-12">
        <p className="font-mono text-[7px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">AI found</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="size-8 rounded-lg bg-[#d7c8ad]" />
          <div>
            <p className="text-[10px] font-semibold">Oatmeal overshirt</p>
            <p className="mt-0.5 text-[8px] text-[var(--muted)]">Linen blend · relaxed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBox({
  className,
  label,
  align = "left",
}: {
  className: string;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <div aria-hidden="true" className={`absolute border border-white/75 ${className}`}>
      <span
        className={`absolute -top-5 whitespace-nowrap rounded bg-white px-1.5 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.09em] text-[var(--ink)] ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {label}
      </span>
      <span className="absolute -left-0.5 -top-0.5 size-1.5 bg-white" />
      <span className="absolute -right-0.5 -top-0.5 size-1.5 bg-white" />
      <span className="absolute -bottom-0.5 -left-0.5 size-1.5 bg-white" />
      <span className="absolute -bottom-0.5 -right-0.5 size-1.5 bg-white" />
    </div>
  );
}

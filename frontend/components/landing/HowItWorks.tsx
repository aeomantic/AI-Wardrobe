import {
  ArrowDown,
  CloudUpload,
  Layers3,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Step = {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
  detail: string;
};

const steps: Step[] = [
  {
    number: "01",
    title: "Upload inspiration",
    description: "Drop in a look you love. Threadline identifies each garment, color, texture, and silhouette.",
    icon: CloudUpload,
    detail: "Photo or video",
  },
  {
    number: "02",
    title: "Digitize your closet",
    description: "Add the pieces you own once. AI cleans each photo and tags it into a searchable wardrobe.",
    icon: Layers3,
    detail: "Your clothes, organized",
  },
  {
    number: "03",
    title: "Get AI-generated outfits",
    description: "Choose the occasion and weather, then get complete looks made only from your own closet.",
    icon: Sparkles,
    detail: "Three ready-to-wear looks",
  },
];

export function HowItWorks() {
  return (
    <section className="border-b border-[var(--line)] bg-[var(--panel)]" aria-labelledby="how-it-works-title">
      <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 sm:py-24 lg:px-10 xl:px-16">
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="section-label">How it works</p>
            <h2 id="how-it-works-title" className="mt-4 max-w-md text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl">
              From scattered pieces to a closet that thinks with you.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)] lg:justify-self-end lg:text-base lg:leading-7">
            Start from either side: decode a look that inspires you, or build your digital closet first. They meet in one simple outfit builder.
          </p>
        </div>

        <ol className="mt-12 grid gap-3 lg:grid-cols-3" aria-label="Three steps to use Threadline">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.number}
                className="group relative min-h-[280px] overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--canvas)] p-6 transition hover:-translate-y-1 hover:border-[var(--line-strong)] hover:shadow-[0_22px_60px_rgba(25,25,23,0.08)] sm:p-7"
              >
                <div aria-hidden="true" className="absolute -right-6 -top-8 font-mono text-[8rem] font-bold leading-none tracking-[-0.12em] text-[var(--ink)]/[0.035]">
                  {step.number}
                </div>
                <div className="relative flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[var(--ink)] text-[#f3f0e8]">
                    <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                  </span>
                  <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--muted)]">STEP {step.number}</span>
                </div>
                <div className="relative mt-14">
                  <h3 className="text-xl font-semibold tracking-[-0.035em]">{step.title}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">{step.description}</p>
                  <p className="mt-5 inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {step.detail}
                  </p>
                </div>
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-5 right-5 grid size-8 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] lg:hidden"
                  >
                    <ArrowDown size={14} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

import { EntryPoints } from "@/components/landing/EntryPoints";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";

export default function Home() {
  return (
    <main className="overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <Hero />
      <HowItWorks />
      <EntryPoints />
    </main>
  );
}

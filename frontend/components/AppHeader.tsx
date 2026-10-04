"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Aperture, Home, ScanLine, Shirt, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inspector", label: "Inspector", icon: ScanLine },
  { href: "/wardrobe", label: "My Closet", icon: Shirt },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--canvas)]/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          aria-label="Threadline home"
        >
          <span className="grid size-9 place-items-center rounded-full bg-[var(--ink)] text-[#f3f0e8] transition-transform duration-300 group-hover:rotate-12">
            <Aperture size={17} strokeWidth={1.8} />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-bold tracking-[-0.03em]">THREADLINE</span>
            <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Your wardrobe, understood
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="flex items-center rounded-full border border-[var(--line)] bg-[var(--panel)] p-1 shadow-sm">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:px-3.5 sm:text-xs ${
                  active
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/inspector"
          className="hidden min-h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-[11px] font-semibold text-white shadow-[0_8px_24px_rgba(38,69,255,0.24)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 md:flex"
        >
          <Sparkles size={13} aria-hidden="true" />
          Analyze a look
        </Link>
      </div>
    </header>
  );
}

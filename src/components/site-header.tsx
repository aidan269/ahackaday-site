import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-800/90 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.09),transparent_35%)]">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6">
        <div className="space-y-0.5">
          <Link href="/" className="pulse-dot text-sm font-semibold tracking-wide text-zinc-100">
            AHackaday
          </Link>
          <p className="text-xs text-zinc-400">
            Incident intelligence for teams that move fast.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <nav className="flex items-center gap-1 text-xs">
            <Link
              href="/"
              className="micro-lift glow-focus rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            >
              Feed
            </Link>
            <Link
              href="/calendar"
              className="micro-lift glow-focus rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            >
              Calendar
            </Link>
            <Link
              href="/feed.xml"
              className="micro-lift glow-focus rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            >
              RSS
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

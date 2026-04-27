"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileDock() {
  const pathname = usePathname();

  const isFeed = pathname === "/";
  const isCalendar = pathname === "/calendar";
  const isSaved = pathname === "/saved";

  return (
    <nav className="mobile-dock" aria-label="Mobile app navigation">
      <Link href="/" className={`mobile-dock__item ${isFeed ? "is-active" : ""}`}>feed</Link>
      <Link href="/?exploited=1&layout=card" className="mobile-dock__item">live</Link>
      <Link href="/calendar" className={`mobile-dock__item ${isCalendar ? "is-active" : ""}`}>calendar</Link>
      <Link href="/saved" className={`mobile-dock__item ${isSaved ? "is-active" : ""}`}>saved</Link>
    </nav>
  );
}

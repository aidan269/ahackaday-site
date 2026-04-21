"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileDock() {
  const pathname = usePathname();

  const isFeed = pathname === "/";
  const isLive = false;
  const isCalendar = pathname === "/calendar";
  const isRss = pathname === "/feed.xml";

  return (
    <nav className="mobile-dock" aria-label="Mobile app navigation">
      <Link href="/" className={`mobile-dock__item ${isFeed ? "is-active" : ""}`}>feed</Link>
      <Link href="/?severity=critical" className={`mobile-dock__item ${isLive ? "is-active" : ""}`}>live</Link>
      <Link href="/calendar" className={`mobile-dock__item ${isCalendar ? "is-active" : ""}`}>calendar</Link>
      <Link href="/feed.xml" className={`mobile-dock__item ${isRss ? "is-active" : ""}`}>saved</Link>
    </nav>
  );
}

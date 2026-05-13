"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useEmotionalPreferencesOptional } from "@/components/emotional-preferences-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function MobileDock() {
  const pathname = usePathname();
  const prefs = useEmotionalPreferencesOptional();
  const userEmail = prefs?.userEmail ?? null;
  const [unreadCount, setUnreadCount] = useState(0);

  const isFeed = pathname === "/";
  const isCalendar = pathname === "/calendar";
  const isSaved = pathname === "/saved";
  const isMessages = pathname.startsWith("/messages");

  useEffect(() => {
    if (!userEmail) {
      queueMicrotask(() => setUnreadCount(0));
      return;
    }
    let active = true;
    void (async () => {
      const token = await getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
      if (!token) return;
      const res = await fetch("/api/messages/threads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; unreadCount?: number } | null;
      if (active && res.ok && json?.ok) setUnreadCount(json.unreadCount ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [userEmail, pathname]);

  return (
    <nav className="mobile-dock" aria-label="Mobile app navigation">
      <Link href="/" className={`mobile-dock__item ${isFeed ? "is-active" : ""}`}>feed</Link>
      <Link href="/?exploited=1&layout=card" className="mobile-dock__item">live</Link>
      <Link href="/calendar" className={`mobile-dock__item ${isCalendar ? "is-active" : ""}`}>calendar</Link>
      <Link href="/saved" className={`mobile-dock__item ${isSaved ? "is-active" : ""}`}>saved</Link>
      <Link href="/messages" className={`mobile-dock__item ${isMessages ? "is-active" : ""}`}>
        {unreadCount > 0 ? `dm ${unreadCount}` : "dm"}
      </Link>
    </nav>
  );
}

"use client";

import { useEffect } from "react";

import { useEmotionalPreferences } from "@/components/emotional-preferences-provider";

export function MarkReadOnMount({ slug }: { slug: string }) {
  const { markRead } = useEmotionalPreferences();

  useEffect(() => {
    markRead(slug);
  }, [slug, markRead]);

  return null;
}

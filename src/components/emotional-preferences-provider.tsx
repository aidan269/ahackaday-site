"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  loadReadSet,
  loadReviewCount,
  loadSavedSet,
  persistReadSet,
  persistReviewCount,
  persistSavedSet,
} from "@/lib/emotional-storage";

type EmotionalPreferencesValue = {
  readSet: Set<string>;
  savedSet: Set<string>;
  reviewCount: number;
  savedCount: number;
  markRead: (slug: string) => void;
  toggleSaved: (slug: string) => void;
  isRead: (slug: string) => boolean;
  isSaved: (slug: string) => boolean;
};

const EmotionalPreferencesContext = createContext<EmotionalPreferencesValue | null>(null);

export function EmotionalPreferencesProvider({ children }: { children: ReactNode }) {
  const [readSet, setReadSet] = useState<Set<string>>(() => new Set());
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    setReadSet(loadReadSet());
    setSavedSet(loadSavedSet());
    setReviewCount(loadReviewCount());
  }, []);

  const markRead = useCallback((slug: string) => {
    setReadSet((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      persistReadSet(next);
      queueMicrotask(() => {
        setReviewCount((c) => {
          const n = c + 1;
          persistReviewCount(n);
          return n;
        });
      });
      return next;
    });
  }, []);

  const toggleSaved = useCallback((slug: string) => {
    setSavedSet((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      persistSavedSet(next);
      return next;
    });
  }, []);

  const isRead = useCallback((slug: string) => readSet.has(slug), [readSet]);
  const isSaved = useCallback((slug: string) => savedSet.has(slug), [savedSet]);

  const value = useMemo<EmotionalPreferencesValue>(
    () => ({
      readSet,
      savedSet,
      reviewCount,
      savedCount: savedSet.size,
      markRead,
      toggleSaved,
      isRead,
      isSaved,
    }),
    [readSet, savedSet, reviewCount, markRead, toggleSaved, isRead, isSaved],
  );

  return (
    <EmotionalPreferencesContext.Provider value={value}>{children}</EmotionalPreferencesContext.Provider>
  );
}

export function useEmotionalPreferences(): EmotionalPreferencesValue {
  const ctx = useContext(EmotionalPreferencesContext);
  if (!ctx) {
    throw new Error("useEmotionalPreferences must be used within EmotionalPreferencesProvider");
  }
  return ctx;
}

/** Safe for optional UI (e.g. static pages) without provider — no-ops. */
export function useEmotionalPreferencesOptional(): EmotionalPreferencesValue | null {
  return useContext(EmotionalPreferencesContext);
}

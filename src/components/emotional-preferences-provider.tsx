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
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type EmotionalPreferencesValue = {
  readSet: Set<string>;
  savedSet: Set<string>;
  reviewCount: number;
  savedCount: number;
  markRead: (slug: string) => void;
  toggleSaved: (slug: string) => void;
  isRead: (slug: string) => boolean;
  isSaved: (slug: string) => boolean;
  userEmail: string | null;
  isAuthReady: boolean;
  requestLogin: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const EmotionalPreferencesContext = createContext<EmotionalPreferencesValue | null>(null);

export function EmotionalPreferencesProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const [readSet, setReadSet] = useState<Set<string>>(() => new Set());
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());
  const [reviewCount, setReviewCount] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    setReadSet(loadReadSet());
    setSavedSet(loadSavedSet());
    setReviewCount(loadReviewCount());
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserEmail(data.session?.user?.email ?? null);
      setUserId(data.session?.user?.id ?? null);
      setIsAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
      setUserId(session?.user?.id ?? null);
      setIsAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !userId) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("user_saved_incidents")
        .select("incident_slug")
        .eq("user_id", userId);
      if (error || !active || !data) return;
      const remoteSet = new Set(
        data
          .map((row) => row.incident_slug)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      );
      setSavedSet((prev) => {
        const merged = new Set([...prev, ...remoteSet]);
        persistSavedSet(merged);
        return merged;
      });
      const missingRemote = [...loadSavedSet()].filter((slug) => !remoteSet.has(slug));
      if (missingRemote.length > 0) {
        await supabase
          .from("user_saved_incidents")
          .upsert(
            missingRemote.map((incidentSlug) => ({ user_id: userId, incident_slug: incidentSlug })),
            { onConflict: "user_id,incident_slug" },
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  const syncRemoteSaved = useCallback(
    async (slug: string, shouldSave: boolean) => {
      if (!supabase || !userId) return;
      if (shouldSave) {
        await supabase
          .from("user_saved_incidents")
          .upsert({ user_id: userId, incident_slug: slug }, { onConflict: "user_id,incident_slug" });
      } else {
        await supabase.from("user_saved_incidents").delete().eq("user_id", userId).eq("incident_slug", slug);
      }
    },
    [supabase, userId],
  );

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
      const shouldSave = !next.has(slug);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      persistSavedSet(next);
      void syncRemoteSaved(slug, shouldSave);
      return next;
    });
  }, [syncRemoteSaved]);

  const requestLogin = useCallback(async (email: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: "Supabase public auth env is not configured." };
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { ok: false, error: "Please enter an email address." };
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

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
      userEmail,
      isAuthReady,
      requestLogin,
      signOut,
    }),
    [readSet, savedSet, reviewCount, markRead, toggleSaved, isRead, isSaved, userEmail, isAuthReady, requestLogin, signOut],
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

"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type DigestRow = {
  week_start: string;
  pages_scored: number;
  avg_score: number;
  delta_vs_prev_week: number | null;
  top_patterns: unknown;
  topic_queue: unknown;
  created_at: string;
};

async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function DigestAdminClient({ weekStart }: { weekStart: string }) {
  const [digest, setDigest] = useState<DigestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError("Sign in required.");
      setDigest(null);
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/aeo/digest/view?week_start=${encodeURIComponent(weekStart)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; digest: DigestRow }
      | { ok: false; error?: string }
      | null;
    if (!res.ok || !json || !json.ok) {
      setError((json && "error" in json && json.error) || "Could not load digest.");
      setDigest(null);
    } else {
      setDigest(json.digest);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const patterns = Array.isArray(digest?.top_patterns)
    ? (digest!.top_patterns as string[])
    : [];
  const topics = Array.isArray(digest?.topic_queue) ? (digest!.topic_queue as Record<string, string>[]) : [];

  return (
    <div className="methodology-page__inner">
      <h1 className="detail__title">Weekly AEO digest</h1>
      <p className="detail__lead">Week of {weekStart} (UTC Monday)</p>
      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: "var(--sev-crit, #c00)" }}>{error}</p> : null}
      {digest && !loading ? (
        <>
          <p>
            <strong>Pages scored:</strong> {digest.pages_scored} · <strong>Avg score:</strong> {digest.avg_score}
            {digest.delta_vs_prev_week != null ? (
              <>
                {" "}
                · <strong>Δ vs prior week:</strong> {digest.delta_vs_prev_week >= 0 ? "+" : ""}
                {digest.delta_vs_prev_week}
              </>
            ) : null}
          </p>
          <section className="methodology-page__section">
            <h2>Top patterns</h2>
            <ul>
              {patterns.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
          <section className="methodology-page__section">
            <h2>Topic queue</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {topics.map((t, i) => (
                <li key={i} style={{ marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                  <strong>{t.target_query}</strong>
                  <div style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 6 }}>{t.draft_tldr_40w}</div>
                  <button
                    type="button"
                    className="btn-quiet"
                    style={{ marginTop: 8 }}
                    onClick={() => void navigator.clipboard.writeText(`${t.draft_h1}\n\n${t.draft_tldr_40w}`)}
                  >
                    copy H1 + TL;DR
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

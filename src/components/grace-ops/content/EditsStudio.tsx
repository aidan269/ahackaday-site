"use client";

import { useCallback, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

import type { AeoRecommendationRow } from "../types";

async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function EditsStudio({
  recommendations,
}: {
  recommendations: AeoRecommendationRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState<Set<number>>(new Set());
  const visible = useMemo(() => {
    const active = recommendations.filter((r) => !r.dismissed && !dismissedLocal.has(r.id));
    return expanded ? active : active.slice(0, 3);
  }, [recommendations, expanded, dismissedLocal]);

  const allActive = useMemo(
    () => recommendations.filter((r) => !r.dismissed && !dismissedLocal.has(r.id)),
    [recommendations, dismissedLocal],
  );

  const copyRewrite = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }, []);

  const copyAllMarkdown = useCallback(async () => {
    const md = allActive
      .map((r, i) => `### ${i + 1}. ${r.issue}\n\n${r.suggested_rewrite}\n`)
      .join("\n");
    await copyRewrite(md);
  }, [allActive, copyRewrite]);

  const onDismiss = useCallback(async (id: number) => {
    const token = await getAccessToken();
    if (!token) {
      window.alert("Sign in required to dismiss recommendations.");
      return;
    }
    const res = await fetch(`/api/aeo/recommendations/${id}/dismiss`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) {
      setDismissedLocal((s) => new Set(s).add(id));
    } else {
      const j = await res.json().catch(() => ({}));
      window.alert((j as { error?: string }).error || "Dismiss failed");
    }
  }, []);

  if (allActive.length === 0) {
    return <p className="ops__content-empty">No open recommendations.</p>;
  }

  return (
    <div className="content-edits">
      <div className="content-rec-grid">
        {visible.map((rec) => (
          <article key={rec.id} className="content-rec-card">
            <header className="content-rec-card__hd">
              <span className="content-rec-pill">EDIT · DRAFT</span>
            </header>
            <div className="content-rec-card__issue"><strong>Issue:</strong> {rec.issue}</div>
            <div className="content-rec-block">
              <span className="content-rec-label">Current text</span>
              <pre className="content-rec-pre">{rec.current_text}</pre>
            </div>
            <div className="content-rec-block">
              <span className="content-rec-label">Suggested rewrite</span>
              <pre className="content-rec-pre">{rec.suggested_rewrite}</pre>
            </div>
            <p className="content-rec-why">{rec.why_it_helps}</p>
            <div className="content-rec-actions">
              <button type="button" className="btn-quiet" onClick={() => void copyRewrite(rec.suggested_rewrite)}>copy</button>
              <button type="button" className="btn-primary" onClick={() => void onDismiss(rec.id)}>dismiss</button>
            </div>
          </article>
        ))}
      </div>
      {allActive.length > 3 ? (
        <button type="button" className="btn-quiet content-edits__more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "show fewer" : `show all (${allActive.length})`}
        </button>
      ) : null}
      <div className="content-edits__bulk">
        <button type="button" className="btn-quiet" onClick={() => void copyAllMarkdown()}>copy all</button>
      </div>
      <p className="content-rec-callout">
        <span>!</span>
        <span><b>Draft output:</b> validate and tune before production rollout.</span>
      </p>
    </div>
  );
}

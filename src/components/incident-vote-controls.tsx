"use client";

import { useEffect, useMemo, useState } from "react";

import { useEmotionalPreferencesOptional } from "@/components/emotional-preferences-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type VoteState = {
  upvotes: number;
  downvotes: number;
  score: number;
  viewerVote: -1 | 1 | null;
};

export function IncidentVoteControls({
  incidentSlug,
  /** When true, use a stacked layout suited to the narrow feed card date column. */
  compact = false,
}: {
  incidentSlug: string;
  compact?: boolean;
}) {
  const prefs = useEmotionalPreferencesOptional();
  const userEmail = prefs?.userEmail ?? null;
  const [state, setState] = useState<VoteState>({
    upvotes: 0,
    downvotes: 0,
    score: 0,
    viewerVote: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadVotes() {
      setLoading(true);
      setError(null);
      try {
        const token = await getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        const res = await fetch(`/api/incident-votes/${encodeURIComponent(incidentSlug)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const body = (await res.json().catch(() => null)) as
          | ({ ok: true } & VoteState)
          | { ok: false; error?: string }
          | null;
        if (!active) return;
        if (!res.ok || !body || !body.ok) {
          setError((body && "error" in body && body.error) || "Could not load votes.");
          return;
        }
        setState({
          upvotes: body.upvotes,
          downvotes: body.downvotes,
          score: body.score,
          viewerVote: body.viewerVote,
        });
      } catch {
        if (!active) return;
        setError("Could not load votes.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadVotes();
    return () => {
      active = false;
    };
  }, [incidentSlug]);

  const statusLabel = useMemo(() => {
    if (loading) return "loading votes...";
    if (error) return error;
    return `${state.upvotes} up · ${state.downvotes} down`;
  }, [error, loading, state.downvotes, state.upvotes]);

  async function mutateVote(nextVote: -1 | 1 | null) {
    if (saving) return;
    const supabase = getSupabaseBrowserClient();
    const token = await supabase?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
    if (!token) {
      setError("Sign in to vote.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const method = nextVote === null ? "DELETE" : "POST";
      const res = await fetch(`/api/incident-votes/${encodeURIComponent(incidentSlug)}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(nextVote === null ? {} : { "Content-Type": "application/json" }),
        },
        body: nextVote === null ? undefined : JSON.stringify({ vote: nextVote }),
      });
      const body = (await res.json().catch(() => null)) as
        | ({ ok: true } & VoteState)
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !body || !body.ok) {
        setError((body && "error" in body && body.error) || "Vote failed.");
        return;
      }
      setState({
        upvotes: body.upvotes,
        downvotes: body.downvotes,
        score: body.score,
        viewerVote: body.viewerVote,
      });
    } catch {
      setError("Vote failed.");
    } finally {
      setSaving(false);
    }
  }

  const scoreStr = loading ? "…" : state.score >= 0 ? `+${state.score}` : String(state.score);
  const countsStr = error ? statusLabel : loading ? "…" : `${state.upvotes} up · ${state.downvotes} down`;

  return (
    <div
      className={[
        "vote-controls",
        "vote-controls--compact",
        compact ? "vote-controls--compact-narrow" : "vote-controls--compact-wide",
      ].join(" ")}
    >
      <div className="vote-controls__compact-btns">
        <button
          type="button"
          className={`vote-controls__btn${state.viewerVote === 1 ? " is-active is-up" : ""}`}
          onClick={() => void mutateVote(state.viewerVote === 1 ? null : 1)}
          disabled={saving || !userEmail}
          title={userEmail ? "Mark helpful" : "Sign in to vote"}
        >
          ▲
        </button>
        <button
          type="button"
          className={`vote-controls__btn${state.viewerVote === -1 ? " is-active is-down" : ""}`}
          onClick={() => void mutateVote(state.viewerVote === -1 ? null : -1)}
          disabled={saving || !userEmail}
          title={userEmail ? "Mark not helpful" : "Sign in to vote"}
        >
          ▼
        </button>
      </div>
      <div className="vote-controls__compact-meta" aria-label={statusLabel}>
        <span className="vote-controls__compact-scoreline">
          score <strong>{scoreStr}</strong>
        </span>
        <span className="vote-controls__compact-counts">{countsStr}</span>
      </div>
    </div>
  );
}

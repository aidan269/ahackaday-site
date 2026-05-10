"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const DEFAULT_THRESHOLD = 3;

export function IncidentTrackControls({
  incidentSlug,
  compact = false,
}: {
  incidentSlug: string;
  /** Shorter copy + tighter layout for the incident header toolbar. */
  compact?: boolean;
}) {
  const [following, setFollowing] = useState(false);
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const token = await getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        const res = await fetch(`/api/incident-follow/${encodeURIComponent(incidentSlug)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const body = (await res.json().catch(() => null)) as
          | { ok: true; following: boolean; mentionAlertThreshold: number | null }
          | null;
        if (!active || !body?.ok) return;
        setFollowing(body.following);
        if (body.mentionAlertThreshold != null && body.mentionAlertThreshold > 0) {
          setThreshold(body.mentionAlertThreshold);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [incidentSlug]);

  const persist = useCallback(
    async (nextFollow: boolean, nextThreshold: number) => {
      setSaving(true);
      try {
        const token = await getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) {
          alert("Sign in to track incidents.");
          return;
        }
        const res = await fetch(`/api/incident-follow/${encodeURIComponent(incidentSlug)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            follow: nextFollow,
            mentionAlertThreshold: nextFollow ? Math.max(1, Math.round(nextThreshold)) : null,
          }),
        });
        const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (!res.ok || !body?.ok) {
          alert("Could not update notifications.");
          return;
        }
        setFollowing(nextFollow);
      } finally {
        setSaving(false);
      }
    },
    [incidentSlug],
  );

  const th = Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold) : DEFAULT_THRESHOLD;

  return (
    <div
      className={["track-controls", "track-controls--pill", compact ? "track-controls--compact" : ""].filter(Boolean).join(" ")}
      aria-busy={saving}
    >
      <span className="track-controls__bell" aria-hidden>
        🔔
      </span>
      <button
        type="button"
        className={`track-controls__cta${following ? " is-on" : ""}`}
        disabled={loading || saving}
        onClick={() => void persist(!following, th)}
        title={
          following
            ? "Stop mention alerts for this incident"
            : compact
              ? `Notify when mentions ≥ ${th} (sign in)`
              : "Email when cross-platform mentions reach your threshold (requires sign-in)"
        }
      >
        {compact ? (following ? "On" : "Alert") : following ? "Stop alerts" : "Notify me when mentions"}
      </button>
      <span className="track-controls__ge" aria-hidden>
        ≥
      </span>
      <label className="track-controls__threshold-wrap">
        <span className="sr-only">Mention threshold</span>
        <input
          type="number"
          min={1}
          step={1}
          className="track-controls__threshold"
          value={th}
          disabled={loading || saving}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            setThreshold(Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD);
          }}
          onBlur={() => {
            if (following) void persist(true, th);
          }}
        />
      </label>
    </div>
  );
}

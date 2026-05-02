"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function IncidentTrackControls({ incidentSlug }: { incidentSlug: string }) {
  const [following, setFollowing] = useState(false);
  const [threshold, setThreshold] = useState<string>("");
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
        setThreshold(body.mentionAlertThreshold != null ? String(body.mentionAlertThreshold) : "");
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
    async (nextFollow: boolean, nextThreshold?: string) => {
      setSaving(true);
      try {
        const token = await getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) {
          alert("Sign in to track incidents.");
          return;
        }
        const parsed =
          nextThreshold === undefined || nextThreshold.trim() === ""
            ? null
            : Number.parseInt(nextThreshold, 10);
        const res = await fetch(`/api/incident-follow/${encodeURIComponent(incidentSlug)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            follow: nextFollow,
            mentionAlertThreshold: nextFollow ? parsed : null,
          }),
        });
        const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (!res.ok || !body?.ok) {
          alert("Could not update follow state.");
          return;
        }
        setFollowing(nextFollow);
      } finally {
        setSaving(false);
      }
    },
    [incidentSlug],
  );

  return (
    <div className="track-controls">
      <button
        type="button"
        className={`btn-quiet${following ? " is-on" : ""}`}
        disabled={loading || saving}
        onClick={() => void persist(!following, threshold)}
      >
        {following ? "tracking" : "track incident"}
      </button>
      <label className="track-controls__alert">
        <span className="k">alert ≥ mentions</span>
        <input
          type="number"
          min={0}
          placeholder="optional"
          value={threshold}
          disabled={!following || saving}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={() => following && void persist(true, threshold)}
        />
      </label>
    </div>
  );
}

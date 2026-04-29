"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useEmotionalPreferences } from "@/components/emotional-preferences-provider";

type SavedIncidentPreview = {
  slug: string;
  title: string;
  summary: string;
  severity: string;
  date: string;
};

export function SavedIncidentsView({ incidents }: { incidents: SavedIncidentPreview[] }) {
  const { savedSet, toggleSaved, userEmail, requestLogin, signOut, isAuthReady } = useEmotionalPreferences();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const savedIncidents = useMemo(() => incidents.filter((incident) => savedSet.has(incident.slug)), [incidents, savedSet]);

  async function onLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setStatus(null);
    const result = await requestLogin(email);
    if (result.ok) setStatus("Magic link sent. Open your email to complete sign in.");
    else setStatus(result.error ?? "Could not start sign in.");
    setSending(false);
  }

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Saved <span className="dim">for</span> <span className="accent">later</span>
            <span className="accent">.</span>
          </h1>
          <p className="page-sub">
            Save incidents while browsing. Sign in is optional, but it syncs your saved stories across devices.
          </p>
        </div>
      </div>

      <section className="detail__social" style={{ marginBottom: 20 }}>
        <h3>account</h3>
        {!isAuthReady ? (
          <p style={{ margin: 0, color: "var(--fg-2)" }}>Checking session…</p>
        ) : userEmail ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <p style={{ margin: 0, color: "var(--fg-2)" }}>Signed in as <strong style={{ color: "var(--fg)" }}>{userEmail}</strong></p>
            <button type="button" className="apply-btn" onClick={() => void signOut()}>sign out</button>
          </div>
        ) : (
          <form onSubmit={onLoginSubmit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              style={{ minWidth: 240 }}
              required
            />
            <button type="submit" className="apply-btn" disabled={sending}>{sending ? "sending..." : "send magic link"}</button>
          </form>
        )}
        {status && <p style={{ margin: "8px 0 0", color: "var(--fg-2)" }}>{status}</p>}
      </section>

      {savedIncidents.length === 0 ? (
        <p style={{ color: "var(--fg-2)", maxWidth: "56ch", lineHeight: 1.65 }}>
          No saved incidents yet. Tap the star on any incident card, then come back here.
        </p>
      ) : (
        <div className="feed--card">
          {savedIncidents.map((incident) => (
            <article key={incident.slug} className="card">
              <div className="card__main">
                <div className="card__tagline">
                  <span className={`sev-chip sev-${incident.severity}`}>{incident.severity}</span>
                  <span>{new Date(incident.date).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</span>
                </div>
                <h2 className="card__title">
                  <Link href={`/incident/${incident.slug}`}>{incident.title}</Link>
                </h2>
                <p className="card__sum">{incident.summary}</p>
                <button type="button" className="card__star is-on" onClick={() => toggleSaved(incident.slug)} aria-label="remove saved">
                  remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

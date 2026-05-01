"use client";

import { useEffect, useMemo, useState } from "react";

import { useEmotionalPreferencesOptional } from "@/components/emotional-preferences-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_handle: string;
  upvotes: number;
  downvotes: number;
  score: number;
  viewerVote: -1 | 1 | null;
  mine: boolean;
};

export function IncidentComments({ incidentSlug }: { incidentSlug: string }) {
  const prefs = useEmotionalPreferencesOptional();
  const userEmail = prefs?.userEmail ?? null;
  const requestLogin = prefs?.requestLogin;
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginStatus, setLoginStatus] = useState<string | null>(null);

  const totalComments = comments.length;

  async function getAccessToken(): Promise<string | null> {
    return getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null) ?? null;
  }

  async function loadComments() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setComments([]);
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/incident-comments/${encodeURIComponent(incidentSlug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; comments: CommentRow[] }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError((json && "error" in json && json.error) || "Could not load comments.");
        setComments([]);
      } else {
        setComments(json.comments);
      }
    } catch {
      setError("Could not load comments.");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadComments();
  }, [incidentSlug, userEmail]);

  async function onSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!userEmail || !body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Sign in to comment.");
        return;
      }
      const res = await fetch(`/api/incident-comments/${encodeURIComponent(incidentSlug)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: body.trim() }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; comment: CommentRow }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError((json && "error" in json && json.error) || "Could not post comment.");
        return;
      }
      setComments((prev) => [json.comment, ...prev]);
      setBody("");
    } catch {
      setError("Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function voteComment(commentId: string, nextVote: -1 | 1 | null) {
    const token = await getAccessToken();
    if (!token) {
      setError("Sign in to vote on comments.");
      return;
    }
    const endpoint = `/api/incident-comments/${encodeURIComponent(incidentSlug)}/${encodeURIComponent(commentId)}/vote`;
    const method = nextVote === null ? "DELETE" : "POST";
    const res = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(nextVote === null ? {} : { "Content-Type": "application/json" }),
      },
      body: nextVote === null ? undefined : JSON.stringify({ vote: nextVote }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(json?.error ?? "Vote failed.");
      return;
    }
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.id !== commentId) return comment;
        const before = comment.viewerVote;
        const upDelta =
          (before === 1 ? -1 : 0) + (nextVote === 1 ? 1 : 0);
        const downDelta =
          (before === -1 ? -1 : 0) + (nextVote === -1 ? 1 : 0);
        const upvotes = Math.max(0, comment.upvotes + upDelta);
        const downvotes = Math.max(0, comment.downvotes + downDelta);
        return {
          ...comment,
          upvotes,
          downvotes,
          score: upvotes - downvotes,
          viewerVote: nextVote,
        };
      }),
    );
  }

  async function onRequestLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!requestLogin) return;
    setLoginStatus(null);
    const result = await requestLogin(loginEmail);
    if (result.ok) setLoginStatus("Magic link sent. Open your email to sign in.");
    else setLoginStatus(result.error ?? "Could not start sign in.");
  }

  const commentHeader = useMemo(() => `${totalComments} comment${totalComments === 1 ? "" : "s"}`, [totalComments]);

  return (
    <section className="detail__comments">
      <h3>discussion</h3>
      <div className="detail__comments-meta">{commentHeader}</div>

      {!userEmail ? (
        <div className="detail__comments-auth">
          <p>Sign in to join the thread and vote on comments.</p>
          <form onSubmit={onRequestLogin}>
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
            <button type="submit" className="apply-btn">send magic link</button>
          </form>
          {loginStatus ? <p className="detail__comments-hint">{loginStatus}</p> : null}
        </div>
      ) : (
        <form onSubmit={onSubmitComment} className="detail__comments-form">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a comment..."
            minLength={2}
            maxLength={2000}
            required
          />
          <div className="detail__comments-form-row">
            <span className="detail__comments-hint">Posting as {userEmail}</span>
            <button type="submit" className="apply-btn" disabled={submitting || body.trim().length < 2}>
              {submitting ? "posting..." : "comment"}
            </button>
          </div>
        </form>
      )}

      {error ? <p className="detail__comments-error">{error}</p> : null}
      {loading ? (
        <p className="detail__comments-hint">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="detail__comments-hint">No comments yet.</p>
      ) : (
        <div className="detail__comments-list">
          {comments.map((comment) => (
            <article key={comment.id} className="detail__comment">
              <div className="vote-controls vote-controls--compact detail__comment-vote">
                <button
                  type="button"
                  className={`vote-controls__btn${comment.viewerVote === 1 ? " is-active is-up" : ""}`}
                  onClick={() => void voteComment(comment.id, comment.viewerVote === 1 ? null : 1)}
                  title="Upvote"
                >
                  ▲
                </button>
                <div className="vote-controls__compact-score">
                  {comment.score >= 0 ? `+${comment.score}` : comment.score}
                </div>
                <button
                  type="button"
                  className={`vote-controls__btn${comment.viewerVote === -1 ? " is-active is-down" : ""}`}
                  onClick={() => void voteComment(comment.id, comment.viewerVote === -1 ? null : -1)}
                  title="Downvote"
                >
                  ▼
                </button>
              </div>
              <div className="detail__comment-body">
                <div className="detail__comment-meta">
                  <span>{comment.author_handle}</span>
                  <span>·</span>
                  <span>{new Date(comment.created_at).toLocaleString()}</span>
                </div>
                <p>{comment.body}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

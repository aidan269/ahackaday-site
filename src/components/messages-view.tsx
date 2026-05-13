"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { useEmotionalPreferencesOptional } from "@/components/emotional-preferences-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type MessageProfile = {
  userId: string;
  handle: string;
  displayName: string | null;
};

type ThreadSummary = {
  id: string;
  otherUser: MessageProfile | null;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    mine: boolean;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
};

type MessageDetail = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  sender: MessageProfile | null;
};

type ThreadDetail = {
  id: string;
  otherUser: MessageProfile | null;
  lastMessageAt: string;
};

function displayName(profile: MessageProfile | null | undefined): string {
  if (!profile) return "unknown user";
  return profile.displayName || `@${profile.handle}`;
}

function relativeTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "recently";
  const delta = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (delta < 60) return "just now";
  const min = Math.floor(delta / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

async function getAccessToken(): Promise<string | null> {
  return getSupabaseBrowserClient()?.auth.getSession().then((r) => r.data.session?.access_token ?? null) ?? null;
}

export function MessagesView({ selectedThreadId }: { selectedThreadId?: string }) {
  const router = useRouter();
  const prefs = useEmotionalPreferencesOptional();
  const userEmail = prefs?.userEmail ?? null;
  const requestLogin = prefs?.requestLogin;
  const [loginEmail, setLoginEmail] = useState("");
  const [loginStatus, setLoginStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<MessageProfile | null>(null);
  const [handle, setHandle] = useState("");
  const [display, setDisplay] = useState("");
  const [recipient, setRecipient] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedThread = useMemo(
    () => threads.find((item) => item.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in to use messages.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, {
      ...init,
      headers,
    });
  }, []);

  const loadProfile = useCallback(async () => {
    const res = await authedFetch("/api/me/profile");
    const json = (await res.json().catch(() => null)) as
      | { ok: true; profile: MessageProfile | null }
      | { ok: false; error?: string }
      | null;
    if (!res.ok || !json || !json.ok) throw new Error((json && "error" in json && json.error) || "Could not load profile.");
    setProfile(json.profile);
    setHandle(json.profile?.handle ?? "");
    setDisplay(json.profile?.displayName ?? "");
  }, [authedFetch]);

  const loadThreads = useCallback(async () => {
    const res = await authedFetch("/api/messages/threads");
    const json = (await res.json().catch(() => null)) as
      | { ok: true; threads: ThreadSummary[] }
      | { ok: false; error?: string }
      | null;
    if (!res.ok || !json || !json.ok) throw new Error((json && "error" in json && json.error) || "Could not load inbox.");
    setThreads(json.threads);
  }, [authedFetch]);

  const loadThread = useCallback(async (threadId: string) => {
    const res = await authedFetch(`/api/messages/threads/${encodeURIComponent(threadId)}`);
    const json = (await res.json().catch(() => null)) as
      | { ok: true; thread: ThreadDetail; messages: MessageDetail[] }
      | { ok: false; error?: string }
      | null;
    if (!res.ok || !json || !json.ok) throw new Error((json && "error" in json && json.error) || "Could not load conversation.");
    setThread(json.thread);
    setMessages(json.messages);
    await authedFetch(`/api/messages/threads/${encodeURIComponent(threadId)}/read`, { method: "POST" }).catch(() => null);
    setThreads((prev) => prev.map((item) => (item.id === threadId ? { ...item, unreadCount: 0 } : item)));
  }, [authedFetch]);

  useEffect(() => {
    if (!userEmail) {
      queueMicrotask(() => {
        setLoading(false);
        setProfile(null);
        setThreads([]);
        setThread(null);
        setMessages([]);
      });
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
    });
    void (async () => {
      try {
        await Promise.all([loadProfile(), loadThreads()]);
        if (selectedThreadId) await loadThread(selectedThreadId);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load messages.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadProfile, loadThread, loadThreads, selectedThreadId, userEmail]);

  async function onRequestLogin(event: FormEvent) {
    event.preventDefault();
    if (!requestLogin) return;
    setLoginStatus(null);
    const result = await requestLogin(loginEmail);
    if (result.ok) setLoginStatus("Magic link sent. Open your email to sign in.");
    else setLoginStatus(result.error ?? "Could not start sign in.");
  }

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, displayName: display }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; profile: MessageProfile }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError((json && "error" in json && json.error) || "Could not save profile.");
        return;
      }
      setProfile(json.profile);
      setHandle(json.profile.handle);
      setDisplay(json.profile.displayName ?? "");
    } finally {
      setSubmitting(false);
    }
  }

  async function onStartThread(event: FormEvent) {
    event.preventDefault();
    if (!recipient.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/messages/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: recipient }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; threadId: string }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError((json && "error" in json && json.error) || "Could not start conversation.");
        return;
      }
      setRecipient("");
      router.push(`/messages/${json.threadId}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function onSendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedThreadId || !draft.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/messages/threads/${encodeURIComponent(selectedThreadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; message: MessageDetail }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError((json && "error" in json && json.error) || "Could not send message.");
        return;
      }
      setMessages((prev) => [...prev, json.message]);
      setDraft("");
      void loadThreads();
    } finally {
      setSubmitting(false);
    }
  }

  if (!userEmail) {
    return (
      <main className="shell messages-shell">
        <section className="messages-auth-card">
          <p className="eyebrow">private workspace</p>
          <h1 className="page-title">messages</h1>
          <p className="page-sub">Sign in to send private notes to other AHackaday users.</p>
          <form onSubmit={onRequestLogin} className="messages-auth-form">
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
            <button type="submit" className="apply-btn">send magic link</button>
          </form>
          {loginStatus ? <p className="messages-hint">{loginStatus}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell messages-shell">
      <section className="messages-head">
        <div>
          <p className="eyebrow">private workspace</p>
          <h1 className="page-title">messages</h1>
          <p className="page-sub">One-to-one notes between signed-in AHackaday users.</p>
        </div>
        <div className="messages-profile-card">
          <span className="messages-profile-card__label">signed in</span>
          <strong>{profile ? `@${profile.handle}` : userEmail}</strong>
          {profile?.displayName ? <span>{profile.displayName}</span> : null}
        </div>
      </section>

      {error ? <p className="messages-error">{error}</p> : null}

      <section className="messages-grid">
        <aside className="messages-panel messages-panel--inbox">
          <form onSubmit={onSaveProfile} className="messages-card">
            <h2>your handle</h2>
            <p>Pick a public handle so other users can message you.</p>
            <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="security_researcher" />
            <input value={display} onChange={(event) => setDisplay(event.target.value)} placeholder="Display name (optional)" />
            <button type="submit" className="apply-btn" disabled={submitting || handle.trim().length < 3}>
              {profile ? "save profile" : "claim handle"}
            </button>
          </form>

          <form onSubmit={onStartThread} className="messages-card">
            <h2>new message</h2>
            <p>Start a conversation by handle.</p>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="@teammate"
              disabled={!profile}
            />
            <button type="submit" className="apply-btn" disabled={submitting || !profile || !recipient.trim()}>
              start
            </button>
          </form>

          <div className="messages-inbox-list">
            <h2>inbox</h2>
            {loading ? (
              <p className="messages-hint">Loading messages...</p>
            ) : threads.length === 0 ? (
              <p className="messages-hint">No conversations yet.</p>
            ) : (
              threads.map((item) => (
                <Link
                  key={item.id}
                  href={`/messages/${item.id}`}
                  className={`messages-thread-link${item.id === selectedThreadId ? " is-active" : ""}`}
                >
                  <span className="messages-thread-link__main">
                    <strong>{displayName(item.otherUser)}</strong>
                    <span>{item.lastMessage?.body ?? "No messages yet."}</span>
                  </span>
                  <span className="messages-thread-link__meta">
                    {item.unreadCount > 0 ? <b>{item.unreadCount}</b> : null}
                    {relativeTime(item.lastMessageAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </aside>

        <section className="messages-panel messages-panel--thread">
          {selectedThreadId ? (
            <>
              <div className="messages-thread-head">
                <div>
                  <span>conversation</span>
                  <h2>{displayName(thread?.otherUser ?? selectedThread?.otherUser)}</h2>
                </div>
                <Link href="/messages" className="messages-link">back to inbox</Link>
              </div>

              <div className="messages-list">
                {messages.length === 0 ? (
                  <p className="messages-hint">No messages in this conversation yet.</p>
                ) : (
                  messages.map((message) => (
                    <article key={message.id} className={`messages-bubble${message.mine ? " is-mine" : ""}`}>
                      <div>{message.body}</div>
                      <span>
                        {message.mine ? "you" : displayName(message.sender)} · {relativeTime(message.createdAt)}
                      </span>
                    </article>
                  ))
                )}
              </div>

              <form onSubmit={onSendMessage} className="messages-compose">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message..."
                  maxLength={4000}
                />
                <button type="submit" className="apply-btn" disabled={submitting || !draft.trim()}>
                  send
                </button>
              </form>
            </>
          ) : (
            <div className="messages-empty">
              <h2>Select a conversation</h2>
              <p>Choose a thread from the inbox or start a new one by handle.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

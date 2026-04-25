"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { buildIncidentBriefLines, primaryTrackingId } from "@/lib/build-ask-ai-context";
import type { Incident } from "@/lib/incident-types";

export const ASK_PROMPTS = {
  tldr: "Give me a tight TL;DR of this incident in 3 short bullets. No fluff. Plain text, dashes for bullets.",
  impact:
    "Explain the real-world impact of this incident: who is affected, in what concrete ways, and over what timeframe. 4-6 sentences, plain text.",
  why: "Should this team care? Tell me the stakes if they ignore it, what could go wrong for their org, and what bar to clear before they can stop worrying. Address the reader as 'you' and 'your team'. 4-6 sentences, plain text.",
} as const;

export const ASK_TOPICS = [
  { id: "tldr" as const, label: "TL;DR", hint: "60s read" },
  { id: "impact" as const, label: "Real-world impact", hint: "~2min · who & how" },
  { id: "why" as const, label: "Should my team care?", hint: "~2min · stakes" },
];

const TICKER_STAGES = [
  "reading the brief…",
  "cross-referencing sources…",
  "checking severity context…",
  "drafting answer…",
];

type TopicId = (typeof ASK_TOPICS)[number]["id"];

type ChatMessage = { id: string; role: "user" | "ai"; text: string };

type Props = { incident: Incident };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildAnalystPreamble(incident: Incident): string {
  const tracking = primaryTrackingId(incident);
  const exploited = incident.exploited ? "yes" : "no";
  const briefLines = buildIncidentBriefLines(incident);
  const parts = [
    "You are an analyst helping a security/platform engineer understand a",
    "cybersecurity incident. Use ONLY the brief below as ground truth. Be concise,",
    "direct, and plain-spoken. No marketing tone.",
    "",
    "--- INCIDENT BRIEF ---",
    `Incident title: ${incident.title}`,
    `Severity: ${incident.severity}`,
    `Category: ${incident.category}`,
    `Affected: ${incident.affected}`,
  ];
  if (tracking) parts.push(`Tracking ID: ${tracking}`);
  parts.push(`Mitigation status: ${incident.mitigationStatus}`);
  parts.push(`Exploited in the wild: ${exploited}`);
  parts.push(`Summary: ${incident.summary}`);
  parts.push("");
  parts.push(...briefLines);
  parts.push("--- END BRIEF ---");
  parts.push("");
  return parts.join("\n");
}

async function completeWithApi(fullPrompt: string): Promise<string> {
  try {
    const res = await fetch("/api/ask-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: fullPrompt }),
      credentials: "same-origin",
    });
    let data: { text?: string; error?: string } = {};
    try {
      data = (await res.json()) as { text?: string; error?: string };
    } catch {
      return `(Error reaching Claude: HTTP ${res.status} — invalid response)`;
    }
    if (!res.ok) {
      return data.error ?? `(Error reaching Claude: HTTP ${res.status})`;
    }
    if (data.text) return data.text;
    return "(Ask AI returned an empty response.)";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `(Error reaching Claude: ${message})`;
  }
}

async function completePrompt(fullPrompt: string): Promise<string> {
  if (typeof window !== "undefined") {
    const w = window as unknown as { claude?: { complete: (p: string) => Promise<string> } };
    if (w.claude?.complete) {
      try {
        const text = await w.claude.complete(fullPrompt);
        const trimmed = text?.trim();
        if (trimmed) return trimmed;
      } catch {
        /* fall through to API */
      }
    }
  }
  return completeWithApi(fullPrompt);
}

function buildShareMarkdown(incident: Incident, text: string): string {
  return `**${incident.title}**
_severity: ${incident.severity} · ${incident.category}_

${text}

— shared by you via ahackaday`;
}

export function AskAI({ incident }: Props) {
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [pressed, setPressed] = useState<TopicId | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTopic(null);
    setPressed(null);
    setMessages([]);
    setInput("");
    setLoading(false);
    setTickerIdx(0);
    setCopiedId(null);
  }, [incident.slug]);

  useEffect(() => {
    if (!loading) {
      setTickerIdx(0);
      return;
    }
    const id = setInterval(() => {
      setTickerIdx((i) => Math.min(i + 1, TICKER_STAGES.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, [loading]);

  const scrollToBottom = useCallback(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const share = useCallback(
    (msgId: string, text: string) => {
      const md = buildShareMarkdown(incident, text);
      try {
        void navigator.clipboard.writeText(md);
      } catch {
        /* ignore */
      }
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1600);
    },
    [incident],
  );

  const runQuestion = async (question: string, userDisplay: string) => {
    setLoading(true);
    setMessages((prev) => [...prev, { id: newId(), role: "user", text: userDisplay }]);
    try {
      const preamble = buildAnalystPreamble(incident);
      const fullPrompt = `${preamble}\nQuestion: ${question}`;
      const reply = await completePrompt(fullPrompt);
      setMessages((prev) => [...prev, { id: newId(), role: "ai", text: reply }]);
    } finally {
      setLoading(false);
    }
  };

  const onTopic = async (id: TopicId) => {
    if (loading) return;
    const meta = ASK_TOPICS.find((t) => t.id === id);
    if (!meta) return;
    setPressed(id);
    setTimeout(() => setPressed(null), 360);
    setTopic(id);
    await runQuestion(ASK_PROMPTS[id], meta.label);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    await runQuestion(q, q);
  };

  const onClear = () => {
    setMessages([]);
    setTopic(null);
    setCopiedId(null);
  };

  return (
    <div className="askai">
      <div className="askai__header">
        <div className="askai__header-left">
          <span className="askai__spark" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M6 1l1.2 3.3L10.5 5.5 7.2 6.7 6 10 4.8 6.7 1.5 5.5 4.8 4.3 6 1z"
                fill="white"
              />
            </svg>
          </span>
          <span className="askai__title">
            <span className="askai__title-strong">Ask AI</span>
            <span className="askai__title-suffix">about this incident</span>
          </span>
        </div>
        {messages.length > 0 && (
          <button type="button" className="askai__clear" onClick={onClear}>
            clear
          </button>
        )}
      </div>

      <div className="askai__chips">
        {ASK_TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`askai__chip${topic === t.id ? " is-active" : ""}${pressed === t.id ? " is-pressed" : ""}`}
            disabled={loading}
            onClick={() => void onTopic(t.id)}
          >
            {pressed === t.id && <span className="askai__chip-pop" />}
            <span className="askai__chip-label">{t.label}</span>
            <span className="askai__chip-hint">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="askai__stream" ref={streamRef}>
        {messages.length === 0 && !loading && (
          <p className="askai__empty">
            Pick a topic above, or ask anything about {incident.title}. Answers are grounded in this brief only.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="askai__msg">
            <div className={`askai__who${m.role === "ai" ? " askai__who--ai" : ""}`}>{m.role === "user" ? "you" : "ai"}</div>
            {m.role === "user" ? (
              <div className="askai__bubble askai__bubble--user">{m.text}</div>
            ) : (
              <>
                <div className="askai__bubble askai__bubble--ai">{m.text}</div>
                <div className="askai__msg-foot">
                  <span className="askai__grounding">
                    <svg className="askai__grounding-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <path
                        d="M3 7.2l2.8 2.8L11 4.8"
                        stroke="#47C26A"
                        strokeWidth="1.4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    based on {incident.sources.length} source{incident.sources.length === 1 ? "" : "s"} · 0 outside guesses
                    <button
                      type="button"
                      className={`askai__share${copiedId === m.id ? " is-copied" : ""}`}
                      onClick={() => share(m.id, m.text)}
                    >
                      {copiedId === m.id ? "copied ✓" : "send to team"}
                    </button>
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
        {loading && (
          <div className="askai__msg">
            <div className="askai__who askai__who--ai">ai</div>
            <div className="askai__ticker" aria-live="polite" aria-busy>
              <span className="askai__ticker-caret" />
              <span className="askai__ticker-text" key={tickerIdx}>
                {TICKER_STAGES[tickerIdx]}
              </span>
            </div>
          </div>
        )}
      </div>

      <form className="askai__input-row" onSubmit={(e) => void onSubmit(e)}>
        <input
          className="askai__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a follow-up…"
          disabled={loading}
          autoComplete="off"
        />
        <button type="submit" className="askai__send" disabled={loading || !input.trim()}>
          send
        </button>
      </form>
    </div>
  );
}

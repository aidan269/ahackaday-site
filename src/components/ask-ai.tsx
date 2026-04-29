"use client";
import { useEffect, useRef, useState } from "react";

import type { Incident } from "@/lib/incident-types";

const ASK_TOPICS = [
  { id: "tldr", label: "TL;DR", hint: "60s read" },
  { id: "impact", label: "Real-world impact", hint: "~2min · who & how" },
  { id: "why", label: "Cantina security priority", hint: "~2min · priority signal" },
] as const;

const ASK_PROMPTS: Record<string, string> = {
  tldr: "Give me a tight TL;DR of this incident in 3 short bullets. No fluff. Plain text, dashes for bullets.",
  impact:
    "Explain the real-world impact of this incident: who is affected, in what concrete ways, and over what timeframe. 4-6 sentences, plain text. Focus on practical outcomes from the brief and avoid commentary about labeling/classification quality.",
  why: "For Cantina Security, how should we prioritize this incident right now? Include: urgency level (high/medium/low), who on the security team should own it first, likely blast radius if delayed, and the minimum response bar before we can downgrade urgency. 4-6 sentences, plain text.",
};

const TICKER_STAGES = [
  "reading the brief…",
  "cross-referencing sources…",
  "checking severity context…",
  "drafting answer…",
];

type Msg = { role: "user" | "ai"; text: string };

function asSections(content: Incident["content"]): { h: string; p: string }[] {
  if (!Array.isArray(content)) return [];
  return content.filter((s): s is { h: string; p: string } => Boolean(s && typeof s.h === "string" && typeof s.p === "string"));
}

export function AskAI({ incident }: { incident: Incident }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) {
      setTickerIdx(0);
      return;
    }
    const id = setInterval(() => setTickerIdx((i) => Math.min(i + 1, TICKER_STAGES.length - 1)), 900);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    setTopic(null);
    setMessages([]);
    setInput("");
  }, [incident.slug]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  function buildContext() {
    const body = asSections(incident.content)
      .map((s) => `${s.h}: ${s.p}`)
      .join("\n\n");
    return [
      `Incident title: ${incident.title}`,
      `Severity: ${incident.severity}`,
      `Category: ${incident.category}`,
      `Affected: ${incident.affected}`,
      incident.cve ? `Tracking ID: ${incident.cve}` : "",
      `Mitigation status: ${incident.mitigationStatus}`,
      `Exploited in the wild: ${incident.exploited ? "yes" : "no"}`,
      `Summary: ${incident.summary}`,
      "",
      "Full brief:",
      body,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function ask(prompt: string, label?: string) {
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text: label || prompt }]);
    try {
      const ctx = buildContext();
      const full = `You are an analyst helping a security/platform engineer understand a cybersecurity incident. Use ONLY the brief below as ground truth. Be concise, direct, and plain-spoken. No marketing tone.
Do not critique the incident taxonomy or classification labels. Do not say the item is "not cybersecurity" or "miscategorized."
If details are missing, state the specific uncertainty briefly, then still provide the most practical impact/risk interpretation possible from available facts.

--- INCIDENT BRIEF ---
${ctx}
--- END BRIEF ---

Question: ${prompt}`;
      const r = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: full }),
      });
      const json = (await r.json()) as { text?: string; error?: string };
      const text = (json.text || "").trim();
      if (!r.ok) {
        setMessages((m) => [...m, { role: "ai", text: `(Error reaching Claude: ${json.error || r.status})` }]);
        return;
      }
      setMessages((m) => [...m, { role: "ai", text: text || "(Ask AI returned an empty response.)" }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "ai", text: `(Error reaching Claude: ${e.message || e})` }]);
    } finally {
      setLoading(false);
    }
  }

  function pickTopic(t: (typeof ASK_TOPICS)[number]) {
    setTopic(t.id);
    setPressed(t.id);
    setTimeout(() => setPressed(null), 360);
    ask(ASK_PROMPTS[t.id], t.label);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    ask(q);
  }

  function clearChat() {
    setMessages([]);
    setTopic(null);
  }

  function share(idx: number, text: string) {
    const md = `**${incident.title}**\n_severity: ${incident.severity} · ${incident.category}_\n\n${text}\n\n— shared by you via ahackaday`;
    try {
      navigator.clipboard.writeText(md);
    } catch {}
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1600);
  }

  return (
    <div className="askai">
      <div className="askai__head">
        <span className="spark">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5L7.1 4.4 10 5.5 7.1 6.6 6 9.5 4.9 6.6 2 5.5 4.9 4.4z" fill="currentColor" />
          </svg>
        </span>
        <span className="label">
          Ask Grace AI <span className="sub">about this incident</span>
        </span>
        {messages.length > 0 && (
          <button className="clear" onClick={clearChat}>
            clear
          </button>
        )}
      </div>

      <div className="askai__topics">
        {ASK_TOPICS.map((t) => (
          <button
            key={t.id}
            className={"askai__topic" + (topic === t.id ? " is-active" : "") + (pressed === t.id ? " is-pressed" : "")}
            onClick={() => pickTopic(t)}
            disabled={loading}
          >
            {pressed === t.id && <span className="pop" />}
            <span>{t.label}</span>
            <span className="hint">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="askai__body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="askai__placeholder">
            Pick a topic above, or ask anything about <strong style={{ color: "var(--fg-2)" }}>{incident.title}</strong>. Answers are grounded in this brief only.
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={"askai__msg " + (m.role === "user" ? "is-user" : "is-ai")}>
            <span className="who">{m.role === "user" ? "you" : "ai"}</span>
            <div className="bubble">{m.text}</div>
            {m.role === "ai" && (
              <div className="askai__msg-foot">
                <span className="askai__grounding">
                  <svg className="check" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  based on {incident.sources.length} source{incident.sources.length === 1 ? "" : "s"} · 0 outside guesses
                  <button className={"send" + (copiedIdx === idx ? " is-copied" : "")} onClick={() => share(idx, m.text)}>
                    {copiedIdx === idx ? "copied ✓" : "send to team"}
                  </button>
                </span>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="askai__msg is-ai">
            <span className="who">ai</span>
            <div className="askai__ticker">
              <span className="caret" />
              <span className="text" key={tickerIdx}>
                {TICKER_STAGES[tickerIdx]}
              </span>
            </div>
          </div>
        )}
      </div>

      <form className="askai__form" onSubmit={submit}>
        <input type="text" placeholder="Ask a follow-up…" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading} />
        <button type="submit" disabled={loading || !input.trim()}>
          send
        </button>
      </form>
    </div>
  );
}

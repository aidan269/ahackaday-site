"use client";
import { useEffect, useRef, useState } from "react";

import type { Incident } from "@/lib/incident-types";

const ASK_TOPICS = [
  { id: "tldr", label: "TL;DR", hint: "60s read" },
  { id: "triage", label: "30-min triage", hint: "owner + immediate actions" },
  { id: "decision", label: "Escalate now?", hint: "yes/no + why" },
  { id: "exec", label: "Exec update", hint: "leadership-ready" },
] as const;

const ASK_PROMPTS: Record<string, string> = {
  tldr: "Give me a tight TL;DR of this incident in 3 short bullets. No fluff. Plain text, dashes for bullets.",
  triage:
    "For Cantina Security, produce a practical 30-minute triage plan: immediate owner, urgency level (high/medium/low), and top 3 actions for the next 30 minutes.",
  decision:
    "Should we escalate this incident right now? Answer yes or no first, then explain why in practical terms and what signal would change that call.",
  exec:
    "Write a leadership-safe executive update for Cantina Security in 6 lines max: what happened, who is affected, business risk if delayed, what the security team is doing now, and what decision/support is needed.",
};

const ROLE_PRESETS = [
  {
    id: "soc",
    label: "SOC analyst",
    instruction: "Optimize for technical responders. Focus on triage speed, concrete checks, and clear owner handoff.",
  },
  {
    id: "eng",
    label: "Eng manager",
    instruction: "Optimize for engineering execution. Focus on impact to services, rollback/patch paths, and sequencing work.",
  },
  {
    id: "exec",
    label: "Exec",
    instruction: "Optimize for leadership decisions. Keep concise, emphasize business exposure and decision points.",
  },
  {
    id: "comms",
    label: "Comms",
    instruction: "Optimize for stakeholder communication. Keep language clear, calm, and externally safe.",
  },
] as const;

const TICKER_STAGES = [
  "reading the brief…",
  "cross-referencing sources…",
  "checking severity context…",
  "drafting answer…",
];

type Msg = { role: "user" | "ai"; text: string };
type OutputMode = "brief" | "checklist" | "slack-ready";

function formatInstructionForMode(mode: OutputMode): string {
  if (mode === "checklist") return "Format as a checklist with dash bullets and clear owners/actions.";
  if (mode === "slack-ready") return "Format as a compact Slack-ready message with short lines and actionable bullets.";
  return "Format as a concise brief with short paragraphs and bullets where useful.";
}

function asSections(content: Incident["content"]): { h: string; p: string }[] {
  if (!Array.isArray(content)) return [];
  return content.filter((s): s is { h: string; p: string } => Boolean(s && typeof s.h === "string" && typeof s.p === "string"));
}

export function AskAI({ incident }: { incident: Incident }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [role, setRole] = useState<(typeof ROLE_PRESETS)[number]["id"]>("soc");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<OutputMode>("brief");
  const bodyRef = useRef<HTMLDivElement>(null);
  const activeTopicLabel = ASK_TOPICS.find((t) => t.id === topic)?.label ?? "pick prompt";
  const activeRole = ROLE_PRESETS.find((r) => r.id === role) ?? ROLE_PRESETS[0];
  const latestAiText = [...messages].reverse().find((m) => m.role === "ai")?.text ?? "";

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
      `Social mentions (24h): ${incident.socialMentions24h ?? "n/a"}`,
      `Social trend: ${incident.socialTrend ?? "flat"}`,
      `Social delta (24h %): ${incident.socialDelta24hPct ?? "n/a"}`,
      incident.socialPlatformSplit
        ? `Platform split: X ${incident.socialPlatformSplit.x}% · Reddit ${incident.socialPlatformSplit.reddit}% · GitHub ${incident.socialPlatformSplit.github}%`
        : "",
      `X mentions (24h): ${incident.xMentions24h ?? 0}`,
      `X unique authors (24h): ${incident.xUniqueAuthors24h ?? 0}`,
      `X verified mentions (24h): ${incident.xVerifiedMentions24h ?? 0}`,
      `X heat score: ${incident.xHeatScore ?? 0}`,
      `X heat trend: ${incident.xHeatTrend ?? "flat"}`,
      `X top hashtags: ${(incident.xTopHashtags ?? []).slice(0, 5).join(", ") || "n/a"}`,
      `Summary: ${incident.summary}`,
      "",
      "Full brief:",
      body,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function ask(prompt: string, label?: string, modeOverride?: OutputMode) {
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text: label || prompt }]);
    try {
      const ctx = buildContext();
      const activeMode = modeOverride ?? mode;
      const structureInstruction = prompt === ASK_PROMPTS.tldr
        ? "Keep it crisp and factual."
        : `Use this exact structure:
- What changed
- Why it matters
- Next 30 minutes
- Owner
- Decision call
- Confidence and unknowns`;
      const full = `You are an analyst helping a security/platform engineer understand a cybersecurity incident. Use ONLY the brief below as ground truth. Be concise, direct, and plain-spoken. No marketing tone.
Do not critique the incident taxonomy or classification labels. Do not say the item is "not cybersecurity" or "miscategorized."
If details are missing, state the specific uncertainty briefly, then still provide the most practical impact/risk interpretation possible from available facts.
Role mode: ${activeRole.label}. ${activeRole.instruction}
${formatInstructionForMode(activeMode)}
${structureInstruction}
Always include "Confidence: <high|medium|low>" and "Unknowns: <bullet list>" at the end for non-TL;DR responses.

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
    ask(ASK_PROMPTS[t.id], `${t.label} (${mode})`, mode);
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

  function copyTeamUpdate(idx: number, text: string) {
    const md = `**${incident.title}**\n_severity: ${incident.severity} · ${incident.category}_\n\n${text}\n\n— shared by you via ahackaday`;
    try {
      navigator.clipboard.writeText(md);
    } catch {}
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1600);
  }

  function copySlackArtifact() {
    if (!latestAiText) return;
    const payload = `:rotating_light: *${incident.title}*\nSeverity: *${incident.severity}* | Category: ${incident.category}\n\n${latestAiText}\n\nSource count: ${incident.sources.length}`;
    try {
      navigator.clipboard.writeText(payload);
    } catch {}
  }

  function copyJiraArtifact() {
    if (!latestAiText) return;
    const payload = `[Security] ${incident.title}

Summary:
${incident.summary}

Severity: ${incident.severity}
Category: ${incident.category}
CVE/Tracking ID: ${incident.cve ?? "n/a"}

Triage Guidance:
${latestAiText}

Sources:
${incident.sources.join("\n")}`;
    try {
      navigator.clipboard.writeText(payload);
    } catch {}
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

      <div className="askai__step-label">Role</div>
      <div className="askai__roles" role="group" aria-label="Role preset">
        {ROLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={"askai__role" + (role === preset.id ? " is-active" : "")}
            onClick={() => setRole(preset.id)}
            disabled={loading}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="askai__step-label">Step 1 - Pick your prompt</div>
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
      <div className="askai__step-label">Step 2 - Pick output style</div>
      <div
        className={"askai__topics askai__topics--step2" + (topic ? " is-ready" : "")}
        role="group"
        aria-label="Answer format"
      >
        {(["brief", "checklist", "slack-ready"] as OutputMode[]).map((option) => (
          <button
            key={option}
            type="button"
            className={"askai__topic" + (mode === option ? " is-active" : "")}
            onClick={() => setMode(option)}
            disabled={loading}
          >
            <span>{option}</span>
            <span className="hint">step 2</span>
          </button>
        ))}
      </div>
      <div className="askai__combo">
        {activeRole.label} {"->"} {activeTopicLabel} {"->"} {mode}
      </div>
      <div className="askai__artifact-actions">
        <button type="button" className="askai__artifact" onClick={copySlackArtifact} disabled={!latestAiText || loading}>
          generate Slack update
        </button>
        <button type="button" className="askai__artifact" onClick={copyJiraArtifact} disabled={!latestAiText || loading}>
          generate Jira ticket
        </button>
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
                  based on {incident.sources.length} source{incident.sources.length === 1 ? "" : "s"} · uses severity/mitigation/social context
                  <button className={"send" + (copiedIdx === idx ? " is-copied" : "")} onClick={() => copyTeamUpdate(idx, m.text)}>
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

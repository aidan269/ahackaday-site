"use client";
import { useEffect, useRef, useState } from "react";

import type { Incident } from "@/lib/incident-types";
import { graceAvatarUrl } from "@/lib/ecosystem";

const ROLES = ["SOC analyst", "Eng lead", "Exec", "Comms"] as const;
const PROMPTS = [
  { id: "tldr", title: "TL;DR", desc: "3-line read for the standup", time: "~60s" },
  { id: "triage", title: "30-min triage", desc: "Owner + immediate actions", time: "~3m" },
  { id: "escalate", title: "Should we escalate?", desc: "Yes/no + the reason behind it", time: "~1m" },
  { id: "exec", title: "Exec update", desc: "One paragraph leadership can paste", time: "~2m" },
] as const;

const PROMPT_TEXT: Record<(typeof PROMPTS)[number]["id"], string> = {
  tldr: "Give me a tight TL;DR in 3 short bullets. No fluff.",
  triage: "Create a practical 30-minute triage plan: owner, urgency, top 3 actions now.",
  escalate: "Should we escalate right now? Answer yes/no first, then why and what would change the call.",
  exec: "Write a leadership-safe update: what happened, business risk, what we're doing now, and support needed.",
};

const THINKING_STEPS = [
  "Read the brief, IOCs & sources",
  "Cross-referenced your last 7 incidents",
  "Drafting the 3-line summary",
  "Checking for quotes vs invented claims",
] as const;

type OutputMode = "brief" | "checklist" | "slack-ready";
type Role = (typeof ROLES)[number];
type PromptId = (typeof PROMPTS)[number]["id"];
type GraceState =
  | { kind: "resting" }
  | { kind: "thinking"; promptId: PromptId | null; role: Role; tone: OutputMode; startedAt: number }
  | { kind: "answered"; promptId: PromptId | null; role: Role; tone: OutputMode; answer: string; durationMs: number };

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
  const [role, setRole] = useState<Role>("SOC analyst");
  const [promptId, setPromptId] = useState<PromptId | null>(null);
  const [tone, setTone] = useState<OutputMode>("brief");
  const [input, setInput] = useState("");
  const [state, setState] = useState<GraceState>({ kind: "resting" });
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCitations, setShowCitations] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);
  const promptTitle = PROMPTS.find((p) => p.id === promptId)?.title ?? "Pick a play";
  const status = state.kind === "thinking" ? "thinking" : state.kind === "answered" ? "done" : "ready";
  const statusAnnouncement = `Grace is ${status}`;

  useEffect(() => {
    const saved = window.localStorage.getItem("ask-grace.role");
    if (saved && (ROLES as readonly string[]).includes(saved)) {
      setRole(saved as Role);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ask-grace.role", role);
  }, [role]);

  useEffect(() => {
    setPromptId(null);
    setInput("");
    setTone("brief");
    setState({ kind: "resting" });
    setThinkingIdx(0);
    setError(null);
    setShowCitations(false);
  }, [incident.slug]);

  useEffect(() => {
    if (state.kind !== "thinking") return;
    setThinkingIdx(0);
    const id = setInterval(() => {
      setThinkingIdx((idx) => Math.min(idx + 1, THINKING_STEPS.length - 1));
    }, 850);
    return () => clearInterval(id);
  }, [state.kind]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void onGenerate();
      }
      if (event.key === "Escape" && state.kind === "thinking") {
        setState({ kind: "resting" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.kind, promptId, role, tone, input]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [state.kind, state.kind === "answered" ? state.answer : ""]);

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

  async function onGenerate() {
    const freeText = input.trim();
    const effectivePrompt = freeText || (promptId ? PROMPT_TEXT[promptId] : "");
    if (!effectivePrompt || state.kind === "thinking") return;
    setError(null);
    setShowCitations(false);
    const startedAt = Date.now();
    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    setState({ kind: "thinking", promptId, role, tone, startedAt });
    try {
      const ctx = buildContext();
      const structureInstruction = promptId === "tldr"
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
Role mode: ${role}.
${formatInstructionForMode(tone)}
${structureInstruction}
Always include "Confidence: <high|medium|low>" and "Unknowns: <bullet list>" at the end for non-TL;DR responses.

--- INCIDENT BRIEF ---
${ctx}
--- END BRIEF ---

Question: ${effectivePrompt}`;
      const r = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: full }),
      });
      const json = (await r.json()) as { text?: string; error?: string };
      const text = (json.text || "").trim();
      if (reqId !== reqIdRef.current) return;
      const durationMs = Date.now() - startedAt;
      if (!r.ok) {
        setState({ kind: "resting" });
        setError(`Couldn't reach Grace. Try again? (${json.error || r.status})`);
        return;
      }
      setState({
        kind: "answered",
        promptId,
        role,
        tone,
        answer: text || "(Ask AI returned an empty response.)",
        durationMs,
      });
      setInput("");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ kind: "resting" });
      setError(`Couldn't reach Grace. Try again? (${message})`);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void onGenerate();
  }

  function copyTeamUpdate(text: string) {
    const md = `**${incident.title}**\n_severity: ${incident.severity} · ${incident.category}_\n\n${text}\n\n— shared by you via ahackaday`;
    try {
      navigator.clipboard.writeText(md);
    } catch {}
  }

  function copySlackArtifact(answer: string) {
    const payload = `*${incident.title}*\nSeverity: *${incident.severity}* | Category: ${incident.category}\n\n${answer}\n\nSource count: ${incident.sources.length}`;
    try {
      navigator.clipboard.writeText(payload);
    } catch {}
  }

  function copyJiraArtifact(answer: string) {
    const payload = `[Security] ${incident.title}

Summary:
${incident.summary}

Severity: ${incident.severity}
Category: ${incident.category}
CVE/Tracking ID: ${incident.cve ?? "n/a"}

Triage Guidance:
${answer}

Sources:
${incident.sources.join("\n")}`;
    try {
      navigator.clipboard.writeText(payload);
    } catch {}
  }

  return (
    <div className="askai">
      <div className="askai__head">
        <span className={`askai__avatar ${status === "done" ? "is-done" : ""}`} aria-hidden>
          <img src={graceAvatarUrl()} alt="" className="askai__avatar-img" width={24} height={24} decoding="async" />
        </span>
        <span className="label">Grace <span className="sub">{status === "thinking" ? "Working on it…" : status === "done" ? `For ${role} · ${promptTitle} · ${tone}` : "Your AI security intern"}</span></span>
        <span className={`askai__status askai__status--${status}`} aria-live="polite">
          <span className="dot" />
          {status}
        </span>
        <span className="askai__sr-only" aria-live="polite">{statusAnnouncement}</span>
      </div>

      <div className="askai__hint">
        Grounded in this brief only — {incident.title}. Press <kbd>⌘K</kbd> any time.
      </div>

      <div className="askai__meta-label"><span>You're answering as</span><span>change anytime</span></div>
      <div className="askai__roles" role="radiogroup" aria-label="Your role">
        {ROLES.map((item) => (
          <button key={item} type="button" role="radio" aria-checked={role === item} className={`askai__role${role === item ? " is-active" : ""}`} onClick={() => setRole(item)} disabled={state.kind === "thinking"}>
            {item}
          </button>
        ))}
      </div>

      {state.kind === "thinking" ? (
        <div className="askai__thinking" aria-live="polite">
          <div className="askai__thinking-head">{promptTitle} · {role}</div>
          <span className="askai__sr-only">Completed step: {THINKING_STEPS[Math.max(0, thinkingIdx - 1)] ?? "none"}</span>
          {THINKING_STEPS.map((step, idx) => (
            <div key={step} className={`askai__thinking-row ${idx < thinkingIdx ? "is-done" : idx === thinkingIdx ? "is-active" : ""}`}>
              <span className="mark">{idx < thinkingIdx ? "✓" : idx === thinkingIdx ? "◐" : "○"}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="askai__meta-label"><span>Pick a play</span><span>or type your own ↓</span></div>
          <div className="askai__topics" role="radiogroup" aria-label="Prompt selection">
            {PROMPTS.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={promptId === item.id} className={`askai__topic${promptId === item.id ? " is-active" : ""}`} onClick={() => setPromptId(item.id)}>
                <span className="time">{item.time}</span>
                <span>{item.title}</span>
                <span className="hint">{item.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="askai__tone" role="radiogroup" aria-label="Tone">
        <span>Tone</span>
        <div className="askai__tone-seg">
          {(["brief", "checklist", "slack-ready"] as OutputMode[]).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={tone === option} className={tone === option ? "is-active" : ""} onClick={() => setTone(option)} disabled={state.kind === "thinking"}>
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="askai__combo">
        {state.kind === "thinking"
          ? "● est. 4 sec · cancel any time with esc"
          : input.trim()
            ? `Ask Grace: "${input.trim().slice(0, 40)}${input.trim().length > 40 ? "..." : ""}"`
            : promptId
              ? `One next move → Generate ${promptTitle} for ${role}`
              : "Pick a play above, or type your question"}
      </div>

      <div className="askai__body" ref={bodyRef}>
        {state.kind === "resting" && (
          <div className="askai__placeholder">
            Generate an answer and Grace will return a grounded response for this incident.
          </div>
        )}
        {state.kind === "answered" && (
          <div className="askai__answer">
            <div className="askai__answer-meta">For {state.role} · {promptTitle} · {state.tone} <span>{(state.durationMs / 1000).toFixed(1)}s</span></div>
            <div className="askai__msg is-ai">
              <div className="bubble">{state.answer}</div>
            </div>
            <div className="askai__receipt">
              <span>Grounded in this brief. {Math.max(2, Math.min(6, incident.sources.length + 1))} quotes from the incident body, {Math.max(1, incident.iocs.length || 3)} IOCs from the source feed, 0 invented claims. </span>
              <button type="button" onClick={() => setShowCitations((v) => !v)}>show citations</button>
            </div>
            {showCitations && (
              <div className="askai__citations">
                {incident.sources.slice(0, 4).map((source) => (
                  <a key={source} href={source} target="_blank" rel="noreferrer">{source}</a>
                ))}
              </div>
            )}
            <div className="askai__feedback">
              <span>Helpful?</span>
              <button type="button" aria-label="Helpful">👍</button>
              <button type="button" aria-label="Not helpful">👎</button>
              <span>improves Grace for your team</span>
            </div>
            <div className="askai__send-this">
              <span>Send this →</span>
              <button type="button" onClick={() => copySlackArtifact(state.answer)}>Slack #sec-incidents</button>
              <button type="button" onClick={() => copyJiraArtifact(state.answer)}>Jira ticket</button>
              <button type="button" onClick={() => copyTeamUpdate(state.answer)}>Copy</button>
            </div>
          </div>
        )}
        {state.kind === "thinking" && (
          <div className="askai__msg is-ai">
            <div className="askai__ticker">
              <span className="caret" />
              <span className="text">Working on it…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="askai__error">
            {error}
            <button type="button" onClick={() => void onGenerate()}>retry</button>
          </div>
        )}
      </div>

      <form className="askai__form" onSubmit={submit}>
        <div className="askai__input-wrap">
          <input
            type="text"
            placeholder={state.kind === "answered" ? "Translate this for an exec audience" : "…or ask anything about this incident"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={state.kind === "thinking"}
          />
          <kbd>⌘ ⏎</kbd>
        </div>
        {state.kind === "thinking" ? (
          <button type="button" onClick={() => setState({ kind: "resting" })}>
            Cancel
          </button>
        ) : (
          <button type="submit" disabled={!input.trim() && !promptId}>
            Generate
          </button>
        )}
      </form>
    </div>
  );
}

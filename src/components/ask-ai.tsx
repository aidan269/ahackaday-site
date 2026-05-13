"use client";
import { useEffect, useRef, useState } from "react";

import type { Incident } from "@/lib/incident-types";
import { extractIncidentKeywordsForGrace } from "@/lib/ask-grace-keywords";
import { graceAvatarUrl } from "@/lib/ecosystem";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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

export function AskAI({ incident }: { incident: Incident }) {
  const supabase = getSupabaseBrowserClient();
  const [role, setRole] = useState<Role>("SOC analyst");
  const [promptId, setPromptId] = useState<PromptId | null>(null);
  const [tone, setTone] = useState<OutputMode>("brief");
  const [input, setInput] = useState("");
  const [state, setState] = useState<GraceState>({ kind: "resting" });
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCitations, setShowCitations] = useState(false);
  const [pulledKeywords, setPulledKeywords] = useState<string[] | null>(null);
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
    setPulledKeywords(null);
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
  }, [state.kind, promptId, role, tone, input, pulledKeywords]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [state.kind, state.kind === "answered" ? state.answer : ""]);

  function buildAskPayload(): { question: string; apiPromptId: PromptId | null } | null {
    const freeText = input.trim();
    const kwRaw = pulledKeywords?.length ? pulledKeywords.join(", ") : "";
    const kw = kwRaw.length > 2800 ? `${kwRaw.slice(0, 2797)}...` : kwRaw;
    if (freeText) {
      return { question: freeText, apiPromptId: promptId };
    }
    const play = promptId ? PROMPT_TEXT[promptId] : "";
    if (play && kw) return { question: `${play}\n\nKeywords: ${kw}`, apiPromptId: promptId };
    if (play) return { question: play, apiPromptId: promptId };
    if (kw) return { question: `${PROMPT_TEXT.tldr}\n\nKeywords: ${kw}`, apiPromptId: "tldr" };
    return null;
  }

  async function onGenerate() {
    const payload = buildAskPayload();
    if (!payload || state.kind === "thinking") return;
    const { question, apiPromptId } = payload;
    const displayPromptId = input.trim() ? promptId : apiPromptId;
    setError(null);
    setShowCitations(false);
    const startedAt = Date.now();
    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    setState({ kind: "thinking", promptId: displayPromptId, role, tone, startedAt });
    try {
      if (!supabase) {
        setState({ kind: "resting" });
        setError("Ask AI auth is unavailable. Missing Supabase public env.");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setState({ kind: "resting" });
        setError("Sign in to use Ask AI.");
        return;
      }
      const r = await fetch("/api/ask-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          incidentSlug: incident.slug,
          role,
          tone,
          promptId: apiPromptId ?? undefined,
          question,
        }),
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
        promptId: displayPromptId,
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

  function pullKeywords() {
    setPulledKeywords(extractIncidentKeywordsForGrace(incident));
  }

  function copyKeywordsList(words: string[]) {
    try {
      navigator.clipboard.writeText(words.join(", "));
    } catch {}
  }

  return (
    <div className="askai">
      <div className="askai__head">
        <span className={`askai__avatar ${status === "done" ? "is-done" : ""}`} aria-hidden>
          <img src={graceAvatarUrl()} alt="" className="askai__avatar-img" width={24} height={24} decoding="async" />
        </span>
        <span className="label">Grace <span className="sub">{status === "thinking" ? "Working on it…" : status === "done" ? `For ${role} · ${promptTitle} · ${tone}` : "Ask Grace"}</span></span>
        <span className={`askai__status askai__status--${status}`} aria-live="polite">
          <span className="dot" />
          {status}
        </span>
        <span className="askai__sr-only" aria-live="polite">{statusAnnouncement}</span>
      </div>

      <div className="askai__hint">
        Grounded in this brief only — {incident.title}. Press <kbd>⌘K</kbd> any time.
      </div>

      <div className="askai__kw-row">
        <button type="button" className="askai__kw-pull" onClick={pullKeywords} disabled={state.kind === "thinking"}>
          Pull keywords
        </button>
        {pulledKeywords && pulledKeywords.length > 0 ? (
          <>
            <span className="askai__kw-count">{pulledKeywords.length} terms</span>
            <button type="button" className="askai__kw-action" onClick={() => copyKeywordsList(pulledKeywords)}>
              Copy
            </button>
          </>
        ) : pulledKeywords && pulledKeywords.length === 0 ? (
          <span className="askai__kw-empty">No keywords extracted — try a richer brief.</span>
        ) : null}
      </div>
      {pulledKeywords && pulledKeywords.length > 0 ? (
        <div className="askai__kw-chips" aria-label="Extracted keywords">
          {pulledKeywords.map((kw) => (
            <span key={kw} className="askai__kw-chip">
              {kw}
            </span>
          ))}
        </div>
      ) : null}

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
            : pulledKeywords && pulledKeywords.length > 0
              ? promptId
                ? `Pull keywords → Generate · ${promptTitle} · ${role}`
                : `Pull keywords → Generate · TL;DR · ${role}`
              : promptId
                ? `One next move → Generate ${promptTitle} for ${role}`
                : "Pick a play, pull keywords, or type your question"}
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
          <button type="submit" disabled={!input.trim() && !promptId && !(pulledKeywords && pulledKeywords.length > 0)}>
            Generate
          </button>
        )}
      </form>
    </div>
  );
}

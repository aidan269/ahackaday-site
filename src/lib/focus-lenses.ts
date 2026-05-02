import type { Incident } from "@/lib/incident-types";

export type FocusLens = "all" | "ai" | "government" | "missed";

function textForIncident(i: Pick<Incident, "title" | "summary" | "category" | "affected">): string {
  return `${i.title} ${i.summary} ${i.category} ${i.affected}`.toLowerCase();
}

export function isAiIncident(i: Pick<Incident, "title" | "summary" | "category" | "affected">): boolean {
  const text = textForIncident(i);
  return /\b(ai|llm|gpt|agentic|model|prompt|inference|anthropic|openai|gemini|cursor)\b/i.test(text);
}

export function isGovernmentIncident(i: Pick<Incident, "title" | "summary" | "category" | "affected">): boolean {
  const text = textForIncident(i);
  return /\b(cisa|nsa|fbi|dod|dhs|government|federal|state[- ]sponsored|nation[- ]state|kev)\b/i.test(text);
}

/** Stories with low Twitter/X surface heat but strong practitioner/community lift — heuristic lens. */
export function matchesMissedTwitterLens(
  i: Pick<Incident, "title" | "summary" | "category" | "affected" | "xHeatScore" | "xMentions24h">,
  communityScore: number,
): boolean {
  const heat = i.xHeatScore ?? 0;
  const mentions = i.xMentions24h ?? 0;
  const lowXTrendSurface = heat < 40 && mentions < 35;
  return lowXTrendSurface && communityScore >= 8;
}

export function matchesFocusLens(
  i: Pick<Incident, "title" | "summary" | "category" | "affected" | "xHeatScore" | "xMentions24h">,
  focus: FocusLens,
  communityScore?: number,
): boolean {
  if (focus === "all") return true;
  if (focus === "ai") return isAiIncident(i);
  if (focus === "government") return isGovernmentIncident(i);
  if (focus === "missed") {
    const cs = typeof communityScore === "number" ? communityScore : 0;
    return matchesMissedTwitterLens(i, cs);
  }
  return true;
}

import type { Incident } from "@/lib/incident-types";

export type FocusLens = "all" | "ai" | "government";

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

export function matchesFocusLens(i: Pick<Incident, "title" | "summary" | "category" | "affected">, focus: FocusLens): boolean {
  if (focus === "all") return true;
  if (focus === "ai") return isAiIncident(i);
  if (focus === "government") return isGovernmentIncident(i);
  return true;
}

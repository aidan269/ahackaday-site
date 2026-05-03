import type { Incident } from "@/lib/incident-types";

export const COMPANY_FOCUS_IDS = ["cisco", "google", "microsoft", "anthropic", "openai"] as const;
export type CompanyFocusId = (typeof COMPANY_FOCUS_IDS)[number];

export type FocusLens = "all" | "ai" | "government" | "missed" | CompanyFocusId;

const COMPANY_PATTERNS: Record<CompanyFocusId, RegExp> = {
  cisco: /\b(cisco|talos)\b/i,
  google: /\b(google|alphabet|chromium|gmail|google cloud|google workspace|youtube)\b/i,
  microsoft:
    /\b(microsoft|msft|azure|office 365|microsoft 365|outlook|exchange online|intune|entra|defender for|windows server|windows 11|windows 10)\b/i,
  anthropic: /\b(anthropic|claude)\b/i,
  openai: /\b(openai|chatgpt|gpt-4|gpt-5|gpt-3)\b/i,
};

function textForIncident(i: Pick<Incident, "title" | "summary" | "category" | "affected">): string {
  return `${i.title} ${i.summary} ${i.category} ${i.affected}`.toLowerCase();
}

export function isCompanyFocusId(value: string): value is CompanyFocusId {
  return (COMPANY_FOCUS_IDS as readonly string[]).includes(value);
}

/** Normalize `?focus=` from the URL; unknown values fall back to `"all"`. */
export function parseFocusLens(raw: string): FocusLens {
  if (raw === "all") return "all";
  if (raw === "ai" || raw === "government" || raw === "missed") return raw;
  if (isCompanyFocusId(raw)) return raw;
  return "all";
}

export function matchesCompanyFocus(
  i: Pick<Incident, "title" | "summary" | "category" | "affected">,
  id: CompanyFocusId,
): boolean {
  return COMPANY_PATTERNS[id].test(textForIncident(i));
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
  if (isCompanyFocusId(focus)) return matchesCompanyFocus(i, focus);
  const _exhaustive: never = focus;
  return _exhaustive;
}

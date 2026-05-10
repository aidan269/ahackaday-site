import type { Incident } from "@/lib/incident-types";
import {
  COMPANY_FOCUS_IDS,
  isAiIncident,
  isGovernmentIncident,
  matchesCompanyFocus,
  type CompanyFocusId,
} from "@/lib/focus-lenses";

export type SidebarCounts = {
  all: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unclassified: number;
  zeroDay: number;
  ransomware: number;
  ai: number;
  government: number;
} & Record<CompanyFocusId, number>;

export function computeSidebarCounts(all: Incident[]): SidebarCounts {
  const c = {
    all: all.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unclassified: 0,
    zeroDay: 0,
    ransomware: 0,
    ai: 0,
    government: 0,
    ...Object.fromEntries(COMPANY_FOCUS_IDS.map((id) => [id, 0])) as Record<CompanyFocusId, number>,
  } satisfies SidebarCounts;
  for (const i of all) {
    c[i.severity] += 1;
    if (i.category === "zero-day") c.zeroDay += 1;
    if (i.category === "ransomware") c.ransomware += 1;
    if (isAiIncident(i)) c.ai += 1;
    if (isGovernmentIncident(i)) c.government += 1;
    for (const id of COMPANY_FOCUS_IDS) {
      if (matchesCompanyFocus(i, id)) c[id] += 1;
    }
  }
  return c;
}

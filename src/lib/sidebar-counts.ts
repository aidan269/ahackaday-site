import { mitigationStatusLooksMitigated } from "@/lib/incidents";
import type { Incident } from "@/lib/incident-types";

export type SidebarCounts = {
  all: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  exploited: number;
  last7d: number;
  mitigated: number;
};

const MS_7D = 7 * 24 * 60 * 60 * 1000;

export function computeSidebarCounts(all: Incident[]): SidebarCounts {
  const c: SidebarCounts = {
    all: all.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    exploited: 0,
    last7d: 0,
    mitigated: 0,
  };
  const now = Date.now();
  for (const i of all) {
    c[i.severity] += 1;
    if (i.exploited) c.exploited += 1;
    const t = new Date(i.date).getTime();
    if (!Number.isNaN(t) && now - t <= MS_7D) c.last7d += 1;
    if (mitigationStatusLooksMitigated(i.mitigationStatus)) c.mitigated += 1;
  }
  return c;
}

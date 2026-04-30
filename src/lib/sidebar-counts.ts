import type { Incident } from "@/lib/incident-types";

export type SidebarCounts = {
  all: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  zeroDay: number;
  ransomware: number;
  breach: number;
};

export function computeSidebarCounts(all: Incident[]): SidebarCounts {
  const c: SidebarCounts = {
    all: all.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    zeroDay: 0,
    ransomware: 0,
    breach: 0,
  };
  for (const i of all) {
    c[i.severity] += 1;
    if (i.category === "zero-day") c.zeroDay += 1;
    if (i.category === "ransomware") c.ransomware += 1;
    if (i.category === "breach") c.breach += 1;
  }
  return c;
}

import type { Incident } from "./incident-types";

/**
 * Promotional / editorial items (webinars, weekly digests) that are not actionable incidents.
 * Used so ingest feeds do not crowd the main incident surface.
 */
export function isEditorialListingNoise(incident: Pick<Incident, "title" | "summary" | "affected">): boolean {
  const title = incident.title.toLowerCase();
  const summary = incident.summary.toLowerCase();
  const affected = incident.affected.toLowerCase();
  const blob = `${title}\n${summary}\n${affected}`;

  if (/^\s*webinar\s*:/i.test(incident.title.trim())) return true;
  if (/\b(is hosting|we are hosting|we're hosting)\b/i.test(blob) && /\bwebinar\b/i.test(blob)) return true;
  if (/\bregister (for|now)\b/i.test(blob) && /\bwebinar\b/i.test(blob)) return true;

  if (/\b(weekly|week in)\b.*\b(review|roundup|digest|summary)\b/i.test(title)) return true;
  if (/\bweek in review\b/i.test(title) || /\bweek in review\b/i.test(summary)) return true;

  return false;
}

export function omitEditorialListingNoise(incidents: Incident[]): Incident[] {
  return incidents.filter((i) => !isEditorialListingNoise(i));
}

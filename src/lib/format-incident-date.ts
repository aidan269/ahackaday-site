export function formatIncidentDate(date: string): string {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown date";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(parsed);
  } catch {
    return "Unknown date";
  }
}

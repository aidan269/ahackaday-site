import { SavedIncidentsView } from "@/components/saved-incidents-view";
import { getAllIncidents } from "@/lib/incidents";

export default async function SavedPage() {
  const incidents = await getAllIncidents();
  const previews = incidents.map((incident) => ({
    slug: incident.slug,
    title: incident.title,
    summary: incident.summary,
    severity: incident.severity,
    date: incident.date,
  }));
  return <SavedIncidentsView incidents={previews} />;
}

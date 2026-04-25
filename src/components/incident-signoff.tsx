import { formatIncidentDate } from "@/lib/format-incident-date";
import type { Incident } from "@/lib/incident-types";

export function IncidentSignoff({ incident }: { incident: Incident }) {
  return (
    <div className="signoff">
      <em>
        Curated {formatIncidentDate(incident.date)} by the ahackaday team.
        <span className="signoff__sep">/</span>
        Sources verified.
        <span className="signoff__sep">/</span>
        Brief grounded in {incident.sources.length} source{incident.sources.length === 1 ? "" : "s"}.
      </em>
    </div>
  );
}

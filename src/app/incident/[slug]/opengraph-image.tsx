import { ImageResponse } from "next/og";

import { getIncidentBySlug } from "@/lib/incidents";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

const SEV_COLOR = {
  critical: "#FF5A4E",
  high: "#F76707",
  medium: "#F2B100",
  low: "#7DE2B5",
} as const;

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  const severity = incident?.severity ?? "medium";
  const sevColor = SEV_COLOR[severity];

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFFFFF",
          color: "#101010",
          fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace",
          border: "1px solid rgba(0,0,0,0.08)",
          padding: "56px 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: sevColor,
            }}
          />
          <div
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              fontSize: 26,
              color: "#5F5F66",
            }}
          >
            {incident ? `${incident.severity} incident brief` : "incident brief"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "95%",
            }}
          >
            {incident ? incident.title : "AHackaday incident update"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 28,
              color: "#3A3A3F",
              maxWidth: "92%",
            }}
          >
            {incident ? incident.summary : "Major cybersecurity incidents with broad implications."}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              fontSize: 24,
              color: "#6B6B72",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            ahackaday.feed
          </div>
          <div
            style={{
              fontSize: 24,
              color: sevColor,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {incident?.category ?? "security"}
          </div>
        </div>
      </div>
    ),
    size,
  );
}

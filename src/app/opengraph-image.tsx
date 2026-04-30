import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
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
              background: "#FA5E06",
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
            incident intelligence
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 70,
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              maxWidth: "96%",
            }}
          >
            AHackaday
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#3A3A3F",
              lineHeight: 1.3,
              maxWidth: "92%",
            }}
          >
            The next frontier in cyber crime social analytics.
          </div>
        </div>
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
      </div>
    ),
    size,
  );
}

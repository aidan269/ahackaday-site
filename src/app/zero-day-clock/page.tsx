import Link from "next/link";

export const revalidate = 900;

type DashboardStat = {
  key: string;
  value: number;
  unit: string;
  label: string;
};

type GraphPoint = {
  label: string;
  median_tte: number | null;
  mean_tte: number | null;
  predicted_tte: number | null;
  sample_size: number | null;
  is_prediction: boolean;
};

type ZeroDayDashboard = {
  stats?: DashboardStat[];
  graphData?: GraphPoint[];
};

function fmt(value: number, unit: string): string {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "hours") return `${value.toFixed(2)}h`;
  if (unit === "days") return `${value.toFixed(2)}d`;
  if (unit === "decimal") return value.toFixed(2);
  if (Math.abs(value) >= 1000) return Intl.NumberFormat("en-US").format(Math.round(value));
  return String(value);
}

async function loadDashboard(): Promise<ZeroDayDashboard | null> {
  try {
    const r = await fetch("https://zerodayclock.com/api/dashboard", {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    return (await r.json()) as ZeroDayDashboard;
  } catch {
    return null;
  }
}

export default async function ZeroDayClockPage() {
  const data = await loadDashboard();
  const stats = data?.stats ?? [];
  const graphData = data?.graphData ?? [];
  const pick = (key: string) => stats.find((s) => s.key === key);

  const headline = [
    pick("median_tte_current"),
    pick("pct_24h_latest"),
    pick("pct_zero_day_all"),
    pick("total_cve_pairs"),
  ].filter((x): x is DashboardStat => Boolean(x));

  const recent = graphData
    .filter((p) => !p.is_prediction)
    .slice(-8)
    .reverse();

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Zero Day Clock<span className="accent">.</span>
          </h1>
          <p className="todays-line">Live Time-to-Exploit data pulled via public JSON API.</p>
        </div>
      </div>

      <div className="feed-meta">
        <span>
          Source:{" "}
          <a href="https://zerodayclock.com/" target="_blank" rel="noreferrer">
            zerodayclock.com
          </a>
          <span className="dot">·</span>
          <Link href="/">back to feed</Link>
        </span>
      </div>

      {!data ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "#fff", padding: 20 }}>
          <p style={{ margin: 0, color: "var(--fg-2)" }}>
            Could not load the Zero Day Clock API right now.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            {headline.map((stat) => (
              <div
                key={stat.key}
                style={{ border: "1px solid var(--border)", borderRadius: 12, background: "#fff", padding: 12 }}
              >
                <div style={{ fontSize: 11, color: "var(--fg-2)", marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(stat.value, stat.unit)}</div>
              </div>
            ))}
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.03)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Year</th>
                  <th style={{ padding: "10px 12px" }}>Median TTE</th>
                  <th style={{ padding: "10px 12px" }}>Mean TTE</th>
                  <th style={{ padding: "10px 12px" }}>Sample Size</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.label} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "9px 12px" }}>{row.label}</td>
                    <td style={{ padding: "9px 12px" }}>{row.median_tte === null ? "n/a" : `${row.median_tte.toFixed(2)}d`}</td>
                    <td style={{ padding: "9px 12px" }}>{row.mean_tte === null ? "n/a" : `${row.mean_tte.toFixed(2)}d`}</td>
                    <td style={{ padding: "9px 12px" }}>{row.sample_size ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

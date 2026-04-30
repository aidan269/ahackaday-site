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
  const trendSeries = [...recent].reverse().filter((p) => p.median_tte !== null);
  const medians = trendSeries.map((p) => p.median_tte as number);
  const minMedian = medians.length ? Math.min(...medians, 0) : 0;
  const maxMedian = medians.length ? Math.max(...medians, 0) : 1;
  const span = Math.max(maxMedian - minMedian, 1);
  const chart = { width: 760, height: 240, padX: 44, padY: 24 };
  const xFor = (idx: number, total: number) =>
    chart.padX + (total <= 1 ? 0 : (idx * (chart.width - chart.padX * 2)) / (total - 1));
  const yFor = (value: number) =>
    chart.height - chart.padY - ((value - minMedian) / span) * (chart.height - chart.padY * 2);
  const zeroY = yFor(0);
  const linePath = trendSeries
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${xFor(idx, trendSeries.length)} ${yFor(p.median_tte as number)}`)
    .join(" ");
  const areaPath =
    trendSeries.length > 1
      ? `${linePath} L ${xFor(trendSeries.length - 1, trendSeries.length)} ${zeroY} L ${xFor(0, trendSeries.length)} ${zeroY} Z`
      : "";

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
              marginBottom: 16,
            }}
          >
            {headline.map((stat) => (
              <div
                key={stat.key}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "#fff",
                  padding: 12,
                  boxShadow: "0 10px 24px rgba(16,16,16,0.05), 0 1px 2px rgba(16,16,16,0.06)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--fg-2)", marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(stat.value, stat.unit)}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
              overflow: "hidden",
              marginBottom: 18,
              boxShadow: "0 10px 24px rgba(16,16,16,0.05), 0 1px 2px rgba(16,16,16,0.06)",
            }}
          >
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

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
              padding: 14,
              boxShadow: "0 12px 28px rgba(16,16,16,0.06), 0 1px 2px rgba(16,16,16,0.06)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--fg-2)", marginBottom: 8 }}>
              Median TTE trend (days, latest 8 observed years)
            </div>
            {trendSeries.length < 2 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)" }}>Not enough data points for a trend chart.</p>
            ) : (
              <svg
                className="zdc-chart"
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                style={{ width: "100%", height: "auto", display: "block" }}
                aria-label="Median time-to-exploit trend"
              >
                <defs>
                  <linearGradient id="zdc-line-gradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FA5E06" />
                    <stop offset="100%" stopColor="#ff8c42" />
                  </linearGradient>
                  <linearGradient id="zdc-area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(250,94,6,0.22)" />
                    <stop offset="100%" stopColor="rgba(250,94,6,0.02)" />
                  </linearGradient>
                </defs>
                <line
                  x1={chart.padX}
                  x2={chart.width - chart.padX}
                  y1={zeroY}
                  y2={zeroY}
                  stroke="rgba(250,94,6,0.5)"
                  strokeDasharray="4 4"
                />
                <line
                  x1={chart.padX}
                  x2={chart.width - chart.padX}
                  y1={chart.height - chart.padY}
                  y2={chart.height - chart.padY}
                  stroke="var(--border)"
                />
                <line
                  x1={chart.padX}
                  x2={chart.padX}
                  y1={chart.padY}
                  y2={chart.height - chart.padY}
                  stroke="var(--border)"
                />
                {areaPath ? <path d={areaPath} className="zdc-chart__area" /> : null}
                <path d={linePath} className="zdc-chart__line-glow" />
                <path d={linePath} className="zdc-chart__line" />
                {trendSeries.map((p, idx) => {
                  const x = xFor(idx, trendSeries.length);
                  const y = yFor(p.median_tte as number);
                  return (
                    <g key={p.label}>
                      <circle cx={x} cy={y} r="5.5" className="zdc-chart__point-halo" />
                      <circle cx={x} cy={y} r="3.5" className="zdc-chart__point" />
                      <text x={x} y={y - 10} textAnchor="middle" fontSize="10" fill="var(--fg-2)" opacity="0.9">
                        {(p.median_tte as number).toFixed(2)}d
                      </text>
                      <text x={x} y={chart.height - 7} textAnchor="middle" fontSize="10" fill="var(--fg-2)">
                        {p.label}
                      </text>
                    </g>
                  );
                })}
                <text x={10} y={zeroY - 4} fontSize="10" fill="var(--fg-2)">
                  0d baseline
                </text>
              </svg>
            )}
          </div>
        </>
      )}
    </main>
  );
}

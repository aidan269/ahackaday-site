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
  survivalData?: Array<{
    year: number;
    day: number;
    pct_surviving: number;
  }>;
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
  const survivalData = data?.survivalData ?? [];
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
  const survivalByYear = new Map<number, Array<{ day: number; pct: number }>>();
  for (const row of survivalData) {
    if (!Number.isFinite(row.year) || !Number.isFinite(row.day) || !Number.isFinite(row.pct_surviving)) continue;
    const entries = survivalByYear.get(row.year) ?? [];
    entries.push({ day: row.day, pct: row.pct_surviving });
    survivalByYear.set(row.year, entries);
  }
  const survivalSeries = [...survivalByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, points]) => ({
      year,
      points: points.sort((a, b) => a.day - b.day),
    }))
    .filter((s) => s.points.length > 1);
  const maxDay = survivalSeries.reduce((mx, s) => Math.max(mx, s.points[s.points.length - 1]?.day ?? 0), 1);
  const survivalChart = { width: 920, height: 330, padX: 56, padY: 28 };
  const sx = (day: number) => survivalChart.padX + (day / maxDay) * (survivalChart.width - survivalChart.padX * 2);
  const sy = (pct: number) =>
    survivalChart.height - survivalChart.padY - (Math.max(0, Math.min(100, pct)) / 100) * (survivalChart.height - survivalChart.padY * 2);
  const yearColors = new Map<number, string>();
  const basePalette = [
    "rgba(190,190,190,0.7)",
    "rgba(170,170,170,0.72)",
    "rgba(145,145,145,0.78)",
    "#f59c6b",
    "#f8733d",
    "#ff4a33",
    "#d10000",
  ];
  const allYears = survivalSeries.map((s) => s.year);
  allYears.forEach((year, idx) => {
    yearColors.set(year, basePalette[Math.min(idx, basePalette.length - 1)] ?? "#999");
  });
  const yearTicks = [0, 7, 14, 30, 60, 90].filter((d) => d <= maxDay);

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

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
              padding: 18,
              marginTop: 18,
              boxShadow: "0 12px 28px rgba(16,16,16,0.06), 0 1px 2px rgba(16,16,16,0.06)",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 22, letterSpacing: "-0.02em" }}>Exploit Survival Curve</h2>
            <p style={{ margin: "0 0 10px", color: "var(--fg-2)", fontSize: 13 }}>
              Of all CVEs that eventually get exploited, what percentage remain unexploited at each point after disclosure?
            </p>
            <div
              style={{
                borderRadius: 10,
                padding: 12,
                background: "rgba(0,0,0,0.03)",
                marginBottom: 10,
                color: "var(--fg-2)",
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: "var(--fg)" }}>How to read:</strong> each line tracks one year&apos;s cohort. A steeper drop means
              faster exploitation. When a line is near 50% by day 30, roughly half of eventually exploited CVEs were compromised in the
              first month.
            </div>
            {survivalSeries.length < 2 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)" }}>Not enough survival curve points yet.</p>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", margin: "0 0 10px", fontSize: 11 }}>
                  {survivalSeries.map((s) => (
                    <span key={s.year} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-2)" }}>
                      <i
                        style={{
                          width: 16,
                          height: 2,
                          background: yearColors.get(s.year),
                          boxShadow: s.year >= 2025 ? "0 0 6px rgba(255,74,51,0.45)" : "none",
                        }}
                      />
                      {s.year}
                    </span>
                  ))}
                </div>
                <svg
                  className="zdc-chart"
                  viewBox={`0 0 ${survivalChart.width} ${survivalChart.height}`}
                  style={{ width: "100%", height: "auto", display: "block" }}
                  aria-label="Exploit survival curve by year"
                >
                  <line x1={survivalChart.padX} x2={survivalChart.width - survivalChart.padX} y1={sy(0)} y2={sy(0)} stroke="var(--border)" />
                  <line x1={survivalChart.padX} x2={survivalChart.width - survivalChart.padX} y1={sy(25)} y2={sy(25)} stroke="var(--border)" strokeDasharray="4 4" />
                  <line x1={survivalChart.padX} x2={survivalChart.width - survivalChart.padX} y1={sy(50)} y2={sy(50)} stroke="var(--border)" strokeDasharray="4 4" />
                  <line x1={survivalChart.padX} x2={survivalChart.width - survivalChart.padX} y1={sy(75)} y2={sy(75)} stroke="var(--border)" strokeDasharray="4 4" />
                  <line x1={survivalChart.padX} x2={survivalChart.width - survivalChart.padX} y1={sy(100)} y2={sy(100)} stroke="var(--border)" strokeDasharray="4 4" />
                  <line x1={survivalChart.padX} x2={survivalChart.padX} y1={survivalChart.padY} y2={sy(0)} stroke="var(--border)" />

                  <line x1={sx(30)} x2={sx(30)} y1={survivalChart.padY} y2={sy(0)} stroke="rgba(0,0,0,0.12)" strokeDasharray="4 4" />
                  <text x={sx(30)} y={survivalChart.padY + 12} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.28)">
                    30-day patch window
                  </text>

                  {survivalSeries.map((series) => {
                    const d = series.points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${sx(p.day)} ${sy(p.pct)}`).join(" ");
                    const isHot = series.year >= 2025;
                    return (
                      <g key={series.year}>
                        {isHot ? (
                          <path
                            d={d}
                            fill="none"
                            stroke={yearColors.get(series.year)}
                            strokeWidth="6"
                            opacity="0.22"
                            filter="blur(1.8px)"
                          />
                        ) : null}
                        <path
                          d={d}
                          fill="none"
                          stroke={yearColors.get(series.year)}
                          strokeWidth={isHot ? 3 : 2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}

                  {[100, 75, 50, 25, 0].map((v) => (
                    <text key={v} x={survivalChart.padX - 10} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="var(--fg-2)">
                      {v}%
                    </text>
                  ))}
                  {yearTicks.map((d) => (
                    <text key={d} x={sx(d)} y={survivalChart.height - 8} textAnchor="middle" fontSize="10" fill="var(--fg-2)">
                      {d === 0 ? "0" : d === 7 ? "1w" : d === 14 ? "2w" : d === 30 ? "1m" : d === 60 ? "2m" : `${d}d`}
                    </text>
                  ))}
                  <text x={survivalChart.padX - 36} y={(survivalChart.height + survivalChart.padY) / 2} fontSize="10" fill="var(--fg-2)" transform={`rotate(-90 ${survivalChart.padX - 36} ${(survivalChart.height + survivalChart.padY) / 2})`}>
                    % still unexploited
                  </text>
                  <text x={survivalChart.width / 2} y={survivalChart.height - 2} textAnchor="middle" fontSize="10" fill="var(--fg-2)">
                    Days after disclosure
                  </text>
                </svg>
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

import Link from "next/link";

export const revalidate = 600;

export default function ZeroDayClockPage() {
  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Zero Day Clock<span className="accent">.</span>
          </h1>
          <p className="todays-line">Embedded external dashboard for zero-day visibility.</p>
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

      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <iframe
          title="Zero Day Clock"
          src="https://zerodayclock.com/"
          style={{ width: "100%", minHeight: "78vh", border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
    </main>
  );
}

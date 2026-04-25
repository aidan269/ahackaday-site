import Link from "next/link";

export default function SavedPage() {
  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Saved <span className="dim">for</span> <span className="accent">later</span>
            <span className="accent">.</span>
          </h1>
          <p className="page-sub">Bookmarked incidents will live here. This view is a placeholder until accounts and persistence ship.</p>
        </div>
      </div>
      <p style={{ color: "var(--fg-2)", maxWidth: "56ch", lineHeight: 1.65 }}>
        For now, use the feed filters and severity shortcuts in the sidebar to triage quickly. RSS and calendar stay available from the workspace block.
      </p>
      <p style={{ marginTop: 24 }}>
        <Link href="/" className="back-link" style={{ textTransform: "none", letterSpacing: "normal" }}>
          back to feed
        </Link>
      </p>
    </main>
  );
}

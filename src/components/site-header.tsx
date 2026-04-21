import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand">
          <span className="brand__mark" />
          <span>
            <span className="brand__name">ahackaday</span>
            <span style={{ color: "var(--brand-orange)" }}>.</span>
            <span style={{ color: "var(--fg-3)" }}>feed</span>
          </span>
          <span className="brand__tag">incident intelligence / teams that move fast</span>
        </Link>
        <nav className="site-nav">
          <Link href="/" className="nav-link">feed</Link>
          <Link href="/calendar" className="nav-link">calendar</Link>
          <Link href="/feed.xml" className="nav-link">rss</Link>
        </nav>
        <div className="header-status">
          <span className="status-dot" />
          <span>live · last scan 00:04 UTC</span>
        </div>
      </div>
    </header>
  );
}

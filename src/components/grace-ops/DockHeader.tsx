"use client";

type TabId = "content" | "triage";

export function DockHeader({
  active,
  onChange,
  subtitle,
  freshness,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  subtitle: string;
  freshness: { state: "fresh" | "stale" | "pending"; label: string };
}) {
  return (
    <header className="ops__dock-hd">
      <div className="ops__dock-hd-top">
        <div>
          <div className="ops__name">Grace Ops</div>
          <p className="ops__dock-sub">{subtitle}</p>
        </div>
        <FreshChip {...freshness} />
      </div>
      <nav className="ops__tabs" role="tablist">
        <Tab id="content" active={active} onChange={onChange}>Content</Tab>
        <Tab id="triage" active={active} onChange={onChange}>Triage</Tab>
      </nav>
    </header>
  );
}

function Tab({
  id,
  active,
  onChange,
  children,
}: {
  id: TabId;
  active: TabId;
  onChange: (t: TabId) => void;
  children: React.ReactNode;
}) {
  const isActive = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onChange(id)}
      className={`ops__tab${isActive ? " ops__tab--active" : ""}`}
    >
      {children}
    </button>
  );
}

function FreshChip({ state, label }: { state: "fresh" | "stale" | "pending"; label: string }) {
  const cls =
    state === "fresh"
      ? "ops__chip ops__chip--fresh"
      : state === "stale"
        ? "ops__chip ops__chip--stale"
        : "ops__chip ops__chip--pending";
  return (
    <span className={cls}><span className="ops__chip-dot" /> {label}</span>
  );
}

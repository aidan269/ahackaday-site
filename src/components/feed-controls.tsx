type FeedControlsProps = {
  query: string;
  severity: string;
  windowValue: string;
};

export function FeedControls({ query, severity, windowValue }: FeedControlsProps) {
  return (
    <form className="mb-3 flex flex-col gap-2 rounded-xl border border-zinc-800/90 bg-zinc-900/55 p-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_rgba(2,6,23,0.38)] sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-400">
        Search
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Cisco, zero-day, edge firewall..."
          className="h-8 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/70 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_0_18px_rgba(34,211,238,0.12)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Severity
        <select
          name="severity"
          defaultValue={severity}
          className="h-8 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/70 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_0_18px_rgba(34,211,238,0.12)]"
        >
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Window
        <select
          name="window"
          defaultValue={windowValue}
          className="h-8 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/70 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_0_18px_rgba(34,211,238,0.12)]"
        >
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="all">All time</option>
        </select>
      </label>

      <button
        type="submit"
        className="micro-lift glow-focus h-8 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/20"
      >
        Apply
      </button>
    </form>
  );
}

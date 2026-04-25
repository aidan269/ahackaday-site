type FeedControlsProps = {
  query: string;
  severity: string;
  typeValue: string;
  windowValue: string;
  onlyExploited?: boolean;
  onlyMitigated?: boolean;
};

export function FeedControls({
  query,
  severity,
  typeValue,
  windowValue,
  onlyExploited,
  onlyMitigated,
}: FeedControlsProps) {
  return (
    <form className="controls">
      <input type="hidden" name="layout" value="card" />
      {onlyExploited ? <input type="hidden" name="exploited" value="1" /> : null}
      {onlyMitigated ? <input type="hidden" name="mitigated" value="1" /> : null}

      <div className="ctrl">
        <label className="sr" htmlFor="f-q">Search</label>
        <div className="ctrl__box">
          <span className="prefix">/</span>
          <input
            id="f-q"
            type="text"
            name="q"
            defaultValue={query}
            placeholder="search incidents, CVEs, vendors..."
          />
        </div>
      </div>

      <div className="ctrl">
        <label className="sr" htmlFor="f-sev">Severity</label>
        <div className="ctrl__box">
          <span className="prefix">●</span>
          <select id="f-sev" name="severity" defaultValue={severity}>
            <option value="all">all severities</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="ctrl">
        <label className="sr" htmlFor="f-win">Window</label>
        <div className="ctrl__box">
          <span className="prefix">●</span>
          <select id="f-win" name="window" defaultValue={windowValue}>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="all">all time</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="ctrl">
        <label className="sr" htmlFor="f-type">Type</label>
        <div className="ctrl__box">
          <span className="prefix">●</span>
          <select id="f-type" name="type" defaultValue={typeValue}>
            <option value="all">all types</option>
            <option value="zero-day">zero-day</option>
            <option value="supply-chain">supply chain</option>
            <option value="breach">breach</option>
            <option value="ransomware">ransomware</option>
            <option value="identity">identity</option>
            <option value="cloud">cloud</option>
            <option value="web">web</option>
            <option value="email">email</option>
            <option value="critical-infrastructure">critical infra</option>
            <option value="exploitation">exploitation</option>
            <option value="consumer-security">consumer</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <button type="submit" className="apply-btn">apply</button>

    </form>
  );
}

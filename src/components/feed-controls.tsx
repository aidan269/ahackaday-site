import { ToolkitDrawer } from "@/components/toolkit-drawer";
import Link from "next/link";

type FeedControlsProps = {
  query: string;
  severity: string;
  typeValue: string;
  socialValue: string;
  voteValue: string;
  windowValue: "7" | "30d" | "90d" | "all";
  layout: "card" | "timeline";
  focusValue: string;
  sortValue: string;
};

export function FeedControls({
  query,
  severity,
  typeValue,
  socialValue,
  voteValue,
  windowValue,
  layout,
  focusValue,
  sortValue,
}: FeedControlsProps) {
  return (
    <form className="controls">
      <input type="hidden" name="severity" value={severity} />
      <input type="hidden" name="type" value={typeValue} />
      <div className="ctrl">
        <label htmlFor="f-q">Search</label>
        <div className="ctrl__box">
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
        <label htmlFor="f-social">Social</label>
        <div className="ctrl__box">
          <select id="f-social" name="social" defaultValue={socialValue}>
            <option value="all">all social</option>
            <option value="reddit-mentions">reddit mentions</option>
            <option value="github-mentions">github mentions</option>
            <option value="twitter-mentions">twitter mentions</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="ctrl">
        <label htmlFor="f-win">Window</label>
        <div className="ctrl__box">
          <select id="f-win" name="window" defaultValue={windowValue}>
            <option value="7">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="all">all time</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="ctrl">
        <label htmlFor="f-votes">Activity</label>
        <div className="ctrl__box">
          <select id="f-votes" name="votes" defaultValue={voteValue}>
            <option value="all">all activity</option>
            <option value="upvoted">upvoted</option>
            <option value="downvoted">downvoted</option>
            <option value="comments">comments</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="ctrl">
        <label htmlFor="f-focus">Lens</label>
        <div className="ctrl__box">
          <select id="f-focus" name="focus" defaultValue={focusValue}>
            <option value="all">all lenses</option>
            <option value="ai">AI / agents</option>
            <option value="government">government / kev</option>
            <option value="missed">stories you&apos;d miss on X</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="ctrl">
        <label htmlFor="f-sort">Sort</label>
        <div className="ctrl__box">
          <select id="f-sort" name="sort" defaultValue={sortValue}>
            <option value="date">newest / severity</option>
            <option value="community">community signal</option>
          </select>
          <span className="chev">▾</span>
        </div>
      </div>

      <div className="layout-toggle" role="group" aria-label="Quick actions">
        <button type="submit" name="layout" value="card" className={`layout-toggle__btn${layout === "card" ? " is-active" : ""}`}>
          card
        </button>
        <Link href="/saved" className="layout-toggle__btn layout-toggle__btn--star" aria-label="View your starred incidents" title="Starred incidents">
          ☆
        </Link>
      </div>

      <ToolkitDrawer />

      <button type="submit" className="apply-btn">apply</button>
    </form>
  );
}

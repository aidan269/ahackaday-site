import { DEFAULT_FEED_WINDOW } from "@/lib/feed-nav";

/** Canonical feed query keys used by the homepage and feed bar. */
export type FeedBarQuery = {
  q: string;
  severity: string;
  type: string;
  social: string;
  votes: string;
  focus: string;
  sort: string;
  window: string;
  layout: "card" | "timeline" | "compact";
};

export const DEFAULT_FEED_QUERY: FeedBarQuery = {
  q: "",
  severity: "all",
  type: "all",
  social: "all",
  votes: "all",
  focus: "all",
  sort: "date",
  window: DEFAULT_FEED_WINDOW,
  layout: "card",
};

export function parseFeedBarQuery(sp: URLSearchParams): FeedBarQuery {
  const layoutRaw = sp.get("layout") ?? "card";
  const layout =
    layoutRaw === "timeline" ? "timeline" : layoutRaw === "compact" ? "compact" : "card";
  const win = sp.get("window") ?? DEFAULT_FEED_WINDOW;
  return {
    q: sp.get("q") ?? "",
    severity: sp.get("severity") ?? "all",
    type: sp.get("type") ?? "all",
    social: sp.get("social") ?? "all",
    votes: sp.get("votes") ?? "all",
    focus: sp.get("focus") ?? "all",
    sort: sp.get("sort") ?? "date",
    window: win === "7d" ? "7" : win,
    layout,
  };
}

/** Serialize to a query string (no leading `?`). Omits defaults for a tidy URL. */
export function serializeFeedBarQuery(f: FeedBarQuery): string {
  const p = new URLSearchParams();
  if (f.layout !== "card") p.set("layout", f.layout);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.severity !== "all") p.set("severity", f.severity);
  if (f.type !== "all") p.set("type", f.type);
  if (f.social !== "all") p.set("social", f.social);
  if (f.votes !== "all") p.set("votes", f.votes);
  if (f.focus !== "all") p.set("focus", f.focus);
  if (f.sort !== "date") p.set("sort", f.sort);
  if (f.window !== DEFAULT_FEED_WINDOW) p.set("window", f.window);
  return p.toString();
}

export function mergeFeedQuery(base: FeedBarQuery, patch: Partial<FeedBarQuery>): FeedBarQuery {
  return { ...base, ...patch };
}

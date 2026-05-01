/** Default time window when omitted from the URL (matches feed controls). */
export const DEFAULT_FEED_WINDOW = "30d";

export type FeedNavOptions = {
  q?: string;
  severity?: string;
  type?: string;
  focus?: string;
  window?: string;
  exploited?: boolean;
  mitigated?: boolean;
  layout?: string;
};

/** Build `/?…` href for feed with stable query ordering. */
export function buildFeedHref(opts: FeedNavOptions = {}): string {
  const p = new URLSearchParams();
  p.set("layout", opts.layout ?? "card");
  if (opts.q?.trim()) p.set("q", opts.q.trim());
  if (opts.severity && opts.severity !== "all") p.set("severity", opts.severity);
  if (opts.type && opts.type !== "all") p.set("type", opts.type);
  if (opts.focus && opts.focus !== "all") p.set("focus", opts.focus);
  const win = opts.window ?? DEFAULT_FEED_WINDOW;
  if (win !== DEFAULT_FEED_WINDOW) p.set("window", win);
  if (opts.exploited) p.set("exploited", "1");
  if (opts.mitigated) p.set("mitigated", "1");
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

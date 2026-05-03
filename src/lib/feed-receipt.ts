import type { FeedBarQuery } from "@/lib/feed-url";
import { DEFAULT_FEED_QUERY } from "@/lib/feed-url";

function socialLabel(social: string): string | null {
  if (social === "all") return null;
  if (social === "twitter-mentions") return "X · mentions";
  if (social === "reddit-mentions") return "Reddit · mentions";
  if (social === "github-mentions") return "GitHub · mentions";
  return social;
}

function votesLabel(votes: string): string | null {
  if (votes === "all") return null;
  if (votes === "upvoted") return "upvoted";
  if (votes === "downvoted") return "downvoted";
  if (votes === "comments") return "with comments";
  return votes;
}

function focusLabel(focus: string): string | null {
  if (focus === "all") return null;
  if (focus === "ai") return "AI / agents";
  if (focus === "government") return "government / KEV";
  if (focus === "missed") return "missed on X";
  if (focus === "cisco") return "Cisco";
  if (focus === "google") return "Google";
  if (focus === "microsoft") return "Microsoft";
  if (focus === "anthropic") return "Anthropic";
  if (focus === "openai") return "OpenAI";
  return focus;
}

function windowLabel(window: string): string {
  if (window === "7") return "7 days";
  if (window === "90d") return "90 days";
  if (window === "all") return "all time";
  return "30 days";
}

function isFullyDefault(q: FeedBarQuery): boolean {
  return (
    !q.q.trim() &&
    q.window === DEFAULT_FEED_QUERY.window &&
    q.social === "all" &&
    q.votes === "all" &&
    q.focus === "all" &&
    q.sort === "date" &&
    q.severity === "all" &&
    q.type === "all"
  );
}

/** Human-readable segments for the receipt `<em>` (joined with · in UI). */
export function buildFeedReceiptEmphasis(q: FeedBarQuery): string[] {
  if (isFullyDefault(q)) return ["last 30 days"];
  const parts: string[] = [];
  const query = q.q.trim();
  if (query) parts.push(`"${query.length > 48 ? `${query.slice(0, 48)}…` : query}"`);
  if (q.window !== DEFAULT_FEED_QUERY.window) parts.push(windowLabel(q.window));
  const s = socialLabel(q.social);
  if (s) parts.push(s);
  const v = votesLabel(q.votes);
  if (v) parts.push(v);
  const fo = focusLabel(q.focus);
  if (fo) parts.push(fo);
  if (q.sort === "community") parts.push("community sort");
  if (q.severity !== "all") parts.push(q.severity);
  if (q.type !== "all") parts.push(q.type.replace(/-/g, " "));
  if (parts.length === 0) return ["last 30 days"];
  return parts;
}

export function countActiveFeedChips(q: FeedBarQuery): number {
  let n = 0;
  if (q.q.trim()) n += 1;
  if (q.window !== DEFAULT_FEED_QUERY.window) n += 1;
  if (q.social !== "all") n += 1;
  if (q.votes !== "all") n += 1;
  if (q.focus !== "all") n += 1;
  if (q.sort !== "date") n += 1;
  if (q.severity !== "all") n += 1;
  if (q.type !== "all") n += 1;
  return n;
}

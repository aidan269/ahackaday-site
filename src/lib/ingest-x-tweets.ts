import type { FeedItem } from "@/lib/ingest-feed-parse";
import { DEFAULT_CANTINA_X_USERNAME } from "@/lib/cantina-x-timeline";

export { DEFAULT_CANTINA_X_USERNAME } from "@/lib/cantina-x-timeline";

type XTweet = {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
};

type XUser = {
  id: string;
  username?: string;
};

type XRecentSearchResponse = {
  data?: XTweet[];
  includes?: { users?: XUser[] };
  meta?: { result_count?: number };
};

function intEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function tweetTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "X post";
  return oneLine.length <= 140 ? oneLine : `${oneLine.slice(0, 137)}…`;
}

function tweetPermalink(tweetId: string, username?: string): string {
  if (username && /^[a-z0-9_]{1,15}$/i.test(username)) {
    return `https://x.com/${username}/status/${tweetId}`;
  }
  return `https://x.com/i/web/status/${tweetId}`;
}

const X_STATUS_PATH_RE = /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i;

/** Numeric tweet id from an X/Twitter status URL (https://x.com/user/status/123). */
export function parseXTweetIdFromStatusUrl(url: string): string | null {
  const m = url.trim().match(X_STATUS_PATH_RE);
  return m?.[1] ?? null;
}

type TweetLookupResponse = {
  data?: XTweet[];
  errors?: { resource_id?: string; detail?: string; title?: string }[];
  includes?: { users?: XUser[] };
};

/**
 * Fetch specific tweets by id (`GET /2/tweets`) for targeted ingest (not limited to recent timeline page).
 * `idToSourceName` maps each id to the DB `source_name` (e.g. Cantina (X) vs generic lookup).
 */
export async function fetchIngestXTweetsByIds(
  fetchImpl: typeof fetch,
  tweetIds: string[],
  idToSourceName: Map<string, string>,
): Promise<
  | { ok: true; items: FeedItem[]; missingIds: string[] }
  | { ok: false; error: string }
> {
  const bearerToken = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return { ok: false, error: "X tweet lookup: missing X_BEARER_TOKEN or TWITTER_BEARER_TOKEN" };
  }

  const unique = [...new Set(tweetIds.filter((id) => /^\d{1,32}$/.test(id)))];
  if (unique.length === 0) {
    return { ok: false, error: "X tweet lookup: no valid numeric tweet ids" };
  }

  const ids = unique.slice(0, 100);
  const url = new URL("https://api.x.com/2/tweets");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("tweet.fields", "created_at");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "User-Agent": "AHackaday-Ingest/1.0 (+x-tweets-by-id)",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `X tweet lookup fetch failed: ${message}` };
  }

  if (!response.ok) {
    if (response.status === 429) {
      return { ok: false, error: "X tweet lookup: rate limited (429)" };
    }
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `X tweet lookup failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }

  const payload = (await response.json()) as TweetLookupResponse;
  const users = payload.includes?.users ?? [];
  const userById = new Map(users.filter((u) => u.id).map((u) => [u.id, u]));
  const tweets = payload.data ?? [];
  const seen = new Set<string>();
  const items: FeedItem[] = [];

  for (const tweet of tweets) {
    const text = (tweet.text ?? "").trim();
    if (!tweet.id || !text) continue;
    seen.add(tweet.id);
    const user = tweet.author_id ? userById.get(tweet.author_id) : undefined;
    const link = tweetPermalink(tweet.id, user?.username);
    const pubDate =
      tweet.created_at && !Number.isNaN(Date.parse(tweet.created_at))
        ? new Date(tweet.created_at).toISOString()
        : new Date().toISOString();
    const sourceName = idToSourceName.get(tweet.id) ?? "X (status lookup)";
    items.push({
      title: tweetTitle(text),
      link,
      description: text,
      pubDate,
      sourceName,
    });
  }

  const missingIds = ids.filter((id) => !seen.has(id));
  return { ok: true, items, missingIds };
}

/**
 * Fetch recent tweets for ingest via X API v2 `tweets/search/recent`.
 * Requires `INGEST_X_QUERY` and `X_BEARER_TOKEN` or `TWITTER_BEARER_TOKEN`.
 */
export async function fetchIngestXTweets(
  fetchImpl: typeof fetch,
  options?: { query?: string; sourceName?: string },
): Promise<{ ok: true; items: FeedItem[]; query: string } | { ok: false; error: string }> {
  const bearerToken = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;
  const query = options?.query?.trim() || process.env.INGEST_X_QUERY?.trim();
  if (!bearerToken) {
    return { ok: false, error: "X ingest: missing X_BEARER_TOKEN or TWITTER_BEARER_TOKEN" };
  }
  if (!query) {
    return { ok: false, error: "X ingest: missing INGEST_X_QUERY (or pass options.query)" };
  }

  const maxResults = Math.min(100, Math.max(10, intEnv("INGEST_X_MAX_RESULTS", 10)));
  const sourceName =
    options?.sourceName?.trim() || process.env.INGEST_X_SOURCE_NAME?.trim() || "X (search)";

  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("tweet.fields", "created_at,lang");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "User-Agent": "AHackaday-Ingest/1.0 (+x-search)",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `X ingest fetch failed: ${message}` };
  }

  if (!response.ok) {
    if (response.status === 429) {
      return { ok: false, error: "X ingest: rate limited (429)" };
    }
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `X ingest: search failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }

  const data = (await response.json()) as XRecentSearchResponse;
  const tweets = data.data ?? [];
  const users = data.includes?.users ?? [];
  const userById = new Map(users.filter((u) => u.id).map((u) => [u.id, u]));

  const items: FeedItem[] = [];
  for (const tweet of tweets) {
    const text = (tweet.text ?? "").trim();
    if (!tweet.id || !text) continue;
    const user = tweet.author_id ? userById.get(tweet.author_id) : undefined;
    const link = tweetPermalink(tweet.id, user?.username);
    const pubDate =
      tweet.created_at && !Number.isNaN(Date.parse(tweet.created_at))
        ? new Date(tweet.created_at).toISOString()
        : new Date().toISOString();
    items.push({
      title: tweetTitle(text),
      link,
      description: text,
      pubDate,
      sourceName,
    });
  }

  return { ok: true, items, query };
}

type UserByUsernameResponse = {
  data?: { id: string; username?: string };
  errors?: { detail?: string }[];
};

type UserTweetsResponse = {
  data?: XTweet[];
  meta?: { result_count?: number };
};

/**
 * Recent posts from a Cantina-branded X timeline (`users/:id/tweets`), after resolving username → id.
 * Retweets excluded. Uses same bearer as search ingest.
 * @param explicitUsername — when set (e.g. from `listCantinaTimelineHandlesForIngest()`), fetch that handle instead of `INGEST_X_CANTINA_USERNAME`.
 */
export async function fetchIngestXCantinaUserTimeline(
  fetchImpl: typeof fetch,
  explicitUsername?: string,
): Promise<{ ok: true; items: FeedItem[]; username: string } | { ok: false; error: string }> {
  const bearerToken = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return { ok: false, error: "Cantina X ingest: missing X_BEARER_TOKEN or TWITTER_BEARER_TOKEN" };
  }

  const fromExplicit = explicitUsername?.trim()
    ? explicitUsername.trim().replace(/^@/, "").toLowerCase()
    : "";
  const usernameRaw =
    fromExplicit || process.env.INGEST_X_CANTINA_USERNAME?.trim() || DEFAULT_CANTINA_X_USERNAME;
  const username = usernameRaw.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/i.test(username)) {
    return { ok: false, error: "Cantina X ingest: invalid INGEST_X_CANTINA_USERNAME" };
  }

  const maxResults = Math.min(100, Math.max(5, intEnv("INGEST_X_CANTINA_MAX_RESULTS", 10)));
  const sourceName = process.env.INGEST_X_CANTINA_SOURCE_NAME?.trim() || "Cantina (X)";

  const baseHeaders = {
    Authorization: `Bearer ${bearerToken}`,
    "User-Agent": "AHackaday-Ingest/1.0 (+x-cantina-timeline)",
  };

  let userRes: Response;
  try {
    const userUrl = `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`;
    userRes = await fetchImpl(userUrl, {
      headers: baseHeaders,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Cantina X user lookup failed: ${message}` };
  }

  if (!userRes.ok) {
    const body = await userRes.text().catch(() => "");
    return {
      ok: false,
      error: `Cantina X user lookup (${userRes.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }

  const userJson = (await userRes.json()) as UserByUsernameResponse;
  const userId = userJson.data?.id;
  if (!userId) {
    const detail = userJson.errors?.[0]?.detail ?? "unknown";
    return { ok: false, error: `Cantina X user not found: ${detail}` };
  }

  const timelineUrl = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets`);
  timelineUrl.searchParams.set("max_results", String(maxResults));
  timelineUrl.searchParams.set("tweet.fields", "created_at");
  timelineUrl.searchParams.set("exclude", "retweets");

  let tlRes: Response;
  try {
    tlRes = await fetchImpl(timelineUrl.toString(), {
      headers: baseHeaders,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Cantina X timeline fetch failed: ${message}` };
  }

  if (!tlRes.ok) {
    if (tlRes.status === 429) {
      return { ok: false, error: "Cantina X ingest: rate limited (429)" };
    }
    const body = await tlRes.text().catch(() => "");
    return {
      ok: false,
      error: `Cantina X timeline failed (${tlRes.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }

  const tlJson = (await tlRes.json()) as UserTweetsResponse;
  const tweets = tlJson.data ?? [];
  const handleForLink = userJson.data?.username ?? username;

  const items: FeedItem[] = [];
  for (const tweet of tweets) {
    const text = (tweet.text ?? "").trim();
    if (!tweet.id || !text) continue;
    const pubDate =
      tweet.created_at && !Number.isNaN(Date.parse(tweet.created_at))
        ? new Date(tweet.created_at).toISOString()
        : new Date().toISOString();
    items.push({
      title: tweetTitle(text),
      link: tweetPermalink(tweet.id, handleForLink),
      description: text,
      pubDate,
      sourceName,
    });
  }

  return { ok: true, items, username };
}

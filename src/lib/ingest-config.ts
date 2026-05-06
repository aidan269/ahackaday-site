/**
 * Ingest feed list + limits. Default feeds in code; override with INGEST_FEEDS JSON on Vercel.
 *
 * Optional X/Twitter ingest (runs after RSS feeds in `/api/ingest`):
 * - `INGEST_X_QUERY` — optional recent-search query (`tweets/search/recent`). Omit to skip search-only ingest.
 * - `X_BEARER_TOKEN` or `TWITTER_BEARER_TOKEN` — app bearer (search + Cantina timeline).
 * - `INGEST_X_ENABLED` — set `0` / `false` / `no` to disable **all** X ingest (search + Cantina timeline).
 * - `INGEST_X_MAX_RESULTS` — 10–100 (default 10). Recent search minimum page size is 10.
 * - `INGEST_X_SOURCE_NAME` — optional `source_name` in DB for search (default `X (search)`).
 *
 * Cantina X timeline (always tries when bearer present unless disabled below — complements sparse blog RSS):
 * - `INGEST_X_CANTINA_ENABLED` — set `0` / `false` / `no` to skip Cantina user timeline only.
 * - `INGEST_X_CANTINA_USERNAME` — handle without `@` (default **`cantinasecurity`**, https://x.com/cantinasecurity).
 * - `INGEST_X_CANTINA_MAX_RESULTS` — 5–100 (default 10). User timeline minimum page size is 5.
 * - `INGEST_X_CANTINA_SOURCE_NAME` — optional DB `source_name` (default `Cantina (X)`).
 */

export type IngestFeedConfig = {
  url: string;
  /** Display / DB source_name */
  source: string;
  /** Max items to consider from this feed per run (newest first in parse order). */
  itemLimit: number;
  /** Set false to skip without removing from JSON */
  enabled?: boolean;
};

const DEFAULT_FEEDS: IngestFeedConfig[] = [
  {
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    source: "CISA",
    itemLimit: 10,
  },
  { url: "https://krebsonsecurity.com/feed/", source: "KrebsOnSecurity", itemLimit: 10 },
  { url: "https://www.bleepingcomputer.com/feed/", source: "BleepingComputer", itemLimit: 10 },
  /** Main site redirects to Feedburner; this URL is stable for fetch+parse. */
  { url: "https://feeds.feedburner.com/TheHackersNews", source: "TheHackerNews", itemLimit: 8 },
  { url: "https://www.securityweek.com/feed/", source: "SecurityWeek", itemLimit: 8 },
];

function intEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Max **new** items (not already in Supabase) to fully process per run — fetch article + summarize + upsert.
 * Stops early when reached; does not count skipped-existing rows.
 */
export function getIngestMaxNewPerRun(): number {
  return intEnv("INGEST_MAX_NEW_PER_RUN", 40);
}

export function getIngestDefaultItemLimit(): number {
  const n = intEnv("INGEST_DEFAULT_ITEM_LIMIT", 10);
  return Math.max(1, n);
}

/**
 * Merges INGEST_FEEDS JSON with per-entry limits; falls back to DEFAULT_FEEDS if unset or invalid.
 */
function isIngestXGloballyDisabled(): boolean {
  const off = process.env.INGEST_X_ENABLED?.trim().toLowerCase();
  return off === "0" || off === "false" || off === "no";
}

/** True when X recent-search ingest should run: query + bearer, and not explicitly disabled. */
export function isIngestXSearchConfigured(): boolean {
  const bearer = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;
  const query = process.env.INGEST_X_QUERY?.trim();
  if (!bearer || !query) return false;
  if (isIngestXGloballyDisabled()) return false;
  return true;
}

/** True when Cantina user timeline ingest should run (needs bearer; independent of `INGEST_X_QUERY`). */
export function isIngestXCantinaTimelineConfigured(): boolean {
  const bearer = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) return false;
  if (isIngestXGloballyDisabled()) return false;
  const off = process.env.INGEST_X_CANTINA_ENABLED?.trim().toLowerCase();
  if (off === "0" || off === "false" || off === "no") return false;
  return true;
}

export function loadIngestFeeds(): IngestFeedConfig[] {
  const raw = process.env.INGEST_FEEDS?.trim();
  if (!raw) {
    return DEFAULT_FEEDS.map((f) => ({ ...f }));
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_FEEDS;
    }
    const def = getIngestDefaultItemLimit();
    const out: IngestFeedConfig[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      const source = typeof o.source === "string" ? o.source.trim() : "";
      if (!url || !source) continue;
      const itemLimit =
        typeof o.itemLimit === "number" && Number.isFinite(o.itemLimit) && o.itemLimit > 0
          ? Math.min(200, Math.floor(o.itemLimit))
          : def;
      const enabled = o.enabled === false ? false : true;
      out.push({ url, source, itemLimit, enabled });
    }
    return out.length > 0 ? out : DEFAULT_FEEDS;
  } catch {
    return DEFAULT_FEEDS;
  }
}

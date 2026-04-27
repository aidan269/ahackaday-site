/**
 * Ingest feed list + limits. Default feeds in code; override with INGEST_FEEDS JSON on Vercel.
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

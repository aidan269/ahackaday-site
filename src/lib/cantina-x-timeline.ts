/**
 * X handles whose timelines are ingested as “Cantina (X)” and shown under Cantina tweets / lens.
 * Primary defaults to {@link DEFAULT_CANTINA_X_USERNAME}; extras default to {@link DEFAULT_CANTINA_X_EXTRA_USERNAMES}
 * unless `INGEST_X_CANTINA_EXTRA_USERNAMES` is set (comma-separated; empty string disables extras).
 */

export const DEFAULT_CANTINA_X_USERNAME = "cantinasecurity";

/** Bundled Cantina-adjacent voices (e.g. Cantina team) when `INGEST_X_CANTINA_EXTRA_USERNAMES` is unset. */
export const DEFAULT_CANTINA_X_EXTRA_USERNAMES: readonly string[] = ["p_misirov"];

const CANTINA_SITE_PATTERN = /cantina\.security/i;

function normalizeHandle(raw: string): string | null {
  const s = raw.replace(/^@/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/i.test(s)) return null;
  return s;
}

/** Ordered unique handles for `/api/ingest` Cantina timeline passes. */
export function listCantinaTimelineHandlesForIngest(): string[] {
  const primary =
    normalizeHandle(process.env.INGEST_X_CANTINA_USERNAME?.trim() || "") ?? DEFAULT_CANTINA_X_USERNAME;

  const rawExtras = process.env.INGEST_X_CANTINA_EXTRA_USERNAMES;
  const extras: string[] =
    rawExtras === undefined
      ? [...DEFAULT_CANTINA_X_EXTRA_USERNAMES]
      : rawExtras.trim() === ""
        ? []
        : rawExtras
            .split(",")
            .map((p) => normalizeHandle(p.trim()))
            .filter((x): x is string => x !== null);

  const ordered = [primary, ...extras];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of ordered) {
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

const STATIC_PILL_HANDLES = new Set<string>([
  DEFAULT_CANTINA_X_USERNAME,
  ...DEFAULT_CANTINA_X_EXTRA_USERNAMES,
]);

/** Primary `sources[0]` is an X status URL from a Cantina-timeline account (feed pill). */
export function isCantinaTimelineTweetSourceUrl(url: string): boolean {
  const u = url.toLowerCase();
  for (const h of STATIC_PILL_HANDLES) {
    if (u.includes(`x.com/${h}/`) || u.includes(`twitter.com/${h}/`)) return true;
  }
  return false;
}

/** Any source URL: Cantina site or Cantina-timeline X accounts (Cantina focus lens). */
export function isCantinaSourcedUrl(url: string): boolean {
  if (CANTINA_SITE_PATTERN.test(url)) return true;
  return isCantinaTimelineTweetSourceUrl(url);
}

/** `source_name` for a status URL ingested via tweet-by-id lookup (matches timeline when author is Cantina-tracked). */
export function sourceNameForExplicitXStatusUrl(statusPageUrl: string): string {
  if (isCantinaTimelineTweetSourceUrl(statusPageUrl)) {
    return process.env.INGEST_X_CANTINA_SOURCE_NAME?.trim() || "Cantina (X)";
  }
  return process.env.INGEST_X_DIRECT_STATUS_SOURCE_NAME?.trim() || "X (status lookup)";
}

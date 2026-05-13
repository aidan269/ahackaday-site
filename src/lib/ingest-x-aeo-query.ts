import type { SupabaseClient } from "@supabase/supabase-js";

const STOP = new Set(
  `the a an and or for to of in on at by with from as is was are were be been
this that it its has have had not no may can could would will should about into
through during before after above below between under again further then once
here there when where why how all each both few more most other some such only
own same so than too very just but also out our your their what which who whom
new any incident incidents security attack vulnerability data users used using
update issue report blog post open source days day week month year must need get
got make made like said says via per over based high low key risk than being still
known https http www com org net one two may been were being has have had
infosec cybersecurity ransomware phishing malware exploit patch advisory`.split(/\s+/),
);

const CVE_RE = /CVE-\d{4}-\d+/gi;

function tokenizeLine(text: string): string[] {
  const cves = [...text.matchAll(CVE_RE)].map((m) => m[0].toUpperCase());
  const stripped = text.replace(CVE_RE, " ");
  const words = stripped
    .split(/[^a-zA-Z0-9+/._-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && w.length <= 36);
  const filtered = words.filter((w) => !STOP.has(w.toLowerCase()) && !/^\d{1,3}$/.test(w));
  return [...cves, ...filtered];
}

/**
 * Build an X recent-search `query` string: OR-joined keywords, truncated to `maxChars`,
 * with ` lang:en -is:retweet` suffix (required for sane ingest).
 */
export function buildOrQueryFromKeywords(keywords: string[], maxChars: number): string {
  const suffix = " lang:en -is:retweet";
  const budget = Math.max(80, maxChars - suffix.length);
  const seen = new Set<string>();
  const ranked: string[] = [];
  for (const k of keywords) {
    const t = k.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push(/^CVE-\d{4}-\d+$/i.test(t) ? t.toUpperCase() : t);
  }
  ranked.sort((a, b) => {
    const ac = /^CVE-/i.test(a) ? 2 : 0;
    const bc = /^CVE-/i.test(b) ? 2 : 0;
    if (ac !== bc) return bc - ac;
    return b.length - a.length;
  });

  const parts: string[] = [];
  let len = 0;
  for (const word of ranked) {
    const piece = parts.length === 0 ? word : ` OR ${word}`;
    if (len + piece.length > budget) break;
    parts.push(piece);
    len += piece.length;
  }
  const core = parts.join("");
  if (!core.trim()) {
    return `("cybersecurity" OR "ransomware" OR "vulnerability")${suffix}`;
  }
  return `${core}${suffix}`;
}

export type TopAeoXQueryResult =
  | { ok: true; query: string; keywords: string[]; incidentIds: string[] }
  | { ok: false; error: string };

/**
 * Load highest `total_score` AEO rows + incident titles/snippets, derive OR-keyword X search query.
 */
export async function buildXSearchQueryFromTopAeoScores(
  supabase: SupabaseClient,
  opts: { incidentLimit: number; maxQueryChars: number },
): Promise<TopAeoXQueryResult> {
  const limit = Math.min(50, Math.max(5, opts.incidentLimit));
  const { data: scores, error: e1 } = await supabase
    .from("aeo_scores")
    .select("incident_id, total_score, one_line_diagnosis")
    .order("total_score", { ascending: false })
    .limit(limit);

  if (e1) {
    return { ok: false, error: `aeo_scores: ${e1.message}` };
  }
  if (!scores?.length) {
    return { ok: false, error: "No rows in aeo_scores; run AEO scoring first." };
  }

  const ids = scores.map((r) => r.incident_id as string);
  const { data: incidents, error: e2 } = await supabase
    .from("incidents")
    .select("id, title, raw_content")
    .in("id", ids);

  if (e2) {
    return { ok: false, error: `incidents: ${e2.message}` };
  }

  const byId = new Map((incidents ?? []).map((r) => [r.id as string, r]));
  const keywords: string[] = [];
  const incidentIds: string[] = [];

  for (const row of scores) {
    const id = row.incident_id as string;
    const inc = byId.get(id);
    incidentIds.push(id);
    const title = (inc?.title as string | undefined)?.trim() ?? "";
    const raw = (inc?.raw_content as string | undefined)?.trim() ?? "";
    const diag = (row.one_line_diagnosis as string | undefined)?.trim() ?? "";
    const snippet = raw.slice(0, 400);
    const blob = `${title}\n${diag}\n${snippet}`;
    keywords.push(...tokenizeLine(blob));
  }

  const query = buildOrQueryFromKeywords(keywords, opts.maxQueryChars);
  const uniq: string[] = [];
  const seenKw = new Set<string>();
  for (const k of keywords) {
    const key = k.toLowerCase();
    if (seenKw.has(key)) continue;
    seenKw.add(key);
    uniq.push(/^CVE-\d{4}-\d+$/i.test(k) ? k.toUpperCase() : k);
    if (uniq.length >= 80) break;
  }
  return { ok: true, query, keywords: uniq, incidentIds };
}

export type TopAeoXSearchOpts = { incidentLimit: number; maxQueryChars: number };

/** Parse `POST /api/ingest` JSON flags for top-AEO-driven X search. */
export function parseTopAeoXIngestBody(body: unknown): { topAeo: TopAeoXSearchOpts | null; onlyTopAeoX: boolean } {
  if (!body || typeof body !== "object") return { topAeo: null, onlyTopAeoX: false };
  const b = body as Record<string, unknown>;
  const onlyTopAeoX = b.onlyXSearchFromTopAeo === true;
  const v = b.xSearchFromTopAeo;

  if (v === false && !onlyTopAeoX) return { topAeo: null, onlyTopAeoX: false };

  const readOpts = (o: Record<string, unknown>): TopAeoXSearchOpts => ({
    incidentLimit:
      typeof o.incidentLimit === "number" && Number.isFinite(o.incidentLimit)
        ? Math.min(50, Math.max(5, Math.floor(o.incidentLimit)))
        : 20,
    maxQueryChars:
      typeof o.maxQueryChars === "number" && Number.isFinite(o.maxQueryChars)
        ? Math.min(512, Math.max(120, Math.floor(o.maxQueryChars)))
        : 480,
  });

  if (v && typeof v === "object") {
    return { topAeo: readOpts(v as Record<string, unknown>), onlyTopAeoX };
  }
  if (v === true || onlyTopAeoX) {
    return { topAeo: { incidentLimit: 20, maxQueryChars: 480 }, onlyTopAeoX };
  }
  return { topAeo: null, onlyTopAeoX };
}

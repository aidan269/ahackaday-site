/**
 * Backfill AEO scores for incidents missing `aeo_scores`, then optionally regenerate
 * the weekly digest (topic_queue + top_patterns) so Topic Tracks populate.
 *
 * Usage (repo root, requires .env.local with SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, Anthropic):
 *   npx tsx scripts/aeo-backfill.ts
 *   npx tsx scripts/aeo-backfill.ts --dry-run
 *   npx tsx scripts/aeo-backfill.ts --limit 20 --concurrency 3
 *   npx tsx scripts/aeo-backfill.ts --recent 30
 *   npx tsx scripts/aeo-backfill.ts --recent=15 --concurrency 2
 *   npx tsx scripts/aeo-backfill.ts --recent 30 --force
 *     (re-score N most recently published rows; bypasses 7-day unchanged skip; requires --recent or --limit)
 *   npx tsx scripts/aeo-backfill.ts --digest-only
 *
 * Digest uses scores from the last 7 days (`runDigest`); newly scored rows use `scored_at = now()`
 * so they land in the window after backfill.
 *
 * Progress: after `plan`, each incident triggers an LLM call (~30–90s each). Use `--verbose` for per-row logs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pLimit from "p-limit";

import { POST as scoreIncidentPost } from "../src/app/api/aeo/score/incident/route";
import { GET as digestGet } from "../src/app/api/aeo/digest/route";
import {
  listIncidentIdsMissingAeoScores,
  listRecentIncidentIdsByPublished,
  listRecentIncidentIdsMissingAeoScores,
} from "../src/lib/aeo/backfill";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let digestOnly = false;
  let skipDigest = false;
  let verbose = false;
  let limit: number | null = null;
  let recent: number | null = null;
  let force = false;
  let concurrency = 4;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
    else if (a === "--digest-only") digestOnly = true;
    else if (a === "--no-digest") skipDigest = true;
    else if (a === "--verbose" || a === "-v") verbose = true;
    else if (a === "--limit") limit = Number(argv[++i]);
    else if (a?.startsWith("--limit=")) limit = Number(a.split("=")[1]);
    else if (a === "--recent") recent = Number(argv[++i]);
    else if (a?.startsWith("--recent=")) recent = Number(a.split("=")[1]);
    else if (a === "--concurrency") concurrency = Math.max(1, Number(argv[++i]) || 4);
    else if (a?.startsWith("--concurrency=")) concurrency = Math.max(1, Number(a.split("=")[1]) || 4);
  }
  const recentN = recent != null && Number.isFinite(recent) && recent > 0 ? Math.floor(recent) : null;
  return {
    dryRun,
    digestOnly,
    skipDigest,
    verbose,
    limit: limit != null && Number.isFinite(limit) ? limit : null,
    recent: recentN,
    force,
    concurrency,
  };
}

async function runDigestJob(secret: string): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const req = new Request("http://local/api/aeo/digest", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const res = await digestGet(req);
  const body = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok && body.ok === true, body };
}

async function main() {
  loadEnvLocal();
  /** Align with production feed when unset (backfill always targets Supabase `incidents` rows). */
  if (process.env.DATA_SOURCE === undefined) process.env.DATA_SOURCE = "supabase";

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CRON_SECRET;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!secret) {
    console.error("Missing CRON_SECRET (required for score + digest routes)");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  if (args.digestOnly) {
    console.log(JSON.stringify({ phase: "digest_only", ts: new Date().toISOString() }));
    const { ok, body } = await runDigestJob(secret);
    console.log(JSON.stringify({ ok, ...body }));
    process.exit(ok ? 0 : 1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const missing = await listIncidentIdsMissingAeoScores(supabase);

  if (args.force && args.recent == null && args.limit == null) {
    console.error("[aeo-backfill] --force requires --recent N or --limit N (caps LLM cost).");
    process.exit(1);
  }

  let queue: string[];
  let mode: string;
  if (args.force) {
    const n = args.recent ?? args.limit ?? 0;
    queue = await listRecentIncidentIdsByPublished(supabase, Math.max(1, Math.floor(n)));
    mode = "recent_published_force_rescore";
  } else if (args.recent != null) {
    queue = await listRecentIncidentIdsMissingAeoScores(supabase, args.recent);
    mode = "recent_missing";
  } else if (args.limit != null) {
    queue = missing.slice(0, args.limit);
    mode = "all_missing_capped";
  } else {
    queue = missing;
    mode = "all_missing";
  }

  console.log(
    JSON.stringify({
      phase: "plan",
      missing_total: missing.length,
      mode,
      recent_take: args.recent ?? null,
      limit: args.limit ?? null,
      force: args.force,
      queued: queue.length,
      dry_run: args.dryRun,
      concurrency: args.concurrency,
      run_digest_after: !args.skipDigest,
    }),
  );

  if (args.dryRun) {
    process.exit(0);
  }

  console.error(
    `[aeo-backfill] Scoring ${queue.length} incident(s), concurrency ${args.concurrency}. Each score calls the LLM (~30–120s). Progress updates every completion; wait for phase "scores".`,
  );

  let completed = 0;
  let failed = 0;
  let doneCount = 0;
  let sampleError: { incidentId: string; status: number; body: string } | null = null;
  const pool = pLimit(args.concurrency);

  await Promise.all(
    queue.map((incidentId) =>
      pool(async () => {
        const t0 = Date.now();
        try {
          const workerReq = new Request("http://local/api/aeo/score/incident", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ incidentId, ...(args.force ? { force: true } : {}) }),
          });
          const res = await scoreIncidentPost(workerReq);
          const ms = Date.now() - t0;
          if (res.ok) completed += 1;
          else {
            failed += 1;
            const body = await res.text();
            if (!sampleError) sampleError = { incidentId, status: res.status, body: body.slice(0, 800) };
          }
          doneCount += 1;
          const line = {
            phase: "score_item",
            incident_id: incidentId,
            ok: res.ok,
            status: res.status,
            ms,
            progress: `${doneCount}/${queue.length}`,
          };
          if (args.verbose) console.log(JSON.stringify(line));
          else
            console.error(
              `[aeo-backfill] ${doneCount}/${queue.length} ${res.ok ? "ok" : "fail"} ${incidentId.slice(0, 8)}… (${Math.round(ms / 1000)}s)`,
            );
        } catch (err) {
          failed += 1;
          doneCount += 1;
          const ms = Date.now() - t0;
          if (!sampleError)
            sampleError = {
              incidentId,
              status: 0,
              body: err instanceof Error ? err.message : String(err),
            };
          const line = {
            phase: "score_item",
            incident_id: incidentId,
            ok: false,
            ms,
            progress: `${doneCount}/${queue.length}`,
            error: err instanceof Error ? err.message : String(err),
          };
          if (args.verbose) console.log(JSON.stringify(line));
          else console.error(`[aeo-backfill] ${doneCount}/${queue.length} fail ${incidentId.slice(0, 8)}… (${Math.round(ms / 1000)}s)`);
        }
      }),
    ),
  );

  console.log(
    JSON.stringify({
      phase: "scores",
      completed,
      failed,
      sample_error: sampleError,
      ts: new Date().toISOString(),
    }),
  );

  if (!args.skipDigest) {
    const { ok, body } = await runDigestJob(secret);
    console.log(JSON.stringify({ phase: "digest", ok, ...body }));
    process.exit(failed === 0 && ok ? 0 : 1);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

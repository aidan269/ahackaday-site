/**
 * Pre-ship go/no-go checklist (Phases A–F).
 * Run from repo root:
 *   npx tsx scripts/pre-ship-go-no-go.ts
 * Requires .env.local with Supabase + CRON_SECRET + Anthropic keys; ADMIN_USER_IDS for Phase D helper checks.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { isAeoAdminUserId } from "../src/lib/aeo/admin";
import { getIncidentBySourceRowId } from "../src/lib/incidents";
import { POST as scoreIncidentPost } from "../src/app/api/aeo/score/incident/route";
import { GET as scoreCronGet } from "../src/app/api/aeo/score/cron/route";
import { GET as digestGet } from "../src/app/api/aeo/digest/route";
import { POST as dismissPost } from "../src/app/api/aeo/recommendations/[id]/dismiss/route";
import { selectActiveCorpus } from "../src/lib/aeo/score";

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

loadEnvLocal();

const SUB_MAX: Record<string, number> = {
  direct_answer: 20,
  statistics: 20,
  structure: 15,
  authority: 15,
  freshness: 15,
  topical_depth: 15,
};

function getService() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function pollCounters(supabase: ReturnType<typeof getService>) {
  const [{ count: scores }, { count: recs }, { count: failures }] = await Promise.all([
    supabase.from("aeo_scores").select("*", { count: "exact", head: true }),
    supabase.from("aeo_recommendations").select("*", { count: "exact", head: true }),
    supabase.from("aeo_score_failures").select("*", { count: "exact", head: true }),
  ]);
  const remaining = (await selectActiveCorpus({ windowDays: 30, staleAfterHours: 24 })).length;
  return {
    scores: scores ?? 0,
    recommendations: recs ?? 0,
    failures: failures ?? 0,
    remaining_active: remaining,
  };
}

async function runPhaseA(supabase: ReturnType<typeof getService>): Promise<{
  drain_ok: boolean;
  sample_ok: boolean;
  scores: number;
  recommendations: number;
  failures: number;
  remaining_active: number;
  sample_notes: string[];
}> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET required for Phase A");

  const sample_notes: string[] = [];
  let last = await pollCounters(supabase);

  while (last.remaining_active > 0) {
    if (last.failures > 0) {
      sample_notes.push(`Abort: aeo_score_failures=${last.failures}`);
      return { drain_ok: false, sample_ok: false, ...last, sample_notes };
    }

    const active = await selectActiveCorpus({ windowDays: 30, staleAfterHours: 24 });
    const batch = active.slice(0, 10);
    const queue: Promise<void>[] = [];
    let idx = 0;
    const runNext = async (): Promise<void> => {
      const i = idx++;
      if (i >= batch.length) return;
      const { id } = batch[i]!;
      const workerReq = new Request("http://local/api/aeo/score/incident", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ incidentId: id }),
      });
      await scoreIncidentPost(workerReq);
      await runNext();
    };
    await Promise.all([runNext(), runNext()]);

    last = await pollCounters(supabase);
    console.log(
      JSON.stringify({ phase: "A", batch: batch.length, ...last, ts: new Date().toISOString() }),
    );
  }

  const { data: samples } = await supabase
    .from("aeo_scores")
    .select("incident_id, total_score, sub_scores")
    .limit(500);
  const rows = samples ?? [];
  const pick = rows.length <= 3 ? rows : rows.sort(() => Math.random() - 0.5).slice(0, 3);

  let sample_ok = true;
  for (const row of pick) {
    const sub = row.sub_scores as Record<string, number>;
    const sum = Object.values(sub).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum !== row.total_score) {
      sample_ok = false;
      sample_notes.push(`total mismatch incident=${row.incident_id} sum=${sum} total=${row.total_score}`);
    }
    for (const [k, max] of Object.entries(SUB_MAX)) {
      const v = sub[k];
      if (typeof v !== "number" || v < 0 || v > max) {
        sample_ok = false;
        sample_notes.push(`sub_score out of range ${k}=${v} max=${max} incident=${row.incident_id}`);
      }
    }
    const { count: recCount } = await supabase
      .from("aeo_recommendations")
      .select("*", { count: "exact", head: true })
      .eq("incident_id", row.incident_id);
    if ((recCount ?? 0) < 1) {
      sample_ok = false;
      sample_notes.push(`recommendations < 1 for incident=${row.incident_id}`);
    }
  }
  if (pick.length === 0) {
    sample_ok = false;
    sample_notes.push("No aeo_scores rows to sample");
  }

  last = await pollCounters(supabase);
  return {
    drain_ok: last.remaining_active === 0 && last.failures === 0,
    sample_ok,
    ...last,
    sample_notes,
  };
}

async function runPhaseB(): Promise<{ queued: number; failed: number; idempotent_ok: boolean }> {
  const secret = process.env.CRON_SECRET!;
  const req = new Request("http://local/api/aeo/score/cron", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const res = await scoreCronGet(req);
  const body = (await res.json()) as { queued?: number; failed?: number };
  const queued = body.queued ?? 0;
  const failed = body.failed ?? 0;
  /** After full drain, expect empty corpus; allow ≤1 if a row crossed stale window mid-run. */
  return {
    queued,
    failed,
    idempotent_ok: failed === 0 && queued <= 1,
  };
}

async function runPhaseC(supabase: ReturnType<typeof getService>): Promise<{
  week_start?: string;
  pages_scored?: number;
  avg_score?: number;
  top_patterns_len: number;
  topic_queue_len: number;
  persisted_ok: boolean;
}> {
  const secret = process.env.CRON_SECRET!;
  const req = new Request("http://local/api/aeo/digest", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const res = await digestGet(req);
  const j = (await res.json()) as {
    ok?: boolean;
    week_start?: string;
    pages_scored?: number;
    avg_score?: number;
  };
  if (!j.ok || !j.week_start) {
    return { top_patterns_len: 0, topic_queue_len: 0, persisted_ok: false };
  }
  const { data: row } = await supabase.from("aeo_digests").select("*").eq("week_start", j.week_start).maybeSingle();
  const top = (row?.top_patterns as unknown[]) ?? [];
  const tq = (row?.topic_queue as unknown[]) ?? [];
  const topLen = top.length;
  const tqLen = tq.length;
  return {
    week_start: j.week_start,
    pages_scored: j.pages_scored,
    avg_score: typeof j.avg_score === "number" ? j.avg_score : undefined,
    top_patterns_len: topLen,
    topic_queue_len: tqLen,
    persisted_ok: topLen >= 3 && topLen <= 5 && tqLen >= 5 && tqLen <= 10,
  };
}

async function runPhaseD(adminUid: string | null): Promise<{
  unauth_401: boolean;
  bogus_bearer_401: boolean;
  helper_logic_ok: boolean;
}> {
  const bogusUuid = "00000000-0000-4000-8000-000000000000";
  const helper_logic_ok = Boolean(
    adminUid &&
      process.env.ADMIN_USER_IDS?.trim() &&
      isAeoAdminUserId(adminUid) === true &&
      isAeoAdminUserId("") === false &&
      isAeoAdminUserId(bogusUuid) === false &&
      isAeoAdminUserId(null) === false,
  );

  const noAuth = new Request("http://local/api/aeo/recommendations/1/dismiss", { method: "POST" });
  const r1 = await dismissPost(noAuth, { params: Promise.resolve({ id: "1" }) });
  const unauth_401 = r1.status === 401;

  const bogus = new Request("http://local/api/aeo/recommendations/1/dismiss", {
    method: "POST",
    headers: { Authorization: "Bearer obviously-invalid-jwt-token" },
  });
  const r2 = await dismissPost(bogus, { params: Promise.resolve({ id: "1" }) });
  const bogus_bearer_401 = r2.status === 401;

  return { unauth_401, bogus_bearer_401, helper_logic_ok };
}

function parseAdminFirst(): string | null {
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

async function waitPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (r.status < 600) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

async function runPhaseE(
  supabase: ReturnType<typeof getService>,
): Promise<{
  pages_checked: number;
  dock_ok: boolean;
  score_card_ok: boolean;
  key_facts_ok: boolean;
  methodology_ok: boolean;
  details: string[];
}> {
  const details: string[] = [];
  // #region agent log
  fetch("http://127.0.0.1:7611/ingest/313d195e-8f7f-47ad-a61e-d0191ac02fa1",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"237576"},body:JSON.stringify({sessionId:"237576",runId:"phaseE-debug",hypothesisId:"H3",location:"scripts/pre-ship-go-no-go.ts:runPhaseE:start",message:"Phase E entry",data:{ts:new Date().toISOString()},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const { data: scored } = await supabase.from("aeo_scores").select("incident_id, total_score");
  const list = scored ?? [];
  if (list.length < 5) {
    return {
      pages_checked: 0,
      dock_ok: false,
      score_card_ok: false,
      key_facts_ok: false,
      methodology_ok: false,
      details: [`Not enough scored incidents for 5-page check (have ${list.length})`],
    };
  }

  const byScore = [...list].sort((a, b) => Number(b.total_score) - Number(a.total_score));
  const high = byScore[0]!;
  const low = byScore[byScore.length - 1]!;
  const midIdx = Math.floor(byScore.length / 2);
  const mid1 = byScore[midIdx]!;
  const mid2 = byScore[Math.max(0, midIdx - 1)]!;
  const idPick: string[] = [];
  const pushId = (id: string) => {
    if (!idPick.includes(id)) idPick.push(id);
  };
  pushId(high.incident_id as string);
  pushId(low.incident_id as string);
  pushId(mid1.incident_id as string);
  pushId(mid2.incident_id as string);
  const fifth =
    byScore.find((r) => !idPick.includes(r.incident_id as string)) ?? byScore[Math.min(1, byScore.length - 1)]!;
  pushId(fifth.incident_id as string);
  while (idPick.length < 5) {
    const next = byScore.find((r) => !idPick.includes(r.incident_id as string));
    if (!next) break;
    pushId(next.incident_id as string);
  }
  const slugById = new Map<string, string>();
  for (const id of idPick) {
    const incident = await getIncidentBySourceRowId(id);
    if (incident?.slug) slugById.set(id, incident.slug);
  }
  const pick = idPick.map((id) => slugById.get(id)).filter(Boolean) as string[];
  // #region agent log
  fetch("http://127.0.0.1:7611/ingest/313d195e-8f7f-47ad-a61e-d0191ac02fa1",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"237576"},body:JSON.stringify({sessionId:"237576",runId:"phaseE-debug",hypothesisId:"H3",location:"scripts/pre-ship-go-no-go.ts:runPhaseE:pick",message:"Selected slugs for render checks",data:{pick,idCount:idPick.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (pick.length < 5) {
    return {
      pages_checked: 0,
      dock_ok: false,
      score_card_ok: false,
      key_facts_ok: false,
      methodology_ok: false,
      details: [`Could not resolve 5 incident slugs (have ${pick.length})`],
    };
  }

  if (!existsSync(resolve(process.cwd(), ".next/BUILD_ID"))) {
    details.push("Running npm run build (no .next/BUILD_ID)…");
    const b = spawn("npm", ["run", "build"], { cwd: process.cwd(), stdio: "inherit" });
    const code = await new Promise<number>((res) => b.on("close", res));
    if (code !== 0) {
      details.push(`npm run build failed with exit ${code}`);
      return { pages_checked: 0, dock_ok: false, score_card_ok: false, key_facts_ok: false, methodology_ok: false, details };
    }
  }

  const proc = spawn("npm", ["run", "start", "--", "-p", "3500"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "3500" },
    stdio: "pipe",
  });
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    proc.kill("SIGTERM");
  };

  try {
    const up = await waitPort(3500, 120_000);
    // #region agent log
    fetch("http://127.0.0.1:7611/ingest/313d195e-8f7f-47ad-a61e-d0191ac02fa1",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"237576"},body:JSON.stringify({sessionId:"237576",runId:"phaseE-debug",hypothesisId:"H1",location:"scripts/pre-ship-go-no-go.ts:runPhaseE:serverReady",message:"next start readiness result",data:{up},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!up) {
      details.push("next start did not become ready on :3500");
      return { pages_checked: 0, dock_ok: false, score_card_ok: false, key_facts_ok: false, methodology_ok: false, details };
    }

    let pages_checked = 0;
    let dock_ok = true;
    let score_card_ok = true;
    let key_facts_ok = true;

    for (const slug of pick) {
      const url = `http://127.0.0.1:3500/incident/${slug}`;
      const res = await fetch(url);
      const html = await res.text();
      // #region agent log
      fetch("http://127.0.0.1:7611/ingest/313d195e-8f7f-47ad-a61e-d0191ac02fa1",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"237576"},body:JSON.stringify({sessionId:"237576",runId:"phaseE-debug",hypothesisId:"H5",location:"scripts/pre-ship-go-no-go.ts:runPhaseE:pageFetchShape",message:"Fetched incident page with shape stats",data:{slug,status:res.status,ok:res.ok,contentType:res.headers.get("content-type"),length:html.length,hasNextFlight:html.includes("__next_f"),hasScriptTag:html.includes("<script"),hasMainTag:html.includes("<main"),hasBodyTag:html.includes("<body"),headSnippet:html.slice(0,240),tailSnippet:html.slice(Math.max(0, html.length - 240))},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!res.ok) {
        details.push(`${slug}: HTTP ${res.status}`);
        dock_ok = false;
        score_card_ok = false;
        key_facts_ok = false;
        continue;
      }
      pages_checked += 1;
      const checks: [string, boolean][] = [
        ['dock', html.includes('id="grace-ops-dock"') && html.includes('<section class="ops"')],
        ['tabs', html.includes('role="tablist"') && html.includes("Content") && html.includes("Triage")],
        ['score_card', html.includes("content-score__sub") && /\d/.test(html)],
        ['edits', html.includes("content-rec-card") || html.includes("<details")],
        ['triage_tab', html.includes("ops__tab")],
        ['detail_body', html.includes('class="detail__body"')],
        [
          'detail_title',
          html.includes('class="incident__title"') ||
            html.includes('class="detail__title"'),
        ],
        ['methodology_link', html.includes("/about/methodology")],
      ];
      // #region agent log
      fetch("http://127.0.0.1:7611/ingest/313d195e-8f7f-47ad-a61e-d0191ac02fa1",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"237576"},body:JSON.stringify({sessionId:"237576",runId:"phaseE-debug",hypothesisId:"H2",location:"scripts/pre-ship-go-no-go.ts:runPhaseE:checks",message:"HTML marker check results",data:{slug,checks:Object.fromEntries(checks)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      for (const [name, ok] of checks) {
        if (!ok) details.push(`${slug}: missing ${name}`);
      }
      dock_ok &&= checks[0]![1] && checks[1]![1];
      score_card_ok &&= checks[2]![1];
      key_facts_ok &&= checks[5]![1];
    }

    const meth = await fetch("http://127.0.0.1:3500/about/methodology");
    const methHtml = await meth.text();
    const methodology_ok = meth.ok && methHtml.includes("<h1>Editorial methodology</h1>");
    // #region agent log
    fetch("http://127.0.0.1:7611/ingest/313d195e-8f7f-47ad-a61e-d0191ac02fa1",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"237576"},body:JSON.stringify({sessionId:"237576",runId:"phaseE-debug",hypothesisId:"H4",location:"scripts/pre-ship-go-no-go.ts:runPhaseE:methodology",message:"Methodology page check",data:{status:meth.status,ok:meth.ok,length:methHtml.length,hasNextFlight:methHtml.includes("__next_f"),hasText:methHtml.includes("Editorial methodology"),snippet:methHtml.slice(0,180),tailSnippet:methHtml.slice(Math.max(0, methHtml.length - 180)),methodology_ok},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return { pages_checked, dock_ok, score_card_ok, key_facts_ok, methodology_ok, details };
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function main() {
  const supabase = getService();
  const adminUid = parseAdminFirst();

  const backfill = await runPhaseA(supabase);

  const cron_idempotency = await runPhaseB();

  const digest = await runPhaseC(supabase);

  const admin_gate = await runPhaseD(adminUid);

  const page_render = await runPhaseE(supabase);

  const blockers: string[] = [];
  if (!backfill.drain_ok) blockers.push("A: drain or failures");
  if (!backfill.sample_ok) blockers.push(`A: sample ${backfill.sample_notes.join("; ")}`);
  if (!cron_idempotency.idempotent_ok) blockers.push("B: cron not idempotent clean");
  if (!digest.persisted_ok) blockers.push("C: digest persistence or shape");
  if (!admin_gate.unauth_401) blockers.push("D: missing 401 without bearer");
  if (!admin_gate.bogus_bearer_401) blockers.push("D: bogus bearer not 401");
  if (!admin_gate.helper_logic_ok) blockers.push("D: isAeoAdminUserId / ADMIN_USER_IDS");
  if (page_render.pages_checked < 5) blockers.push(`E: only ${page_render.pages_checked} pages OK`);
  if (!page_render.dock_ok || !page_render.score_card_ok || !page_render.key_facts_ok || !page_render.methodology_ok) {
    blockers.push(`E: render checks ${page_render.details.slice(0, 5).join("; ")}`);
  }

  const shipOk =
    blockers.length === 0 && backfill.failures === 0 && page_render.pages_checked >= 5 && backfill.drain_ok && backfill.sample_ok;

  const out: Record<string, unknown> = {
    backfill: {
      scores: backfill.scores,
      recommendations: backfill.recommendations,
      failures: backfill.failures,
      remaining_active: backfill.remaining_active,
      drain_ok: backfill.drain_ok && backfill.sample_ok,
    },
    cron_idempotency,
    digest: {
      week_start: digest.week_start,
      pages_scored: digest.pages_scored,
      avg_score: digest.avg_score,
      top_patterns_len: digest.top_patterns_len,
      topic_queue_len: digest.topic_queue_len,
      persisted_ok: digest.persisted_ok,
    },
    admin_gate,
    page_render: {
      pages_checked: page_render.pages_checked,
      dock_ok: page_render.dock_ok,
      score_card_ok: page_render.score_card_ok,
      key_facts_ok: page_render.key_facts_ok,
      methodology_ok: page_render.methodology_ok,
    },
    verdict: shipOk ? "safe-to-ship" : "no-go",
  };
  if (!shipOk) out.blockers = blockers;

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

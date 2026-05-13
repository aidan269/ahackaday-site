/**
 * AEO score for the incident whose `source_url` matches (e.g. an ingested X status link).
 * Loads `.env.local` when present. Uses `CRON_SECRET` like other cron-backed routes.
 *
 *   npx tsx scripts/aeo-score-source-url.ts
 *   npx tsx scripts/aeo-score-source-url.ts "https://x.com/…/status/…"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { POST as scoreIncidentPost } from "../src/app/api/aeo/score/incident/route";

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

async function main() {
  loadEnvLocal();
  const sourceUrl = (process.argv[2] ?? "https://x.com/p_misirov/status/2054256309986545763").trim();
  const baseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CRON_SECRET?.trim();
  if (!baseUrl || !key) {
    console.error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!secret) {
    console.error("Missing CRON_SECRET");
    process.exit(1);
  }

  const sb = createClient(baseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.from("incidents").select("id").eq("source_url", sourceUrl).maybeSingle();
  if (error) {
    console.error("Supabase:", error.message);
    process.exit(1);
  }
  if (!data?.id) {
    console.error("No incident with source_url:", sourceUrl);
    process.exit(1);
  }

  const req = new Request("http://local/api/aeo/score/incident", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ incidentId: data.id, force: true }),
  });
  const res = await scoreIncidentPost(req);
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

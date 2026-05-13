/**
 * Targeted ingest: one or more X status URLs via tweet-by-id lookup (`POST /api/ingest` with `xStatusUrls`).
 * Loads `.env.local` when present (CRON_SECRET, Supabase, Anthropic, X bearer).
 *
 * Usage (repo root):
 *   npx tsx scripts/ingest-x-status-url.ts
 *   npx tsx scripts/ingest-x-status-url.ts "https://x.com/p_misirov/status/123"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { POST as ingestPost } from "../src/app/api/ingest/route";

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

const DEFAULT_URL = "https://x.com/p_misirov/status/2054256309986545763";

async function main() {
  loadEnvLocal();
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("Missing CRON_SECRET (set in .env.local or environment).");
    process.exit(1);
  }

  const statusUrl = (process.argv[2] ?? DEFAULT_URL).trim();
  const req = new Request("http://localhost/internal/api/ingest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      xStatusUrls: [statusUrl],
      onlyXStatusUrls: true,
    }),
  });

  const res = await ingestPost(req);
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

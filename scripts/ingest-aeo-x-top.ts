/**
 * Ingest X recent search using keywords derived from highest-AEO-scored AHackaday incidents.
 * Loads `.env.local` when present. Skips RSS / default X query / Cantina for this run.
 *
 *   npm run ingest:aeo-x
 *   npx tsx scripts/ingest-aeo-x-top.ts
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

async function main() {
  loadEnvLocal();
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("Missing CRON_SECRET");
    process.exit(1);
  }

  const req = new Request("http://localhost/internal/api/ingest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      onlyXSearchFromTopAeo: true,
      xSearchFromTopAeo: true,
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

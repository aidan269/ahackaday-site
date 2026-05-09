import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("migration defines aeo_scores.incident_id as uuid FK to incidents", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260507000000_aeo_tables.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /incident_id uuid not null primary key references public\.incidents/i);
  assert.match(sql, /on delete cascade/i);
});

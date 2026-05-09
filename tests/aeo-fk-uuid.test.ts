import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("aeo_recommendations cascade from aeo_scores", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260507000000_aeo_tables.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /references public\.aeo_scores \(incident_id\) on delete cascade/i);
});

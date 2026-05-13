import assert from "node:assert/strict";
import test from "node:test";

import { buildOrQueryFromKeywords, parseTopAeoXIngestBody } from "../src/lib/ingest-x-aeo-query";

test("buildOrQueryFromKeywords OR-joins and adds suffix", () => {
  const q = buildOrQueryFromKeywords(["CVE-2024-1111", "ransomware", "exchange"], 200);
  assert.ok(q.includes("CVE-2024-1111"));
  assert.ok(q.includes(" OR "));
  assert.ok(q.endsWith(" lang:en -is:retweet"));
});

test("parseTopAeoXIngestBody handles flags", () => {
  assert.deepEqual(parseTopAeoXIngestBody(null), { topAeo: null, onlyTopAeoX: false });
  assert.deepEqual(parseTopAeoXIngestBody({ xSearchFromTopAeo: true }), {
    topAeo: { incidentLimit: 20, maxQueryChars: 480 },
    onlyTopAeoX: false,
  });
  assert.deepEqual(parseTopAeoXIngestBody({ onlyXSearchFromTopAeo: true }), {
    topAeo: { incidentLimit: 20, maxQueryChars: 480 },
    onlyTopAeoX: true,
  });
  const o = parseTopAeoXIngestBody({ xSearchFromTopAeo: { incidentLimit: 12, maxQueryChars: 300 } });
  assert.deepEqual(o.topAeo, { incidentLimit: 12, maxQueryChars: 300 });
});

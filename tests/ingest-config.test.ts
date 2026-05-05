import assert from "node:assert/strict";
import test from "node:test";

import { loadIngestFeeds } from "../src/lib/ingest-config";

const originalIngestFeedsEnv = process.env.INGEST_FEEDS;

test("default ingest feeds include Cantina", () => {
  delete process.env.INGEST_FEEDS;
  const feeds = loadIngestFeeds();
  const cantina = feeds.find((feed) => feed.source === "Cantina");
  assert.ok(cantina);
  assert.equal(cantina?.url, "https://cantina.security/feed/");
  assert.equal(cantina?.enabled, undefined);
});

test.after(() => {
  if (typeof originalIngestFeedsEnv === "string") {
    process.env.INGEST_FEEDS = originalIngestFeedsEnv;
  } else {
    delete process.env.INGEST_FEEDS;
  }
});

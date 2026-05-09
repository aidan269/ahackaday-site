import assert from "node:assert/strict";
import test from "node:test";

import { isIngestXCantinaTimelineConfigured, isIngestXSearchConfigured } from "../src/lib/ingest-config";
import { DEFAULT_CANTINA_X_USERNAME, fetchIngestXCantinaUserTimeline, fetchIngestXTweets } from "../src/lib/ingest-x-tweets";

const envKeys = [
  "X_BEARER_TOKEN",
  "TWITTER_BEARER_TOKEN",
  "INGEST_X_QUERY",
  "INGEST_X_ENABLED",
  "INGEST_X_MAX_RESULTS",
  "INGEST_X_SOURCE_NAME",
  "INGEST_X_CANTINA_ENABLED",
  "INGEST_X_CANTINA_USERNAME",
  "INGEST_X_CANTINA_MAX_RESULTS",
  "INGEST_X_CANTINA_SOURCE_NAME",
] as const;

const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

test.before(() => {
  for (const k of envKeys) {
    snapshot[k] = process.env[k];
  }
});

test.after(() => {
  for (const k of envKeys) {
    const v = snapshot[k];
    if (typeof v === "string") process.env[k] = v;
    else delete process.env[k];
  }
});

test("fetchIngestXTweets maps tweets to FeedItem permalinks", async () => {
  delete process.env.TWITTER_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = "test-bearer";
  process.env.INGEST_X_QUERY = "test lang:en -is:retweet";
  delete process.env.INGEST_X_ENABLED;

  const payload = {
    data: [
      {
        id: "123",
        text: "CVE-2099-1 discussed in thread.",
        author_id: "u1",
        created_at: "2026-05-05T12:00:00.000Z",
      },
    ],
    includes: {
      users: [{ id: "u1", username: "infosec_ai" }],
    },
    meta: { result_count: 1 },
  };

  const mockFetch: typeof fetch = async (input) => {
    assert.ok(String(input).includes("api.x.com/2/tweets/search/recent"));
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await fetchIngestXTweets(mockFetch);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.link, "https://x.com/infosec_ai/status/123");
  assert.equal(result.items[0]?.description, "CVE-2099-1 discussed in thread.");
  assert.ok(result.items[0]?.title.includes("CVE-2099"));
});

test("fetchIngestXTweets errors when bearer missing", async () => {
  delete process.env.X_BEARER_TOKEN;
  delete process.env.TWITTER_BEARER_TOKEN;
  process.env.INGEST_X_QUERY = "x";

  const result = await fetchIngestXTweets(fetch);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error.includes("BEARER"));
});

test("isIngestXSearchConfigured respects bearer, query, and INGEST_X_ENABLED", () => {
  delete process.env.X_BEARER_TOKEN;
  delete process.env.TWITTER_BEARER_TOKEN;
  delete process.env.INGEST_X_QUERY;
  delete process.env.INGEST_X_ENABLED;
  assert.equal(isIngestXSearchConfigured(), false);

  process.env.X_BEARER_TOKEN = "b";
  assert.equal(isIngestXSearchConfigured(), false);

  process.env.INGEST_X_QUERY = "cyber lang:en";
  assert.equal(isIngestXSearchConfigured(), true);

  process.env.INGEST_X_ENABLED = "false";
  assert.equal(isIngestXSearchConfigured(), false);

  process.env.INGEST_X_ENABLED = "1";
  assert.equal(isIngestXSearchConfigured(), true);
});

test("fetchIngestXCantinaUserTimeline maps user tweets with default handle", async () => {
  delete process.env.TWITTER_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = "test-bearer";
  delete process.env.INGEST_X_CANTINA_USERNAME;
  delete process.env.INGEST_X_ENABLED;

  const userPayload = { data: { id: "uid42", username: "cantinasecurity" } };
  const tweetsPayload = {
    data: [
      {
        id: "888",
        text: "Shipped a new bounty workflow.",
        created_at: "2026-05-05T15:00:00.000Z",
      },
    ],
    meta: { result_count: 1 },
  };

  const mockFetch: typeof fetch = async (input) => {
    const u = String(input);
    if (u.includes(`/users/by/username/${DEFAULT_CANTINA_X_USERNAME}`)) {
      return new Response(JSON.stringify(userPayload), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (u.includes("/users/uid42/tweets")) {
      assert.ok(u.includes("exclude=retweets"));
      return new Response(JSON.stringify(tweetsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    assert.fail(`unexpected fetch URL: ${u}`);
  };

  const result = await fetchIngestXCantinaUserTimeline(mockFetch);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.username, DEFAULT_CANTINA_X_USERNAME);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.link, "https://x.com/cantinasecurity/status/888");
  assert.equal(result.items[0]?.sourceName, "Cantina (X)");
});

test("isIngestXCantinaTimelineConfigured respects bearer and toggles", () => {
  delete process.env.X_BEARER_TOKEN;
  delete process.env.TWITTER_BEARER_TOKEN;
  delete process.env.INGEST_X_ENABLED;
  delete process.env.INGEST_X_CANTINA_ENABLED;
  assert.equal(isIngestXCantinaTimelineConfigured(), false);

  process.env.X_BEARER_TOKEN = "b";
  assert.equal(isIngestXCantinaTimelineConfigured(), true);

  process.env.INGEST_X_CANTINA_ENABLED = "false";
  assert.equal(isIngestXCantinaTimelineConfigured(), false);

  delete process.env.INGEST_X_CANTINA_ENABLED;
  process.env.INGEST_X_ENABLED = "no";
  assert.equal(isIngestXCantinaTimelineConfigured(), false);
});

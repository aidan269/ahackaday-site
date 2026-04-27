import test from "node:test";
import assert from "node:assert/strict";

import { parseFeedItems } from "../src/lib/ingest-feed-parse";

const rssXml = `<?xml version="1.0"?>
<rss><channel>
<item>
<title>Hello &amp; world</title>
<link>https://ex.test/a</link>
<description>Desc one</description>
<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
</item>
<item><title>Two</title><link>https://ex.test/b</link><description></description><pubDate></pubDate></item>
</channel></rss>`;

const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>Atom post</title>
<link rel="alternate" type="text/html" href="https://ex.test/atom-1" />
<updated>2024-01-15T10:00:00Z</updated>
<summary>Summary line</summary>
</entry>
<entry>
<title>Second</title>
<link href="https://ex.test/alt" />
<updated>2024-01-16T10:00:00Z</updated>
</entry>
</feed>`;

test("parses RSS items and respects itemLimit", () => {
  const items = parseFeedItems(rssXml, "Test", 1);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.link, "https://ex.test/a");
  assert.equal(items[0]!.sourceName, "Test");
});

test("parses Atom when no RSS items", () => {
  const items = parseFeedItems(atomXml, "AtomSrc", 10);
  assert.equal(items.length, 2);
  assert.equal(items[0]!.link, "https://ex.test/atom-1");
  assert.equal(items[0]!.title, "Atom post");
  assert.ok(items[0]!.description.includes("Summary"));
});

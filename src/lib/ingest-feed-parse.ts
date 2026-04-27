import type { IngestFeedConfig } from "@/lib/ingest-config";

export type FeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  sourceName: string;
};

function readTag(block: string, tag: string): string {
  const exact = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (exact?.[1]) return exact[1].trim();

  const cdata = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
    "i",
  ).exec(block);
  if (cdata?.[1]) return cdata[1].trim();

  return "";
}

function readAtomTagWithType(block: string, tag: "summary" | "content"): string {
  const re = new RegExp(
    `<${tag}[^>]*type=["']html["'][^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  const html = re.exec(block)?.[1];
  if (html) return html.trim();
  return readTag(block, tag);
}

function stripTags(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml: string, sourceName: string): FeedItem[] {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return itemMatches
    .map((match) => match[1] ?? "")
    .map((block) => ({
      title: stripTags(readTag(block, "title")),
      link: stripTags(readTag(block, "link")),
      description: stripTags(readTag(block, "description")),
      pubDate: stripTags(readTag(block, "pubDate") || readTag(block, "dc:date")),
      sourceName,
    }))
    .filter((item) => item.title && item.link);
}

/** Prefer rel=alternate html link, then any href, then <id> if it looks like a URL */
function readAtomEntryLinkAndId(block: string): { link: string; id: string } {
  const id = stripTags(readTag(block, "id"));
  const links = [...block.matchAll(/<link\s+([^>]+)\/?>/gi)];
  for (const m of links) {
    const attrs = m[1] ?? "";
    const rel = /rel=["']([^"']*)["']/.exec(attrs);
    const href = /href=["']([^"']+)["']/.exec(attrs);
    if (href?.[1] && rel?.[1] && /alternate|self|related/i.test(rel[1]) && !/^urn:/.test(href[1])) {
      return { link: href[1].trim(), id };
    }
  }
  for (const m of links) {
    const attrs = m[1] ?? "";
    const href = /href=["']([^"']+)["']/.exec(attrs);
    if (href?.[1] && !/^urn:/.test(href[1])) {
      return { link: href[1].trim(), id };
    }
  }
  if (/^https?:\/\//i.test(id)) {
    return { link: id, id };
  }
  return { link: "", id };
}

function parseAtomItems(xml: string, sourceName: string): FeedItem[] {
  const entryMatches = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
  return entryMatches
    .map((match) => match[1] ?? "")
    .map((block) => {
      const title = stripTags(readTag(block, "title")) || "Untitled";
      const { link, id } = readAtomEntryLinkAndId(block);
      const href = link || id;
      const desc =
        stripTags(readAtomTagWithType(block, "content")) ||
        stripTags(readAtomTagWithType(block, "summary")) ||
        "";
      const pubDate =
        stripTags(readTag(block, "updated")) || stripTags(readTag(block, "published")) || "";
      return { title, link: href, description: desc, pubDate, sourceName };
    })
    .filter((item) => item.title && item.link);
}

/**
 * Parse RSS `<item>` or Atom `<entry>`; returns up to `itemLimit` items.
 */
export function parseFeedItems(xml: string, sourceName: string, itemLimit: number): FeedItem[] {
  const rss = parseRssItems(xml, sourceName);
  if (rss.length > 0) {
    return rss.slice(0, itemLimit);
  }
  const atom = parseAtomItems(xml, sourceName);
  return atom.slice(0, itemLimit);
}

export function fetchFeedForConfig(
  feed: IngestFeedConfig,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; items: FeedItem[] } | { ok: false; error: string }> {
  return (async () => {
    if (feed.enabled === false) {
      return { ok: true, items: [] };
    }
    const response = await fetchImpl(feed.url, {
      headers: {
        "User-Agent": "AHackaday-Ingest/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return { ok: false, error: `Feed fetch failed for ${feed.source}: ${response.status}` };
    }

    const xml = await response.text();
    const items = parseFeedItems(xml, feed.source, feed.itemLimit);
    return { ok: true, items };
  })();
}

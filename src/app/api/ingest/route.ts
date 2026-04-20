import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  sourceName: string;
};

type ClaudeIncidentOutput = {
  summary: string;
  severity: "critical" | "high" | "medium" | "low";
};

const FEEDS = [
  {
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    source: "CISA",
  },
  { url: "https://krebsonsecurity.com/feed/", source: "KrebsOnSecurity" },
  { url: "https://www.bleepingcomputer.com/feed/", source: "BleepingComputer" },
];

function getAnthropicModel(): string {
  return (
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-3-5-sonnet-20241022"
  );
}

function fallbackFromItem(item: FeedItem): ClaudeIncidentOutput {
  const summary =
    item.description.slice(0, 280) || "Ingested from source feed (no description).";
  return { summary, severity: "medium" };
}

function readTag(block: string, tag: string): string {
  const exact = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (exact?.[1]) return exact[1].trim();

  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(block);
  if (cdata?.[1]) return cdata[1].trim();

  return "";
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
      pubDate: stripTags(readTag(block, "pubDate")),
      sourceName,
    }))
    .filter((item) => item.title && item.link);
}

function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key);
}

async function summarizeWithClaude(
  anthropic: Anthropic | null,
  item: FeedItem,
): Promise<ClaudeIncidentOutput> {
  if (!anthropic) {
    return fallbackFromItem(item);
  }

  const prompt = `You are a cybersecurity analyst producing concise incident feed entries.
Return JSON only:
{"summary":"1-2 plain-English sentences without hype","severity":"critical|high|medium|low"}

Incident:
Title: ${item.title}
Source: ${item.sourceName}
Published: ${item.pubDate}
Description: ${item.description}`;

  try {
    const response = await anthropic.messages.create({
      model: getAnthropicModel(),
      max_tokens: 220,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    let text = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(text);
    if (fence?.[1]) text = fence[1].trim();

    const parsed = JSON.parse(text) as ClaudeIncidentOutput;
    if (!parsed.summary || !parsed.severity) {
      return fallbackFromItem(item);
    }

    return parsed;
  } catch {
    return fallbackFromItem(item);
  }
}

async function fetchFeed(url: string, sourceName: string): Promise<FeedItem[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "AHackaday-Ingest/1.0",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Feed fetch failed for ${sourceName}: ${response.status}`);
  }

  const xml = await response.text();
  return parseRssItems(xml, sourceName).slice(0, 10);
}

async function runIngest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed.url, feed.source);
      for (const item of items) {
        try {
          const { data: existing, error: existsError } = await supabase
            .from("incidents")
            .select("id")
            .eq("source_url", item.link)
            .maybeSingle();

          if (existsError) {
            errors.push(`Existence check failed ${item.link}: ${existsError.message}`);
            continue;
          }
          if (existing) {
            skipped += 1;
            continue;
          }

          const ai = await summarizeWithClaude(anthropic, item);
          const { error } = await supabase.from("incidents").upsert(
            {
              title: item.title,
              source_url: item.link,
              source_name: item.sourceName,
              raw_content: item.description,
              claude_summary: ai.summary,
              severity: ai.severity,
              published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            },
            {
              onConflict: "source_url",
              ignoreDuplicates: false,
            },
          );

          if (error) {
            if (error.message.includes("duplicate key value")) {
              skipped += 1;
            } else {
              errors.push(`Upsert failed for ${item.link}: ${error.message}`);
            }
          } else {
            inserted += 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Item failed ${item.link}: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Feed failed ${feed.source}: ${message}`);
    }
  }

  return Response.json({
    ok: true,
    inserted,
    skipped,
    errors,
    model: process.env.ANTHROPIC_API_KEY ? getAnthropicModel() : null,
  });
}

export async function GET(request: Request) {
  return runIngest(request);
}

export async function POST(request: Request) {
  return runIngest(request);
}

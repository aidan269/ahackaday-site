import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

import { getAnthropicModel } from "@/lib/anthropic-model";
import { decodeHtmlEntities, stripInvisibleUnicode } from "@/lib/html-entities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  sourceName: string;
};

type IngestItem = FeedItem & {
  fullText: string;
};

type ClaudeIncidentOutput = {
  tldr: string;
  realWorldImpact: string;
  whyCare: string;
  actionItems: string[];
  iocs: string[];
  evidence: {
    packages: string[];
    versions: string[];
    cves: string[];
    dates: string[];
    systems: string[];
  };
  ambiguities: string[];
  confidenceScore: number;
  exploited: boolean;
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

function fallbackFromItem(item: IngestItem): ClaudeIncidentOutput {
  const tldr =
    item.fullText.slice(0, 280) || item.description.slice(0, 280) || "Ingested from source feed (no description).";
  return {
    tldr,
    realWorldImpact: `The incident may affect systems related to ${item.title}. Source details are limited.`,
    whyCare: "Why this matters: validate whether this touches your environment before deprioritizing it.",
    actionItems: [
      "Check if affected software or systems exist in your stack.",
      "Review source advisory details and patch guidance.",
    ],
    iocs: [],
    evidence: { packages: [], versions: [], cves: [], dates: [], systems: [] },
    ambiguities: ["Source did not provide enough concrete technical detail for full extraction."],
    confidenceScore: 0.45,
    exploited: false,
    severity: "medium",
  };
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function htmlToText(value: string): string {
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(stripInvisibleUnicode(decodeHtmlEntities(stripped)));
}

function extractArticleLikeHtml(html: string): string {
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  if (article) return article;

  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1];
  if (main) return main;

  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1];
  return body ?? html;
}

async function fetchFullArticleText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "AHackaday-Ingest/1.0 (+article-fetch)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Article fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const primaryBlock = extractArticleLikeHtml(html);

  // Prefer sentence-rich paragraph/list text from main content blocks.
  const chunkMatches = [
    ...primaryBlock.matchAll(/<(?:p|li|h1|h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:p|li|h1|h2|h3|h4)>/gi),
  ];

  const chunkText = chunkMatches
    .map((match) => htmlToText(match[1] ?? ""))
    .filter((line) => line.length >= 40)
    .join("\n");

  const fallbackText = htmlToText(primaryBlock);
  const text = normalizeWhitespace(chunkText || fallbackText);
  return text.slice(0, 16000);
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
  item: IngestItem,
): Promise<ClaudeIncidentOutput> {
  if (!anthropic) {
    return fallbackFromItem(item);
  }

  const prompt = `Read the full page and return JSON only.
No markdown. No prose outside JSON.
Use this exact schema:
{
  "tldr":"1-2 sentences on what happened",
  "realWorldImpact":"what it does, who is affected, blast radius, speed",
  "whyCare":"developer/defender stakes in plain language",
  "actionItems":["priority ordered concrete actions"],
  "iocs":["cves, hashes, domains, package names, versions, indicators"],
  "evidence":{"packages":[],"versions":[],"cves":[],"dates":[],"systems":[]},
  "ambiguities":["what is uncertain or unconfirmed"],
  "confidenceScore":0.0,
  "exploited":false,
  "severity":"critical|high|medium|low"
}
Rules:
- Dense and skimmable, no fluff.
- If detail is missing, say so in ambiguities.
- Keep realWorldImpact and whyCare semantically distinct.
- For high/critical, actionItems must be non-empty.
- confidenceScore must be 0-1.

Incident:
Title: ${item.title}
Source: ${item.sourceName}
Published: ${item.pubDate}
Description: ${item.description}
Article text:
${item.fullText.slice(0, 12000)}`;

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
    if (!parsed.tldr || !parsed.realWorldImpact || !parsed.whyCare || !parsed.severity) {
      return fallbackFromItem(item);
    }

    return validateStructuredOutput(parsed);
  } catch {
    return fallbackFromItem(item);
  }
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);
}

function validateStructuredOutput(output: ClaudeIncidentOutput): ClaudeIncidentOutput {
  const actionItems = normalizeStringArray(output.actionItems);
  const iocs = normalizeStringArray(output.iocs);
  const ambiguities = normalizeStringArray(output.ambiguities);
  const evidence = output.evidence ?? {
    packages: [],
    versions: [],
    cves: [],
    dates: [],
    systems: [],
  };
  const normalized = {
    ...output,
    tldr: output.tldr.replace(/\s+/g, " ").trim(),
    realWorldImpact: output.realWorldImpact.replace(/\s+/g, " ").trim(),
    whyCare: output.whyCare.replace(/\s+/g, " ").trim(),
    actionItems,
    iocs,
    ambiguities,
    evidence: {
      packages: normalizeStringArray(evidence.packages),
      versions: normalizeStringArray(evidence.versions),
      cves: normalizeStringArray(evidence.cves),
      dates: normalizeStringArray(evidence.dates),
      systems: normalizeStringArray(evidence.systems),
    },
    confidenceScore: Math.min(1, Math.max(0, Number(output.confidenceScore ?? 0.55))),
  };

  const impactLower = normalized.realWorldImpact.toLowerCase();
  const whyCareLower = normalized.whyCare.toLowerCase();
  const exploitSignal = /(actively )?exploited|in the wild|under active exploitation/.test(
    `${normalized.tldr} ${normalized.realWorldImpact}`.toLowerCase(),
  );
  const zeroDaySignal = /zero-day|0-day/.test(`${normalized.tldr} ${normalized.realWorldImpact}`.toLowerCase());

  if ((normalized.severity === "high" || normalized.severity === "critical") && normalized.actionItems.length === 0) {
    normalized.actionItems = [
      "Confirm affected systems in your environment immediately.",
      "Apply vendor mitigation guidance and monitor active exploitation updates.",
    ];
  }
  if (impactLower === whyCareLower || impactLower.includes(whyCareLower) || whyCareLower.includes(impactLower)) {
    normalized.ambiguities.push("Impact and why-care content were highly similar and may need editorial review.");
  }
  if (zeroDaySignal && !exploitSignal) {
    normalized.severity = normalized.severity === "critical" ? "high" : normalized.severity;
    normalized.ambiguities.push("Zero-day wording found without explicit exploitation evidence.");
  }
  if (normalized.exploited && !exploitSignal) {
    normalized.exploited = false;
    normalized.ambiguities.push("Exploited flag removed due to missing explicit exploitation signal.");
  }
  return normalized;
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

          let fullText = item.description;
          try {
            fullText = await fetchFullArticleText(item.link);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`Article fetch fallback ${item.link}: ${message}`);
          }

          const ingestItem: IngestItem = {
            ...item,
            fullText: fullText || item.description,
          };

          const ai = await summarizeWithClaude(anthropic, ingestItem);
          const { error } = await supabase.from("incidents").upsert(
            {
              title: item.title,
              source_url: item.link,
              source_name: item.sourceName,
              raw_content: ingestItem.fullText,
              claude_summary: JSON.stringify(ai),
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

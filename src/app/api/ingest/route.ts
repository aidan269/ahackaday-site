import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";

import { getAnthropicModel } from "@/lib/anthropic-model";
import {
  getIngestMaxNewPerRun,
  isIngestXCantinaTimelineConfigured,
  isIngestXSearchConfigured,
  loadIngestFeeds,
} from "@/lib/ingest-config";
import { fetchFeedForConfig, type FeedItem } from "@/lib/ingest-feed-parse";
import {
  DEFAULT_CANTINA_X_USERNAME,
  fetchIngestXCantinaUserTimeline,
  fetchIngestXTweets,
} from "@/lib/ingest-x-tweets";
import { decodeHtmlEntities, stripInvisibleUnicode } from "@/lib/html-entities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

type PerFeedReport = {
  source: string;
  url: string;
  itemLimit: number;
  enabled: boolean;
  itemsFetched: number;
  inserted: number;
  skippedExisting: number;
  newProcessingErrors: number;
  skipped: boolean;
  skipNote?: string;
};

type IngestRunCounters = {
  newIngestsThisRun: number;
  inserted: number;
  skipped: number;
  capReached: boolean;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  claudeCalls: number;
};

function shouldSkipArticleFetch(link: string): boolean {
  try {
    const u = new URL(link);
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    return h === "x.com" || h === "twitter.com";
  } catch {
    return false;
  }
}

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
): Promise<{
  output: ClaudeIncidentOutput;
  usage: { input: number; output: number } | null;
}> {
  if (!anthropic) {
    return { output: fallbackFromItem(item), usage: null };
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
- If the article text is very short (e.g. a social post), treat it as a signal snapshot; reflect uncertainty in ambiguities and avoid overstating impact.

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
      return { output: fallbackFromItem(item), usage: null };
    }

    const u = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    const usage =
      u && typeof u.input_tokens === "number" && typeof u.output_tokens === "number"
        ? { input: u.input_tokens, output: u.output_tokens }
        : null;

    return { output: validateStructuredOutput(parsed), usage };
  } catch {
    return { output: fallbackFromItem(item), usage: null };
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

async function resolveFullTextForIngest(item: FeedItem, errors: string[]): Promise<string> {
  let fullText = item.description;
  if (shouldSkipArticleFetch(item.link)) {
    return normalizeWhitespace(fullText || "");
  }
  try {
    fullText = await fetchFullArticleText(item.link);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Article fetch fallback ${item.link}: ${message}`);
  }
  return normalizeWhitespace(fullText || item.description || "");
}

async function tryUpsertIngestItem(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  anthropic: Anthropic | null,
  item: FeedItem,
  rep: PerFeedReport,
  counters: IngestRunCounters,
  maxNewPerRun: number,
  errors: string[],
): Promise<"break_outer" | void> {
  if (item.link.length === 0) return;

  try {
    const { data: existing, error: existsError } = await supabase
      .from("incidents")
      .select("id")
      .eq("source_url", item.link)
      .maybeSingle();

    if (existsError) {
      const msg = `Existence check failed ${item.link}: ${existsError.message}`;
      errors.push(msg);
      rep.newProcessingErrors += 1;
      return;
    }
    if (existing) {
      counters.skipped += 1;
      rep.skippedExisting += 1;
      return;
    }

    if (counters.newIngestsThisRun >= maxNewPerRun) {
      counters.capReached = true;
      return "break_outer";
    }
    counters.newIngestsThisRun += 1;

    const fullText = await resolveFullTextForIngest(item, errors);

    const ingestItem: IngestItem = {
      ...item,
      fullText: fullText || item.description,
    };

    const { output: ai, usage } = await summarizeWithClaude(anthropic, ingestItem);
    if (usage) {
      counters.claudeInputTokens += usage.input;
      counters.claudeOutputTokens += usage.output;
      counters.claudeCalls += 1;
    } else if (anthropic) {
      counters.claudeCalls += 1;
    }

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
        counters.skipped += 1;
        rep.skippedExisting += 1;
      } else {
        const msg = `Upsert failed for ${item.link}: ${error.message}`;
        errors.push(msg);
        rep.newProcessingErrors += 1;
      }
    } else {
      counters.inserted += 1;
      rep.inserted += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Item failed ${item.link}: ${message}`);
    rep.newProcessingErrors += 1;
  }
}

async function runIngest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const supabase = createSupabaseAdminClient();
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  const feeds = loadIngestFeeds();
  const maxNewPerRun = getIngestMaxNewPerRun();
  const counters: IngestRunCounters = {
    newIngestsThisRun: 0,
    inserted: 0,
    skipped: 0,
    capReached: false,
    claudeInputTokens: 0,
    claudeOutputTokens: 0,
    claudeCalls: 0,
  };
  const errors: string[] = [];
  const feedReports: PerFeedReport[] = [];

  outer: for (const feed of feeds) {
    const rep: PerFeedReport = {
      source: feed.source,
      url: feed.url,
      itemLimit: feed.itemLimit,
      enabled: feed.enabled !== false,
      itemsFetched: 0,
      inserted: 0,
      skippedExisting: 0,
      newProcessingErrors: 0,
      skipped: false,
    };
    if (feed.enabled === false) {
      rep.skipped = true;
      rep.skipNote = "disabled in config";
      feedReports.push(rep);
      continue;
    }

    const result = await fetchFeedForConfig(feed, fetch);
    if (!result.ok) {
      errors.push(result.error);
      rep.skipNote = result.error;
      feedReports.push(rep);
      continue;
    }
    const items = result.items;
    rep.itemsFetched = items.length;

    for (const item of items) {
      const br = await tryUpsertIngestItem(supabase, anthropic, item, rep, counters, maxNewPerRun, errors);
      if (br === "break_outer") {
        rep.skipNote = `cap: INGEST_MAX_NEW_PER_RUN (${maxNewPerRun}) reached`;
        feedReports.push(rep);
        break outer;
      }
    }
    feedReports.push(rep);
  }

  if (!counters.capReached && isIngestXSearchConfigured()) {
    const q = process.env.INGEST_X_QUERY?.trim() ?? "";
    const rawLimit = Number.parseInt(process.env.INGEST_X_MAX_RESULTS?.trim() ?? "10", 10);
    const itemLimit = Math.min(100, Math.max(10, Number.isFinite(rawLimit) ? rawLimit : 10));
    const xRep: PerFeedReport = {
      source: process.env.INGEST_X_SOURCE_NAME?.trim() || "X (search)",
      url: `https://api.x.com/2/tweets/search/recent?q=${encodeURIComponent(q)}`,
      itemLimit,
      enabled: true,
      itemsFetched: 0,
      inserted: 0,
      skippedExisting: 0,
      newProcessingErrors: 0,
      skipped: false,
    };
    const xResult = await fetchIngestXTweets(fetch);
    if (!xResult.ok) {
      errors.push(xResult.error);
      xRep.skipNote = xResult.error;
    } else {
      xRep.itemsFetched = xResult.items.length;
      for (const item of xResult.items) {
        const br = await tryUpsertIngestItem(supabase, anthropic, item, xRep, counters, maxNewPerRun, errors);
        if (br === "break_outer") {
          xRep.skipNote = `cap: INGEST_MAX_NEW_PER_RUN (${maxNewPerRun}) reached`;
          break;
        }
      }
    }
    feedReports.push(xRep);
  }

  if (!counters.capReached && isIngestXCantinaTimelineConfigured()) {
    const rawCantinaLimit = Number.parseInt(process.env.INGEST_X_CANTINA_MAX_RESULTS?.trim() ?? "10", 10);
    const cantinaItemLimit = Math.min(100, Math.max(5, Number.isFinite(rawCantinaLimit) ? rawCantinaLimit : 10));
    const cantinaHandle =
      process.env.INGEST_X_CANTINA_USERNAME?.trim().replace(/^@/, "").toLowerCase() ||
      DEFAULT_CANTINA_X_USERNAME;
    const cantinaRep: PerFeedReport = {
      source: process.env.INGEST_X_CANTINA_SOURCE_NAME?.trim() || "Cantina (X)",
      url: `https://api.x.com/2/users/by/username/${encodeURIComponent(cantinaHandle)}`,
      itemLimit: cantinaItemLimit,
      enabled: true,
      itemsFetched: 0,
      inserted: 0,
      skippedExisting: 0,
      newProcessingErrors: 0,
      skipped: false,
    };
    const cantinaResult = await fetchIngestXCantinaUserTimeline(fetch);
    if (!cantinaResult.ok) {
      errors.push(cantinaResult.error);
      cantinaRep.skipNote = cantinaResult.error;
    } else {
      cantinaRep.itemsFetched = cantinaResult.items.length;
      for (const item of cantinaResult.items) {
        const br = await tryUpsertIngestItem(supabase, anthropic, item, cantinaRep, counters, maxNewPerRun, errors);
        if (br === "break_outer") {
          cantinaRep.skipNote = `cap: INGEST_MAX_NEW_PER_RUN (${maxNewPerRun}) reached`;
          break;
        }
      }
    }
    feedReports.push(cantinaRep);
  }

  const durationMs = Date.now() - t0;
  if (counters.inserted > 0) {
    revalidateTag("incidents", "max");
  }
  return Response.json({
    ok: true,
    durationMs,
    inserted: counters.inserted,
    skipped: counters.skipped,
    errors,
    model: process.env.ANTHROPIC_API_KEY ? getAnthropicModel() : null,
    cap: {
      maxNewPerRun: maxNewPerRun,
      reached: counters.capReached,
      newIngestsThisRun: counters.newIngestsThisRun,
    },
    claude: {
      calls: counters.claudeCalls,
      inputTokens: counters.claudeInputTokens,
      outputTokens: counters.claudeOutputTokens,
      noApiKey: !process.env.ANTHROPIC_API_KEY,
    },
    feeds: feedReports,
  });
}

export async function GET(request: Request) {
  return runIngest(request);
}

export async function POST(request: Request) {
  return runIngest(request);
}

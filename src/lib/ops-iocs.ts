type OpsIocInput = {
  title: string;
  summary: string;
  sources: string[];
  iocs: string[];
  evidence: {
    cves: string[];
    packages: string[];
  };
};

export type OpsIocConfidence = "high" | "mid" | "low";

export type OpsIocRow = {
  value: string;
  score: number;
  confidence: OpsIocConfidence;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function extractRegex(text: string, regex: RegExp): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(regex)) {
    const value = (match[0] ?? "").trim();
    if (value) out.push(value);
  }
  return out;
}

function heuristicIocsFromText(text: string): string[] {
  const cves = extractRegex(text, /\bCVE-\d{4}-\d{4,}\b/gi);
  const ips = extractRegex(text, /\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  const urls = extractRegex(text, /\bhttps?:\/\/[^\s)]+/gi);
  const hashes = extractRegex(text, /\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b/gi);
  const domains = extractRegex(text, /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi).filter((d) => !/^https?:\/\//i.test(d));
  return [...cves, ...ips, ...urls, ...hashes, ...domains];
}

function scoreToConfidence(score: number): OpsIocConfidence {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(escaped, "gi"));
  return matches?.length ?? 0;
}

export function buildOpsIocRows(input: OpsIocInput): OpsIocRow[] {
  const joinedText = `${input.title}\n${input.summary}\n${input.sources.join("\n")}`;
  const heuristics = heuristicIocsFromText(joinedText);
  const values = unique([
    ...input.iocs,
    ...input.evidence.cves,
    ...input.evidence.packages,
    ...heuristics,
  ]);
  const lowerTitle = input.title.toLowerCase();
  const lowerSummary = input.summary.toLowerCase();
  const lowerText = joinedText.toLowerCase();

  return values
    .map((value) => {
      const lowerValue = value.toLowerCase();
      const inTopLevelIocs = input.iocs.some((v) => v.toLowerCase() === lowerValue);
      const inEvidence =
        input.evidence.cves.some((v) => v.toLowerCase() === lowerValue) ||
        input.evidence.packages.some((v) => v.toLowerCase() === lowerValue);
      const textHits = countOccurrences(lowerText, lowerValue);
      const titleHit = lowerTitle.includes(lowerValue);
      const summaryHit = lowerSummary.includes(lowerValue);

      let score = 8;
      if (inTopLevelIocs) score += 38;
      if (inEvidence) score += 32;
      score += Math.min(textHits, 3) * 8;
      if (titleHit) score += 8;
      if (summaryHit) score += 5;
      if (/^CVE-\d{4}-\d+$/i.test(value)) score += 7;
      if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(value)) score += 6;
      if (/^https?:\/\/\S+/i.test(value)) score += 5;

      score = Math.max(0, Math.min(score, 100));
      return { value, score, confidence: scoreToConfidence(score) };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildOpsIocValues(input: OpsIocInput): string[] {
  return buildOpsIocRows(input).map((row) => row.value);
}

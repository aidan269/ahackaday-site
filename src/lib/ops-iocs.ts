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

export function buildOpsIocValues(input: OpsIocInput): string[] {
  const joinedText = `${input.title}\n${input.summary}\n${input.sources.join("\n")}`;
  const heuristics = heuristicIocsFromText(joinedText);
  return unique([
    ...input.iocs,
    ...input.evidence.cves,
    ...input.evidence.packages,
    ...heuristics,
  ]);
}

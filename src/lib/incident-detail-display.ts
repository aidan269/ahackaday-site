/**
 * Incident detail page: extract byline vs lede, suppress boilerplate body copy, dedupe lede vs opening paragraph.
 */

/** First sentence or first line if no terminal punctuation found. */
export function firstSentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(?:\s+|$)/);
  if (m?.[1]) return m[1].trim();
  const line = t.split(/\n/)[0]?.trim();
  return line ?? t;
}

export function normalizeSentenceKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * CMS/authorship lines often start with "By Name, Title, Org".
 * When separated by a blank line from the lede, first block is treated as byline only.
 */
export function extractBylineFromSummary(raw: string): { byline: string | null; lede: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { byline: null, lede: "" };

  const paras = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const first = paras[0] ?? "";

  if (/^by\s+/i.test(first)) {
    if (paras.length >= 2) {
      return {
        byline: first,
        lede: paras.slice(1).join("\n\n").trim(),
      };
    }
    const multi = first.match(/^((?:By|by)\s+.+?[.!?])\s+([\s\S]{20,})$/);
    if (multi?.[1] && multi[2]) {
      return { byline: multi[1].trim(), lede: multi[2].trim() };
    }
    if (first.length < 220) {
      return { byline: first, lede: "" };
    }
  }

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && /^by\s+/i.test(lines[0] ?? "")) {
    return { byline: lines[0]!, lede: lines.slice(1).join("\n").trim() };
  }

  return { byline: null, lede: trimmed };
}

export function isBoilerplateParagraph(p: string): boolean {
  const t = p.trim();
  if (!t) return true;
  if (/The incident may affect systems related to/i.test(t)) return true;
  if (/Source details are limited/i.test(t)) return true;
  return false;
}

/** Empty-state: thin filler or headline-echo body — hide prose, keep section heads only. */
export function shouldSuppressAllBodyText(bodyPlain: string, headline: string): boolean {
  const flat = bodyPlain.replace(/\s+/g, " ").trim();
  if (!flat) return true;
  if (flat.length < 200) return true;
  const hn = headline.trim();
  if (hn.length >= 12 && flat.toLowerCase().includes(hn.toLowerCase())) return true;
  return false;
}

export function filterBodyParagraphs(
  paragraphs: string[],
  headline: string,
  ledeFirstSentence: string,
): string[] {
  const joined = paragraphs.join("\n\n");
  if (shouldSuppressAllBodyText(joined, headline)) {
    return [];
  }

  const ledeKey = normalizeSentenceKey(ledeFirstSentence);
  let seenFirstNonBoilerplate = false;
  const out: string[] = [];

  for (const raw of paragraphs) {
    const t = raw.trim();
    if (!t) continue;
    if (isBoilerplateParagraph(t)) continue;

    if (
      !seenFirstNonBoilerplate
      && ledeKey.length >= 12
      && normalizeSentenceKey(firstSentence(t)) === ledeKey
    ) {
      seenFirstNonBoilerplate = true;
      continue;
    }

    seenFirstNonBoilerplate = true;
    out.push(t);
  }

  return out;
}

export type IncidentBodySection = { h: string; p: string };

export function filterIncidentBodySections(
  sections: IncidentBodySection[],
  headline: string,
  ledeFirstSentence: string,
): IncidentBodySection[] {
  const flat = sections.map((s) => s.p).join("\n\n");
  if (shouldSuppressAllBodyText(flat, headline)) {
    return sections.map((s) => ({ h: s.h, p: "" }));
  }

  return sections.map((sec, idx) => {
    let p = sec.p.trim();
    if (isBoilerplateParagraph(p)) return { h: sec.h, p: "" };
    if (
      idx === 0
      && ledeFirstSentence
      && normalizeSentenceKey(firstSentence(p)) === normalizeSentenceKey(ledeFirstSentence)
    ) {
      return { h: sec.h, p: "" };
    }
    return { h: sec.h, p };
  });
}

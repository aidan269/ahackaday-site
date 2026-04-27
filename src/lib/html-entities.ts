/** Decode HTML entities (named + numeric). Loops to unwind &amp;#8203;-style double encoding. */

export function decodeHtmlEntitiesOnce(value: string): string {
  let s = value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => {
    const code = Number.parseInt(h, 16);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return _;
    return String.fromCodePoint(code);
  });
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number.parseInt(n, 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return _;
    return String.fromCodePoint(code);
  });
  return s;
}

export function decodeHtmlEntities(value: string): string {
  let s = value;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeHtmlEntitiesOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

/** ZWSP, ZWNJ, ZWJ, BOM — e.g. &#8203; from WordPress / feed exporters. */
export function stripInvisibleUnicode(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

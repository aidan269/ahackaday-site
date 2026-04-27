/**
 * Shorten list-preview strings without ending mid-word (avoids "organization'" fragments).
 * Prefers as many full words as fit under maxLen; overlong unbroken tokens are hard-capped.
 */
export function truncateForDisplay(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  const words = t.split(" ");
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > maxLen) break;
    out = next;
  }
  if (out.length > 0) return `${out}…`;
  return `${t.slice(0, maxLen)}…`;
}

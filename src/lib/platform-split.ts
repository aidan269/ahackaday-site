/** Shared platform % math for social refresh and feed ranking when splits are missing. */

export function stableHash(value: string): number {
  let hash = 11;
  for (const ch of value) hash = (hash * 31 + ch.charCodeAt(0)) % 100_000;
  return hash;
}

export function toPlatformSplit(
  mentions: number,
  seedInput: string,
): { x: number; reddit: number; github: number } {
  const seed = stableHash(seedInput);
  const mentionBand = Math.min(4, Math.floor(mentions / 30));
  const githubBase = 18 + mentionBand * 4;
  const github = Math.max(14, Math.min(46, githubBase + (seed % 9) - 4));

  const remaining = 100 - github;
  const xTarget = 58 + ((seed >> 3) % 17) - 8;
  const x = Math.max(28, Math.min(72, Math.round((remaining * xTarget) / 100)));
  const reddit = Math.max(12, 100 - github - x);
  return { x, reddit, github };
}

export function toPlatformSplitFromObserved(counts: {
  x: number;
  reddit: number;
  github: number;
}): { x: number; reddit: number; github: number } {
  const total = counts.x + counts.reddit + counts.github;
  if (total <= 0) return { x: 47, reddit: 35, github: 18 };
  const x = Math.max(0, Math.round((counts.x / total) * 100));
  const reddit = Math.max(0, Math.round((counts.reddit / total) * 100));
  const github = Math.max(0, 100 - x - reddit);
  return { x, reddit, github };
}

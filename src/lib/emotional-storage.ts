const KEY_READ = "ah-read";
const KEY_SAVED = "ah-saved";
const KEY_REVIEWED = "ah-reviewed";

export function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function persistSet(key: string, s: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* ignore quota */
  }
}

export function loadInt(key: string): number {
  try {
    const v = parseInt(localStorage.getItem(key) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function loadReadSet(): Set<string> {
  return loadSet(KEY_READ);
}

export function loadSavedSet(): Set<string> {
  return loadSet(KEY_SAVED);
}

export function persistReadSet(s: Set<string>): void {
  persistSet(KEY_READ, s);
}

export function persistSavedSet(s: Set<string>): void {
  persistSet(KEY_SAVED, s);
}

export function loadReviewCount(): number {
  return loadInt(KEY_REVIEWED);
}

export function persistReviewCount(n: number): void {
  try {
    localStorage.setItem(KEY_REVIEWED, String(n));
  } catch {
    /* ignore */
  }
}

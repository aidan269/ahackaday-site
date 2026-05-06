/**
 * If `p` does not settle within `ms`, resolves with `fallback`.
 * Does not cancel work still in flight on the original promise.
 */
export async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        id = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (id !== undefined) clearTimeout(id);
  }
}

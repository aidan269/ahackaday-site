import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-lg font-semibold text-zinc-100">Incident not found</h1>
      <p className="mt-2 text-sm text-zinc-400">
        The permalink may be stale or the incident has been renamed.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-cyan-300 hover:text-cyan-200">
        Back to feed
      </Link>
    </main>
  );
}

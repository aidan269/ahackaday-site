import Link from "next/link";

import { DigestAdminClient } from "./digest-admin-client";

type PageProps = { params: Promise<{ week_start: string }> };

export default async function AdminDigestPage({ params }: PageProps) {
  const { week_start } = await params;
  return (
    <main className="shell">
      <article className="detail methodology-page">
        <div className="detail__bar">
          <Link href="/" className="back-link">back to feed</Link>
        </div>
        <DigestAdminClient weekStart={week_start} />
      </article>
    </main>
  );
}

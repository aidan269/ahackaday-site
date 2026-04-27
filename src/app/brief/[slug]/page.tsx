import { redirect } from "next/navigation";

type BriefPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BriefPage({ params }: BriefPageProps) {
  const { slug } = await params;
  redirect(`/incident/${slug}`);
}

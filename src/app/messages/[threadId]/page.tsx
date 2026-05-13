import { MessagesView } from "@/components/messages-view";

type MessagesThreadPageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function MessagesThreadPage({ params }: MessagesThreadPageProps) {
  const { threadId } = await params;
  return <MessagesView selectedThreadId={threadId} />;
}

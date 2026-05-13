import { createClient } from "@supabase/supabase-js";

export type MessageProfile = {
  userId: string;
  handle: string;
  displayName: string | null;
};

export type MessageSummary = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type MessageThreadSummary = {
  id: string;
  otherUser: MessageProfile | null;
  lastMessage: MessageSummary | null;
  unreadCount: number;
  lastMessageAt: string;
};

export type MessageDetail = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  sender: MessageProfile | null;
};

type ThreadRow = {
  id: string;
  member_low: string;
  member_high: string;
  last_message_at: string;
};

type ProfileRow = {
  user_id: string;
  handle: string;
  display_name: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ReadRow = {
  thread_id: string;
  last_read_at: string;
};

export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function isValidHandle(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(value)
    && !["admin", "api", "messages", "profile", "support"].includes(value);
}

export function orderedMembers(userA: string, userB: string): { memberLow: string; memberHigh: string } {
  return userA < userB
    ? { memberLow: userA, memberHigh: userB }
    : { memberLow: userB, memberHigh: userA };
}

export function profileFromRow(row: ProfileRow): MessageProfile {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
  };
}

export function profileFallback(userId: string): MessageProfile {
  return {
    userId,
    handle: `user-${userId.slice(0, 8)}`,
    displayName: null,
  };
}

export function profileMap(rows: ProfileRow[] | null | undefined): Map<string, MessageProfile> {
  return new Map((rows ?? []).map((row) => [row.user_id, profileFromRow(row)]));
}

export function getOtherUserId(thread: ThreadRow, viewerId: string): string {
  return thread.member_low === viewerId ? thread.member_high : thread.member_low;
}

export function summarizeThreads({
  viewerId,
  threads,
  messages,
  profiles,
  reads,
}: {
  viewerId: string;
  threads: ThreadRow[];
  messages: MessageRow[];
  profiles: Map<string, MessageProfile>;
  reads: ReadRow[];
}): MessageThreadSummary[] {
  const messagesByThread = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const rows = messagesByThread.get(message.thread_id) ?? [];
    rows.push(message);
    messagesByThread.set(message.thread_id, rows);
  }

  const readByThread = new Map(reads.map((row) => [row.thread_id, row.last_read_at]));

  return threads.map((thread) => {
    const threadMessages = messagesByThread.get(thread.id) ?? [];
    const lastMessage = threadMessages[0] ?? null;
    const lastReadAt = readByThread.get(thread.id);
    const unreadCount = threadMessages.filter((message) => {
      if (message.sender_id === viewerId) return false;
      if (!lastReadAt) return true;
      return message.created_at > lastReadAt;
    }).length;
    const otherUserId = getOtherUserId(thread, viewerId);

    return {
      id: thread.id,
      otherUser: profiles.get(otherUserId) ?? profileFallback(otherUserId),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            body: lastMessage.body,
            createdAt: lastMessage.created_at,
            mine: lastMessage.sender_id === viewerId,
          }
        : null,
      unreadCount,
      lastMessageAt: thread.last_message_at,
    };
  });
}

export function detailFromRows({
  viewerId,
  messages,
  profiles,
}: {
  viewerId: string;
  messages: MessageRow[];
  profiles: Map<string, MessageProfile>;
}): MessageDetail[] {
  return messages.map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.created_at,
    mine: message.sender_id === viewerId,
    sender: profiles.get(message.sender_id) ?? profileFallback(message.sender_id),
  }));
}

import { NextResponse } from "next/server";

import {
  detailFromRows,
  getOtherUserId,
  getSupabaseAdminClient,
  profileFallback,
  profileMap,
} from "@/lib/messaging";
import { getAuthedUserIdFromRequest } from "@/lib/supabase-auth-request";

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

async function getThread(supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, threadId: string) {
  return supabase
    .from("message_threads")
    .select("id,member_low,member_high,last_message_at")
    .eq("id", threadId)
    .maybeSingle();
}

function isParticipant(thread: ThreadRow, userId: string): boolean {
  return thread.member_low === userId || thread.member_high === userId;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data: threadData, error: threadError } = await getThread(supabase, threadId);
  if (threadError) return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 });
  if (!threadData) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  const thread = threadData as ThreadRow;
  if (!isParticipant(thread, userId)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const memberIds = [thread.member_low, thread.member_high];
  const [{ data: messagesData, error: messagesError }, { data: profilesData, error: profilesError }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id,thread_id,sender_id,body,created_at")
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase.from("user_profiles").select("user_id,handle,display_name").in("user_id", memberIds),
    ]);
  if (messagesError) return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
  if (profilesError) return NextResponse.json({ ok: false, error: profilesError.message }, { status: 500 });

  const profiles = profileMap((profilesData ?? []) as ProfileRow[]);
  const otherUserId = getOtherUserId(thread, userId);

  return NextResponse.json({
    ok: true,
    thread: {
      id: thread.id,
      otherUser: profiles.get(otherUserId) ?? profileFallback(otherUserId),
      lastMessageAt: thread.last_message_at,
    },
    messages: detailFromRows({
      viewerId: userId,
      messages: (messagesData ?? []) as MessageRow[],
      profiles,
    }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body?.trim() ?? "";
  if (text.length < 1) return NextResponse.json({ ok: false, error: "Message cannot be empty." }, { status: 400 });
  if (text.length > 4000) {
    return NextResponse.json({ ok: false, error: "Message must be 4000 characters or fewer." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data: threadData, error: threadError } = await getThread(supabase, threadId);
  if (threadError) return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 });
  if (!threadData) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  const thread = threadData as ThreadRow;
  if (!isParticipant(thread, userId)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data: messageData, error: messageError } = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: userId,
      body: text,
    })
    .select("id,thread_id,sender_id,body,created_at")
    .single();
  if (messageError || !messageData) {
    return NextResponse.json({ ok: false, error: messageError?.message ?? "Insert failed." }, { status: 500 });
  }

  await supabase.from("message_thread_reads").upsert(
    {
      thread_id: threadId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "thread_id,user_id" },
  );

  return NextResponse.json({
    ok: true,
    message: detailFromRows({
      viewerId: userId,
      messages: [messageData as MessageRow],
      profiles: new Map(),
    })[0],
  });
}

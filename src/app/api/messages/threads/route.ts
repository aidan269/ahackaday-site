import { NextResponse } from "next/server";

import {
  getSupabaseAdminClient,
  normalizeHandle,
  orderedMembers,
  profileMap,
  summarizeThreads,
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

type ReadRow = {
  thread_id: string;
  last_read_at: string;
};

async function selectThreadByPair(supabase: ReturnType<typeof getSupabaseAdminClient>, memberLow: string, memberHigh: string) {
  if (!supabase) return { data: null, error: null };
  return supabase
    .from("message_threads")
    .select("id,member_low,member_high,last_message_at")
    .eq("member_low", memberLow)
    .eq("member_high", memberHigh)
    .maybeSingle();
}

export async function GET(request: Request) {
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data: threadsData, error: threadsError } = await supabase
    .from("message_threads")
    .select("id,member_low,member_high,last_message_at")
    .or(`member_low.eq.${userId},member_high.eq.${userId}`)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (threadsError) return NextResponse.json({ ok: false, error: threadsError.message }, { status: 500 });

  const threads = (threadsData ?? []) as ThreadRow[];
  const threadIds = threads.map((thread) => thread.id);
  const memberIds = [...new Set(threads.flatMap((thread) => [thread.member_low, thread.member_high]))];

  const [{ data: messagesData, error: messagesError }, { data: profilesData, error: profilesError }, { data: readsData, error: readsError }] =
    await Promise.all([
      threadIds.length > 0
        ? supabase
            .from("messages")
            .select("id,thread_id,sender_id,body,created_at")
            .in("thread_id", threadIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length > 0
        ? supabase.from("user_profiles").select("user_id,handle,display_name").in("user_id", memberIds)
        : Promise.resolve({ data: [], error: null }),
      threadIds.length > 0
        ? supabase
            .from("message_thread_reads")
            .select("thread_id,last_read_at")
            .eq("user_id", userId)
            .in("thread_id", threadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (messagesError) return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
  if (profilesError) return NextResponse.json({ ok: false, error: profilesError.message }, { status: 500 });
  if (readsError) return NextResponse.json({ ok: false, error: readsError.message }, { status: 500 });

  const threadsOut = summarizeThreads({
    viewerId: userId,
    threads,
    messages: (messagesData ?? []) as MessageRow[],
    profiles: profileMap((profilesData ?? []) as ProfileRow[]),
    reads: (readsData ?? []) as ReadRow[],
  });

  return NextResponse.json({
    ok: true,
    threads: threadsOut,
    unreadCount: threadsOut.reduce((sum, thread) => sum + thread.unreadCount, 0),
  });
}

export async function POST(request: Request) {
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { handle?: string } | null;
  const handle = normalizeHandle(body?.handle ?? "");
  if (!handle) return NextResponse.json({ ok: false, error: "Recipient handle is required." }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data: senderProfile } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!senderProfile) {
    return NextResponse.json({ ok: false, error: "Create your handle before starting a message." }, { status: 409 });
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("user_profiles")
    .select("user_id,handle,display_name")
    .eq("handle", handle)
    .maybeSingle();
  if (recipientError) return NextResponse.json({ ok: false, error: recipientError.message }, { status: 500 });
  if (!recipient) return NextResponse.json({ ok: false, error: "No user found with that handle." }, { status: 404 });
  if ((recipient as ProfileRow).user_id === userId) {
    return NextResponse.json({ ok: false, error: "You cannot start a message with yourself." }, { status: 400 });
  }

  const { memberLow, memberHigh } = orderedMembers(userId, (recipient as ProfileRow).user_id);
  const existing = await selectThreadByPair(supabase, memberLow, memberHigh);
  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  if (existing.data) return NextResponse.json({ ok: true, threadId: (existing.data as ThreadRow).id });

  const { data: created, error: createError } = await supabase
    .from("message_threads")
    .insert({
      member_low: memberLow,
      member_high: memberHigh,
      created_by: userId,
    })
    .select("id")
    .single();
  if (createError) {
    if (createError.code === "23505") {
      const retry = await selectThreadByPair(supabase, memberLow, memberHigh);
      if (retry.data) return NextResponse.json({ ok: true, threadId: (retry.data as ThreadRow).id });
    }
    return NextResponse.json({ ok: false, error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, threadId: (created as { id: string }).id });
}

import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/messaging";
import { getAuthedUserIdFromRequest } from "@/lib/supabase-auth-request";

type ThreadRow = {
  id: string;
  member_low: string;
  member_high: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data: threadData, error: threadError } = await supabase
    .from("message_threads")
    .select("id,member_low,member_high")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 });
  if (!threadData) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });

  const thread = threadData as ThreadRow;
  if (thread.member_low !== userId && thread.member_high !== userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("message_thread_reads").upsert(
    {
      thread_id: threadId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "thread_id,user_id" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

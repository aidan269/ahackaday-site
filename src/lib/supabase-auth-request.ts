import { createClient } from "@supabase/supabase-js";

export async function getAuthedUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = tokenMatch?.[1]?.trim();
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

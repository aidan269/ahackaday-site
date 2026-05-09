import { getAuthedUserIdFromRequest } from "@/lib/supabase-auth-request";

function parseAdminIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Returns null if caller is an AEO admin; otherwise a Response to return from the route. */
export async function assertAeoAdmin(request: Request): Promise<Response | null> {
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const admins = parseAdminIds();
  if (admins.size === 0 || !admins.has(userId)) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

export function isAeoAdminUserId(userId: string | null): boolean {
  if (!userId) return false;
  const admins = parseAdminIds();
  return admins.size > 0 && admins.has(userId);
}

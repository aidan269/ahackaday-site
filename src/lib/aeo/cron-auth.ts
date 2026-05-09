/** Vercel Cron and internal workers use `Authorization: Bearer ${CRON_SECRET}`. */
export function assertCronAuthorized(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

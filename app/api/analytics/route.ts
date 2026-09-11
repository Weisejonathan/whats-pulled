import { sql } from "drizzle-orm";
import { getUserSession } from "@/lib/auth";
import { getToolForPath } from "@/lib/db/analytics";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validId = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Same-origin request required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !validId.test(String(body.sessionId ?? ""))) {
    return Response.json({ error: "Valid session id required." }, { status: 400 });
  }

  const eventType = body.eventType === "page_view" ? "page_view" : "heartbeat";
  const pagePath = typeof body.pagePath === "string" && body.pagePath.startsWith("/")
    ? body.pagePath.slice(0, 300)
    : "/";
  const sessionId = String(body.sessionId);
  const tool = getToolForPath(pagePath);
  const [db, user] = [getDb(), await getUserSession()];

  if (!db) return new Response(null, { status: 204 });

  try {
    await db.execute(sql`
      insert into analytics_sessions (id, user_id, page_path, tool, started_at, last_seen_at)
      values (${sessionId}, ${user?.id ?? null}::uuid, ${pagePath}, ${tool}, now(), now())
      on conflict (id) do update set
        user_id = coalesce(excluded.user_id, analytics_sessions.user_id),
        page_path = excluded.page_path,
        tool = excluded.tool,
        last_seen_at = now()
    `);

    if (eventType === "page_view") {
      await db.execute(sql`
        insert into analytics_events (session_id, user_id, event_type, tool, page_path)
        values (${sessionId}, ${user?.id ?? null}::uuid, 'page_view', ${tool}, ${pagePath})
      `);
    }
  } catch (error) {
    console.error("Analytics heartbeat failed", error instanceof Error ? error.name : "Error");
  }

  return new Response(null, { status: 204 });
}

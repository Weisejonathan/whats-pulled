import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "./client";

const toNumber = (value: unknown) => Number(value ?? 0) || 0;

export const TOOL_LABELS: Record<string, string> = {
  "vision-detector": "KI-Kartenerkennung",
  "direct-uploader": "Direct Uploader",
  "frame-upload": "Detector Upload",
  "instagram-import": "Instagram Import",
  "training-sample": "Training Samples",
};

export function getToolForPath(path: string) {
  if (path.startsWith("/direct-uploader")) return "direct-uploader";
  if (path.startsWith("/stream-detector")) return "frame-upload";
  if (path.startsWith("/detector")) return "vision-detector";
  if (path.startsWith("/studio")) return "obs-studio";
  return null;
}

export function estimateOpenAiCost(inputTokens: number, outputTokens: number) {
  const inputRate = Number(process.env.OPENAI_INPUT_COST_PER_MILLION ?? 0.4);
  const outputRate = Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION ?? 1.6);
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

type ToolEventInput = {
  tool: string;
  inputUnits?: number;
  outputUnits?: number;
  estimatedCostUsd?: number;
  sessionId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordToolEvent(input: ToolEventInput) {
  const db = getDb();
  if (!db) return;

  try {
    await db.execute(sql`
      insert into analytics_events (
        session_id, user_id, event_type, tool, input_units, output_units,
        estimated_cost_usd, metadata
      ) values (
        (select id from analytics_sessions where id = ${input.sessionId ?? null}),
        coalesce(${input.userId ?? null}::uuid, (select user_id from analytics_sessions where id = ${input.sessionId ?? null})),
        'tool_call', ${input.tool},
        ${input.inputUnits ?? 0}, ${input.outputUnits ?? 0},
        ${input.estimatedCostUsd ?? 0}, ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `);
  } catch (error) {
    // Analytics must never break a customer-facing tool call during rollout.
    console.error("Analytics event could not be recorded", error instanceof Error ? error.name : "Error");
  }
}

export type AnalyticsDashboard = Awaited<ReturnType<typeof getAnalyticsDashboard>>;

export async function getAnalyticsDashboard(days: number) {
  const db = getDb();
  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const monthlyBudget = Math.max(0, Number(process.env.MONTHLY_TOOL_BUDGET_USD ?? 50));

  if (!db) {
    return {
      databaseReady: false,
      telemetryReady: false,
      days: safeDays,
      monthlyBudget,
      totals: { users: 0, newUsers: 0, liveUsers: 0, calls: 0, cost: 0, previousCost: 0, monthlyCost: 0 },
      daily: [] as Array<{ date: string; sessions: number; calls: number; cost: number }>,
      tools: [] as Array<{ tool: string; calls: number; users: number; cost: number; inputUnits: number; outputUnits: number }>,
      recentUsers: [] as Array<{ id: string; displayName: string; email: string; createdAt: Date; lastSeenAt: Date | null; pagePath: string | null }>,
    };
  }

  try {
    const [totalsResult, dailyResult, toolsResult, recentUsersResult] = await Promise.all([
      db.execute(sql`
        select
          (select count(*) from users)::int as users,
          (select count(*) from users where created_at >= now() - make_interval(days => ${safeDays}))::int as new_users,
          (select count(*) from analytics_sessions where last_seen_at >= now() - interval '2 minutes')::int as live_users,
          (select count(*) from analytics_events where event_type = 'tool_call' and occurred_at >= now() - make_interval(days => ${safeDays}))::int as calls,
          (select coalesce(sum(estimated_cost_usd), 0) from analytics_events where occurred_at >= now() - make_interval(days => ${safeDays}))::text as cost,
          (select coalesce(sum(estimated_cost_usd), 0) from analytics_events where occurred_at < now() - make_interval(days => ${safeDays}) and occurred_at >= now() - make_interval(days => ${safeDays * 2}))::text as previous_cost,
          (select coalesce(sum(estimated_cost_usd), 0) from analytics_events where occurred_at >= date_trunc('month', now()))::text as monthly_cost
      `),
      db.execute(sql`
        select
          day::date::text as date,
          coalesce((select count(*) from analytics_sessions s where s.started_at >= day and s.started_at < day + interval '1 day'), 0)::int as sessions,
          coalesce((select count(*) from analytics_events e where e.event_type = 'tool_call' and e.occurred_at >= day and e.occurred_at < day + interval '1 day'), 0)::int as calls,
          coalesce((select sum(estimated_cost_usd) from analytics_events e where e.occurred_at >= day and e.occurred_at < day + interval '1 day'), 0)::text as cost
        from generate_series(current_date - (${safeDays - 1})::int, current_date, interval '1 day') day
        order by day
      `),
      db.execute(sql`
        select
          coalesce(tool, 'other') as tool,
          count(*)::int as calls,
          count(distinct coalesce(user_id::text, session_id))::int as users,
          coalesce(sum(estimated_cost_usd), 0)::text as cost,
          coalesce(sum(input_units), 0)::int as input_units,
          coalesce(sum(output_units), 0)::int as output_units
        from analytics_events
        where event_type = 'tool_call' and occurred_at >= now() - make_interval(days => ${safeDays})
        group by tool
        order by sum(estimated_cost_usd) desc, count(*) desc
      `),
      db.execute(sql`
        select u.id, u.display_name, u.email, u.created_at,
          max(s.last_seen_at) as last_seen_at,
          (array_agg(s.page_path order by s.last_seen_at desc) filter (where s.page_path is not null))[1] as page_path
        from users u
        left join analytics_sessions s on s.user_id = u.id
        group by u.id
        order by max(s.last_seen_at) desc nulls last, u.created_at desc
        limit 7
      `),
    ]);

    const total = totalsResult.rows[0] ?? {};
    return {
      databaseReady: true,
      telemetryReady: true,
      days: safeDays,
      monthlyBudget,
      totals: {
        users: toNumber(total.users),
        newUsers: toNumber(total.new_users),
        liveUsers: toNumber(total.live_users),
        calls: toNumber(total.calls),
        cost: toNumber(total.cost),
        previousCost: toNumber(total.previous_cost),
        monthlyCost: toNumber(total.monthly_cost),
      },
      daily: dailyResult.rows.map((row) => ({
        date: String(row.date),
        sessions: toNumber(row.sessions),
        calls: toNumber(row.calls),
        cost: toNumber(row.cost),
      })),
      tools: toolsResult.rows.map((row) => ({
        tool: String(row.tool),
        calls: toNumber(row.calls),
        users: toNumber(row.users),
        cost: toNumber(row.cost),
        inputUnits: toNumber(row.input_units),
        outputUnits: toNumber(row.output_units),
      })),
      recentUsers: recentUsersResult.rows.map((row) => ({
        id: String(row.id),
        displayName: String(row.display_name),
        email: String(row.email),
        createdAt: new Date(String(row.created_at)),
        lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)) : null,
        pagePath: row.page_path ? String(row.page_path) : null,
      })),
    };
  } catch (error) {
    console.error("Admin analytics could not be loaded", error instanceof Error ? error.name : "Error");
    return {
      databaseReady: true,
      telemetryReady: false,
      days: safeDays,
      monthlyBudget,
      totals: { users: 0, newUsers: 0, liveUsers: 0, calls: 0, cost: 0, previousCost: 0, monthlyCost: 0 },
      daily: [],
      tools: [],
      recentUsers: [],
    };
  }
}

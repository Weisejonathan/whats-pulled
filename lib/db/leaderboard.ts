import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./client";
import { cards, pullReports, userPointEvents, users } from "./schema";

export type LeaderboardInterval = "week" | "month" | "all";

export type CollectorLeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  points: number;
  approvedPulls: number;
  topPull: {
    player: string;
    serial: string;
    points: number;
  } | null;
};

const intervalLabels: Record<LeaderboardInterval, string> = {
  all: "All Time",
  month: "This Month",
  week: "This Week",
};

function getIntervalStart(interval: LeaderboardInterval) {
  const now = new Date();

  if (interval === "all") {
    return null;
  }

  if (interval === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const day = now.getUTCDay() || 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}

export async function getCollectorLeaderboard(interval: LeaderboardInterval) {
  const db = getDb();

  if (!db) {
    return {
      databaseReady: false,
      entries: [] as CollectorLeaderboardEntry[],
      intervalLabel: intervalLabels[interval],
    };
  }

  const intervalStart = getIntervalStart(interval);
  const filters = intervalStart ? [gte(userPointEvents.createdAt, intervalStart)] : [];

  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      points: sql<number>`cast(coalesce(sum(${userPointEvents.points}), 0) as integer)`,
      approvedPulls: sql<number>`cast(count(distinct ${userPointEvents.pullReportId}) as integer)`,
    })
    .from(userPointEvents)
    .innerJoin(users, eq(userPointEvents.userId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .groupBy(users.id, users.displayName)
    .orderBy(desc(sql`coalesce(sum(${userPointEvents.points}), 0)`))
    .limit(50);

  const topPulls = await Promise.all(
    rows.map(async (row) => {
      const topRows = await db
        .select({
          player: cards.playerName,
          serial: cards.serialNumber,
          points: userPointEvents.points,
        })
        .from(userPointEvents)
        .innerJoin(pullReports, eq(userPointEvents.pullReportId, pullReports.id))
        .innerJoin(cards, eq(pullReports.cardId, cards.id))
        .where(
          and(
            eq(userPointEvents.userId, row.userId),
            ...(intervalStart ? [gte(userPointEvents.createdAt, intervalStart)] : []),
          ),
        )
        .orderBy(desc(userPointEvents.points), desc(userPointEvents.createdAt))
        .limit(1);

      return topRows[0] ?? null;
    }),
  );

  return {
    databaseReady: true,
    entries: rows.map((row, index) => ({
      approvedPulls: row.approvedPulls,
      displayName: row.displayName,
      points: row.points,
      rank: index + 1,
      topPull: topPulls[index],
      userId: row.userId,
    })),
    intervalLabel: intervalLabels[interval],
  };
}

export function readLeaderboardInterval(value: string | undefined): LeaderboardInterval {
  return value === "month" || value === "all" ? value : "week";
}

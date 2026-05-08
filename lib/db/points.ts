import { and, eq, ne, sql } from "drizzle-orm";
import { cards, pullReports, userPointEvents } from "./schema";

type DbClient = NonNullable<ReturnType<typeof import("./client").getDb>>;

export type PullPointAward = {
  points: number;
  reason: string;
};

export function calculatePullPoints({
  hasProof,
  isFirstVerifiedPull,
  printRun,
}: {
  hasProof: boolean;
  isFirstVerifiedPull: boolean;
  printRun: number | null;
}): PullPointAward {
  const rarityPoints =
    printRun === 1
      ? 300
      : printRun && printRun <= 5
        ? 150
        : printRun && printRun <= 10
          ? 100
          : printRun && printRun <= 25
            ? 50
            : printRun && printRun <= 99
              ? 25
              : 10;
  const proofBonus = hasProof ? 25 : 0;
  const firstPullBonus = isFirstVerifiedPull ? 50 : 0;
  const points = rarityPoints + proofBonus + firstPullBonus;
  const reason = [
    `${rarityPoints} rarity`,
    proofBonus ? `${proofBonus} proof bonus` : null,
    firstPullBonus ? `${firstPullBonus} first verified pull bonus` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return { points, reason };
}

export async function awardPullPoints(db: DbClient, pullReportId: string) {
  const [pull] = await db
    .select({
      id: pullReports.id,
      cardId: pullReports.cardId,
      proofUrl: pullReports.proofUrl,
      userId: pullReports.userId,
      printRun: cards.printRun,
      verificationStatus: pullReports.verificationStatus,
    })
    .from(pullReports)
    .innerJoin(cards, eq(pullReports.cardId, cards.id))
    .where(eq(pullReports.id, pullReportId))
    .limit(1);

  if (!pull?.userId || pull.verificationStatus !== "verified") {
    return null;
  }

  const [existingEvent] = await db
    .select({ id: userPointEvents.id })
    .from(userPointEvents)
    .where(eq(userPointEvents.externalRef, `points-pull-${pull.id}`))
    .limit(1);

  if (existingEvent) {
    return null;
  }

  const [verifiedPullCount] = await db
    .select({
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(pullReports)
    .where(
      and(
        eq(pullReports.cardId, pull.cardId),
        eq(pullReports.verificationStatus, "verified"),
        ne(pullReports.id, pull.id),
      ),
    );
  const award = calculatePullPoints({
    hasProof: Boolean(pull.proofUrl),
    isFirstVerifiedPull: (verifiedPullCount?.count ?? 0) === 0,
    printRun: pull.printRun,
  });

  await db.insert(userPointEvents).values({
    eventType: "approved_pull",
    externalRef: `points-pull-${pull.id}`,
    points: award.points,
    pullReportId: pull.id,
    reason: award.reason,
    userId: pull.userId,
  });

  return award;
}

import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "./client";
import { breakers, cards, cardSets, pullReports } from "./schema";

const formatCurrency = (value: string | null | undefined, currency = "USD") => {
  const amount = Number(value);

  if (!value || Number.isNaN(amount) || amount <= 0) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(value)
    : "Unknown date";

export type BreakerPull = {
  cardUrl: string;
  imageUrl: string | null;
  player: string;
  setName: string;
  serial: string;
  title: string;
  value: string;
  pulledAt: string;
};

export type BreakerRank = {
  country: string | null;
  hitCount: number;
  id: string;
  name: string;
  rank: number;
  slug: string;
  topPull: BreakerPull | null;
  totalValue: string;
  trackedSets: number;
  verified: boolean;
};

export type BreakerDetail = BreakerRank & {
  averageValue: string;
  pulls: BreakerPull[];
};

const demoBreakers: BreakerRank[] = [
  {
    country: "DE",
    hitCount: 18,
    id: "demo-court-kings",
    name: "Court Kings Breaks",
    rank: 1,
    slug: "court-kings-breaks",
    topPull: {
      cardUrl: "/cards/carlos-alcaraz-1-superfractor",
      imageUrl: null,
      player: "Carlos Alcaraz",
      setName: "Topps Chrome Tennis 2025",
      serial: "1/1",
      title: "Superfractor",
      value: "$18,500",
      pulledAt: "Verified pull",
    },
    totalValue: "$72,400",
    trackedSets: 3,
    verified: true,
  },
  {
    country: "FI",
    hitCount: 12,
    id: "demo-nordic",
    name: "Nordic Card Store",
    rank: 2,
    slug: "nordic-card-store",
    topPull: null,
    totalValue: "$44,900",
    trackedSets: 2,
    verified: true,
  },
  {
    country: "EU",
    hitCount: 9,
    id: "demo-prime",
    name: "Prime Pulls EU",
    rank: 3,
    slug: "prime-pulls-eu",
    topPull: null,
    totalValue: "$31,250",
    trackedSets: 1,
    verified: true,
  },
];

export async function getBreakerRankings(): Promise<BreakerRank[]> {
  const db = getDb();

  if (!db) {
    return demoBreakers;
  }

  try {
    const rows = await db
      .select({
        id: breakers.id,
        name: breakers.displayName,
        slug: breakers.slug,
        country: breakers.country,
        verified: breakers.verified,
        hitCount: sql<number>`cast(count(${pullReports.id}) as integer)`,
        totalValue: sql<string>`coalesce(sum(${pullReports.estimatedValue}), 0)::text`,
        trackedSets: sql<number>`cast(count(distinct ${cardSets.id}) as integer)`,
      })
      .from(breakers)
      .leftJoin(
        pullReports,
        and(
          eq(pullReports.breakerId, breakers.id),
          eq(pullReports.verificationStatus, "verified"),
        ),
      )
      .leftJoin(cards, eq(pullReports.cardId, cards.id))
      .leftJoin(cardSets, eq(cards.setId, cardSets.id))
      .groupBy(breakers.id)
      .orderBy(desc(sql`coalesce(sum(${pullReports.estimatedValue}), 0)`))
      .limit(24);

    if (!rows.length) {
      return demoBreakers;
    }

    const topPulls = await Promise.all(
      rows.map(async (breaker) => {
        const [pull] = await db
          .select({
            cardSlug: cards.slug,
            imageUrl: cards.imageUrl,
            player: cards.playerName,
            setName: cardSets.name,
            parallel: cards.parallel,
            serial: cards.serialNumber,
            value: pullReports.estimatedValue,
            pulledAt: pullReports.pulledAt,
          })
          .from(pullReports)
          .innerJoin(cards, eq(pullReports.cardId, cards.id))
          .innerJoin(cardSets, eq(cards.setId, cardSets.id))
          .where(
            and(
              eq(pullReports.breakerId, breaker.id),
              eq(pullReports.verificationStatus, "verified"),
            ),
          )
          .orderBy(desc(sql`coalesce(${pullReports.estimatedValue}, 0)`))
          .limit(1);

        return pull ? toBreakerPull(pull) : null;
      }),
    );

    return rows.map((breaker, index) => ({
      country: breaker.country,
      hitCount: breaker.hitCount,
      id: breaker.id,
      name: breaker.name,
      rank: index + 1,
      slug: breaker.slug,
      topPull: topPulls[index],
      totalValue: formatCurrency(breaker.totalValue),
      trackedSets: breaker.trackedSets,
      verified: breaker.verified,
    }));
  } catch (error) {
    console.error("Failed to load breaker rankings", error);
    return demoBreakers;
  }
}

export async function getBreakerDetail(slug: string): Promise<BreakerDetail> {
  const db = getDb();

  if (!db) {
    const demo = demoBreakers.find((breaker) => breaker.slug === slug);
    if (!demo) notFound();
    return {
      ...demo,
      averageValue: "$4,022",
      pulls: demo.topPull ? [demo.topPull] : [],
    };
  }

  const rankings = await getBreakerRankings();
  const ranking = rankings.find((breaker) => breaker.slug === slug);

  if (!ranking) {
    notFound();
  }

  const pullRows = await db
    .select({
      cardSlug: cards.slug,
      imageUrl: cards.imageUrl,
      player: cards.playerName,
      setName: cardSets.name,
      parallel: cards.parallel,
      serial: cards.serialNumber,
      value: pullReports.estimatedValue,
      pulledAt: pullReports.pulledAt,
    })
    .from(pullReports)
    .innerJoin(cards, eq(pullReports.cardId, cards.id))
    .innerJoin(cardSets, eq(cards.setId, cardSets.id))
    .where(
      and(
        eq(pullReports.breakerId, ranking.id),
        eq(pullReports.verificationStatus, "verified"),
      ),
    )
    .orderBy(desc(pullReports.pulledAt), desc(pullReports.createdAt))
    .limit(48);

  const averageValue =
    ranking.hitCount > 0 && ranking.totalValue !== "-"
      ? formatCurrency(String(Number(ranking.totalValue.replace(/[^0-9.-]+/g, "")) / ranking.hitCount))
      : "-";

  return {
    ...ranking,
    averageValue,
    pulls: pullRows.map(toBreakerPull),
  };
}

function toBreakerPull(pull: {
  cardSlug: string;
  imageUrl: string | null;
  parallel: string | null;
  player: string;
  pulledAt: Date | null;
  serial: string;
  setName: string;
  value: string | null;
}): BreakerPull {
  return {
    cardUrl: `/cards/${pull.cardSlug}`,
    imageUrl: pull.imageUrl,
    player: pull.player,
    pulledAt: formatDate(pull.pulledAt),
    serial: pull.serial,
    setName: pull.setName,
    title: pull.parallel ?? "Base",
    value: formatCurrency(pull.value),
  };
}

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  breakers,
  cards,
  listings,
  pullReports,
  stores,
} from "./schema";
import {
  demoHomepageData,
  type BreakerScore,
  type CardOption,
  type ChaseCard,
  type HomepageData,
} from "./demo-data";

const formatCurrency = (value: string | null | undefined, currency = "USD") => {
  const amount = Number(value);

  if (!value || Number.isNaN(amount) || amount <= 0) {
    return "-";
  }

  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
};

const toDisplayStatus = (status: string): ChaseCard["status"] => {
  const normalized = status.toLowerCase();

  if (normalized === "pulled") return "Pulled";
  if (normalized === "claimed") return "Claimed";
  if (normalized === "available") return "Available";
  if (normalized === "sold") return "Sold";
  return "Open";
};

export async function getHomepageData(): Promise<HomepageData> {
  const db = getDb();

  if (!db) {
    return demoHomepageData;
  }

  try {
    const cardRows = await db
      .select({
        player: cards.playerName,
        cardName: cards.cardName,
        parallel: cards.parallel,
        serial: cards.serialNumber,
        status: cards.status,
        estimatedValue: cards.estimatedValue,
        breakerName: breakers.displayName,
        storeName: stores.displayName,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
      })
      .from(cards)
      .leftJoin(
        pullReports,
        and(
          eq(pullReports.cardId, cards.id),
          eq(pullReports.verificationStatus, "verified"),
        ),
      )
      .leftJoin(breakers, eq(pullReports.breakerId, breakers.id))
      .leftJoin(
        listings,
        and(eq(listings.cardId, cards.id), eq(listings.status, "active")),
      )
      .leftJoin(stores, eq(listings.storeId, stores.id))
      .orderBy(desc(cards.updatedAt))
      .limit(6);

    const optionRows = await db
      .select({
        id: cards.id,
        player: cards.playerName,
        cardName: cards.cardName,
        parallel: cards.parallel,
        serial: cards.serialNumber,
      })
      .from(cards)
      .orderBy(desc(cards.updatedAt))
      .limit(50);

    const breakerRows = await db
      .select({
        name: breakers.displayName,
        hits: sql<number>`cast(count(${pullReports.id}) as integer)`,
        value: sql<string>`coalesce(sum(${pullReports.estimatedValue}), 0)::text`,
      })
      .from(breakers)
      .leftJoin(
        pullReports,
        and(
          eq(pullReports.breakerId, breakers.id),
          eq(pullReports.verificationStatus, "verified"),
        ),
      )
      .groupBy(breakers.id, breakers.displayName)
      .orderBy(desc(sql`coalesce(sum(${pullReports.estimatedValue}), 0)`))
      .limit(3);

    const [cardMetrics] = await db
      .select({
        openCards: sql<number>`cast(count(*) filter (where ${cards.status} = 'open') as integer)`,
      })
      .from(cards);

    const [pullMetrics] = await db
      .select({
        verifiedPulls: sql<number>`cast(count(*) as integer)`,
        claimedValue: sql<string>`coalesce(sum(${pullReports.estimatedValue}), 0)::text`,
      })
      .from(pullReports)
      .where(eq(pullReports.verificationStatus, "verified"));

    const chaseCards: ChaseCard[] = cardRows.map((row) => {
      const status = toDisplayStatus(row.status);
      const isAvailable = status === "Available" && row.listingPrice;
      const attribution = isAvailable ? row.storeName : row.breakerName;

      return {
        player: row.player,
        card: [row.cardName, row.parallel].filter(Boolean).join(" "),
        serial: row.serial,
        status,
        breaker: attribution ?? "-",
        value: formatCurrency(
          isAvailable ? row.listingPrice : row.estimatedValue,
          row.listingCurrency ?? "USD",
        ),
      };
    });

    const breakerScores: BreakerScore[] = breakerRows.map((breaker) => ({
      name: breaker.name,
      hits: breaker.hits,
      value: formatCurrency(breaker.value),
    }));

    const cardOptions: CardOption[] = optionRows.map((card) => ({
      id: card.id,
      label: [
        card.player,
        [card.cardName, card.parallel].filter(Boolean).join(" "),
        card.serial,
      ]
        .filter(Boolean)
        .join(" - "),
    }));

    return {
      chaseCards: chaseCards.length ? chaseCards : demoHomepageData.chaseCards,
      breakers: breakerScores.length ? breakerScores : demoHomepageData.breakers,
      cardOptions,
      databaseReady: true,
      metrics: {
        openCards: String(cardMetrics?.openCards ?? 0),
        verifiedPulls: String(pullMetrics?.verifiedPulls ?? 0),
        claimedValue: formatCurrency(pullMetrics?.claimedValue),
      },
    };
  } catch (error) {
    console.error("Failed to load homepage data from the database", error);
    return demoHomepageData;
  }
}

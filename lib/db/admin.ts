import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { cards, cardSets, claims, pullReports, users } from "./schema";

export type PendingClaimRequest = {
  id: string;
  ownerDisplayName: string;
  proofUrl: string | null;
  imageUrl: string | null;
  note: string | null;
  createdAt: Date;
  card: {
    id: string;
    slug: string;
    player: string;
    cardName: string;
    cardNumber: number | null;
    parallel: string | null;
    serial: string;
  };
  set: {
    name: string;
    slug: string;
    sport: string;
  };
};

export type PendingPullRequest = {
  id: string;
  reportedByName: string | null;
  proofUrl: string | null;
  estimatedValue: string | null;
  createdAt: Date;
  submittedBy: {
    displayName: string | null;
    email: string | null;
  };
  card: {
    id: string;
    slug: string;
    player: string;
    cardName: string;
    cardNumber: number | null;
    parallel: string | null;
    serial: string;
    printRun: number | null;
  };
  set: {
    name: string;
    slug: string;
    sport: string;
  };
};

export async function getPendingClaimRequests() {
  const db = getDb();

  if (!db) {
    return {
      databaseReady: false,
      requests: [] as PendingClaimRequest[],
    };
  }

  const rows = await db
    .select({
      id: claims.id,
      ownerDisplayName: claims.ownerDisplayName,
      proofUrl: claims.proofUrl,
      imageUrl: claims.imageUrl,
      note: claims.note,
      createdAt: claims.createdAt,
      cardId: cards.id,
      cardSlug: cards.slug,
      player: cards.playerName,
      cardName: cards.cardName,
      cardNumber: cards.cardNumber,
      parallel: cards.parallel,
      serial: cards.serialNumber,
      setName: cardSets.name,
      setSlug: cardSets.slug,
      sport: cardSets.sport,
    })
    .from(claims)
    .innerJoin(cards, eq(claims.cardId, cards.id))
    .innerJoin(cardSets, eq(cards.setId, cardSets.id))
    .where(eq(claims.verificationStatus, "pending"))
    .orderBy(desc(claims.createdAt));

  return {
    databaseReady: true,
    requests: rows.map((row) => ({
      id: row.id,
      ownerDisplayName: row.ownerDisplayName,
      proofUrl: row.proofUrl,
      imageUrl: row.imageUrl,
      note: row.note,
      createdAt: row.createdAt,
      card: {
        id: row.cardId,
        slug: row.cardSlug,
        player: row.player,
        cardName: row.cardName,
        cardNumber: row.cardNumber,
        parallel: row.parallel,
        serial: row.serial,
      },
      set: {
        name: row.setName,
        slug: row.setSlug,
        sport: row.sport,
      },
    })),
  };
}

export async function getPendingPullRequests() {
  const db = getDb();

  if (!db) {
    return {
      databaseReady: false,
      requests: [] as PendingPullRequest[],
    };
  }

  const rows = await db
    .select({
      id: pullReports.id,
      reportedByName: pullReports.reportedByName,
      proofUrl: pullReports.proofUrl,
      estimatedValue: pullReports.estimatedValue,
      createdAt: pullReports.createdAt,
      submittedByName: users.displayName,
      submittedByEmail: users.email,
      cardId: cards.id,
      cardSlug: cards.slug,
      player: cards.playerName,
      cardName: cards.cardName,
      cardNumber: cards.cardNumber,
      parallel: cards.parallel,
      serial: cards.serialNumber,
      printRun: cards.printRun,
      setName: cardSets.name,
      setSlug: cardSets.slug,
      sport: cardSets.sport,
    })
    .from(pullReports)
    .innerJoin(cards, eq(pullReports.cardId, cards.id))
    .innerJoin(cardSets, eq(cards.setId, cardSets.id))
    .leftJoin(users, eq(pullReports.userId, users.id))
    .where(eq(pullReports.verificationStatus, "pending"))
    .orderBy(desc(pullReports.createdAt));

  return {
    databaseReady: true,
    requests: rows.map((row) => ({
      id: row.id,
      reportedByName: row.reportedByName,
      proofUrl: row.proofUrl,
      estimatedValue: row.estimatedValue,
      createdAt: row.createdAt,
      submittedBy: {
        displayName: row.submittedByName,
        email: row.submittedByEmail,
      },
      card: {
        id: row.cardId,
        slug: row.cardSlug,
        player: row.player,
        cardName: row.cardName,
        cardNumber: row.cardNumber,
        parallel: row.parallel,
        printRun: row.printRun,
        serial: row.serial,
      },
      set: {
        name: row.setName,
        slug: row.setSlug,
        sport: row.sport,
      },
    })),
  };
}

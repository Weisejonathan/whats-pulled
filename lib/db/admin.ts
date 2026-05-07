import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { cards, cardSets, claims } from "./schema";

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

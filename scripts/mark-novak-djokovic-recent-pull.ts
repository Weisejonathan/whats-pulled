import "../lib/db/load-env";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { breakers, cards, pullReports } from "../lib/db/schema";
import { slugify } from "../lib/slug";

const CARD_SLUG = "novak-djokovic-1-superfractor";
const BREAKER_NAME = "Erick Schmerick23";
const IMAGE_URL = "/card-images/novak-djokovic-superfractor-1-1.jpg";

async function main() {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  const now = new Date();
  const breakerSlug = slugify(BREAKER_NAME);

  const [card] = await db
    .select({
      id: cards.id,
      slug: cards.slug,
    })
    .from(cards)
    .where(eq(cards.slug, CARD_SLUG))
    .limit(1);

  if (!card) {
    throw new Error(`Card not found: ${CARD_SLUG}`);
  }

  const [breaker] = await db
    .insert(breakers)
    .values({
      displayName: BREAKER_NAME,
      slug: breakerSlug,
      verified: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: breakers.slug,
      set: {
        displayName: BREAKER_NAME,
        verified: true,
        updatedAt: now,
      },
    })
    .returning();

  await db
    .insert(pullReports)
    .values({
      cardId: card.id,
      breakerId: breaker.id,
      reportedByName: BREAKER_NAME,
      proofUrl: IMAGE_URL,
      externalRef: `recent-pull-${card.id}-${breakerSlug}`,
      pulledAt: now,
      verificationStatus: "verified",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pullReports.externalRef,
      set: {
        breakerId: breaker.id,
        reportedByName: BREAKER_NAME,
        proofUrl: IMAGE_URL,
        pulledAt: now,
        verificationStatus: "verified",
        updatedAt: now,
      },
    });

  await db
    .update(cards)
    .set({
      status: "pulled",
      imageUrl: IMAGE_URL,
      updatedAt: now,
    })
    .where(eq(cards.id, card.id));

  console.log(`Marked ${card.slug} as pulled by ${BREAKER_NAME}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

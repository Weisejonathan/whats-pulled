import "../lib/db/load-env";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import {
  breakers,
  cards,
  cardSets,
  listings,
  pullReports,
  stores,
} from "../lib/db/schema";

const db = getDb();

if (!db) {
  throw new Error(
    "DATABASE_URL is missing. Add it to .env.local or .env before running db:seed.",
  );
}

const now = new Date();

const [tennisSet] = await db
  .insert(cardSets)
  .values({
    name: "Topps Chrome Tennis 2025",
    slug: "topps-chrome-tennis-2025",
    brand: "Topps",
    year: 2025,
    sport: "Tennis",
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: cardSets.slug,
    set: {
      name: "Topps Chrome Tennis 2025",
      brand: "Topps",
      year: 2025,
      sport: "Tennis",
      updatedAt: now,
    },
  })
  .returning();

const [courtKings] = await db
  .insert(breakers)
  .values({
    displayName: "Court Kings Breaks",
    slug: "court-kings-breaks",
    country: "US",
    verified: true,
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: breakers.slug,
    set: {
      displayName: "Court Kings Breaks",
      country: "US",
      verified: true,
      updatedAt: now,
    },
  })
  .returning();

const [nordicStore] = await db
  .insert(stores)
  .values({
    displayName: "Nordic Card Store",
    slug: "nordic-card-store",
    country: "FI",
    verified: true,
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: stores.slug,
    set: {
      displayName: "Nordic Card Store",
      country: "FI",
      verified: true,
      updatedAt: now,
    },
  })
  .returning();

const demoCards = [
  {
    playerName: "Carlos Alcaraz",
    slug: "carlos-alcaraz-1-1-superfractor",
    cardName: "Topps Chrome Tennis 2025",
    parallel: "Superfractor",
    serialNumber: "1/1",
    status: "pulled" as const,
    estimatedValue: "18500.00",
  },
  {
    playerName: "Novak Djokovic",
    slug: "novak-djokovic-1-1-superfractor",
    cardName: "Topps Chrome Tennis 2025",
    parallel: "Superfractor",
    serialNumber: "1/1",
    status: "open" as const,
    estimatedValue: null,
  },
  {
    playerName: "Jannik Sinner",
    slug: "jannik-sinner-red-refractor-5",
    cardName: "Topps Chrome Tennis 2025",
    parallel: "Red Refractor",
    serialNumber: "/5",
    status: "available" as const,
    estimatedValue: "4200.00",
  },
];

for (const card of demoCards) {
  await db
    .insert(cards)
    .values({
      ...card,
      setId: tennisSet.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cards.slug,
      set: {
        ...card,
        setId: tennisSet.id,
        updatedAt: now,
      },
    });
}

const [alcaraz] = await db
  .select()
  .from(cards)
  .where(eq(cards.slug, "carlos-alcaraz-1-1-superfractor"))
  .limit(1);

const [sinner] = await db
  .select()
  .from(cards)
  .where(eq(cards.slug, "jannik-sinner-red-refractor-5"))
  .limit(1);

await db
  .insert(pullReports)
  .values({
    cardId: alcaraz.id,
    breakerId: courtKings.id,
    reportedByName: "Whats Pulled Demo",
    proofUrl: "https://example.com/demo/carlos-alcaraz-superfractor",
    externalRef: "demo-carlos-alcaraz-pull",
    pulledAt: now,
    estimatedValue: "18500.00",
    verificationStatus: "verified",
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: pullReports.externalRef,
    set: {
      cardId: alcaraz.id,
      breakerId: courtKings.id,
      estimatedValue: "18500.00",
      verificationStatus: "verified",
      updatedAt: now,
    },
  });

await db
  .insert(listings)
  .values({
    cardId: sinner.id,
    storeId: nordicStore.id,
    price: "4200.00",
    currency: "USD",
    imageUrl: "https://example.com/demo/jannik-sinner-red-refractor",
    externalRef: "demo-jannik-sinner-listing",
    status: "active",
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: listings.externalRef,
    set: {
      cardId: sinner.id,
      storeId: nordicStore.id,
      price: "4200.00",
      currency: "USD",
      status: "active",
      updatedAt: now,
    },
  });

console.log("Seeded Whats Pulled demo database.");

import { unstable_cache } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, cardSets } from "@/lib/db/schema";
import { PUBLIC_DATA_CACHE_TAG } from "@/lib/db/public-cache";

export const loadDetectorSets = unstable_cache(async () => {
  const db = getDb();
  if (!db) return [];
  return db.select({ id: cardSets.id, name: cardSets.name, year: cardSets.year })
    .from(cardSets).orderBy(asc(cardSets.name));
}, ["detector-sets-v2"], { revalidate: 3600, tags: [PUBLIC_DATA_CACHE_TAG] });

export const loadDetectorPlayers = unstable_cache(async (setId: string | null = null) => {
  const db = getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ name: cards.playerName }).from(cards)
    .where(setId ? eq(cards.setId, setId) : undefined).orderBy(asc(cards.playerName));
  return rows.map((row) => row.name);
}, ["detector-players-v2"], { revalidate: 3600, tags: [PUBLIC_DATA_CACHE_TAG] });

export const loadDetectorVariants = unstable_cache(async (setId: string) => {
  const db = getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ name: cards.parallel }).from(cards)
    .where(eq(cards.setId, setId)).orderBy(asc(cards.parallel));
  return rows.map(row => row.name).filter((name): name is string => Boolean(name));
}, ["detector-variants-v1"], { revalidate: 3600, tags: [PUBLIC_DATA_CACHE_TAG] });

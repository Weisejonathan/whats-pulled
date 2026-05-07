import { and, asc, desc, eq } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import { getDb } from "./client";
import {
  breakers,
  cards,
  cardSets,
  listings,
  pullReports,
  stores,
} from "./schema";

export type CatalogCard = {
  id: string;
  player: string;
  cardName: string;
  parallel: string | null;
  serial: string;
  status: "Open" | "Pulled" | "Claimed" | "Available" | "Sold";
  attribution: string;
  value: string;
};

export type CatalogSet = {
  id: string;
  name: string;
  slug: string;
  brand: string;
  year: number;
  sport: string;
  sportSlug: string;
  cards: CatalogCard[];
};

export type SportCatalog = {
  sport: string;
  sportSlug: string;
  sets: CatalogSet[];
};

export type SportOverview = {
  sport: string;
  sportSlug: string;
  setCount: number;
  cardCount: number;
};

const demoSet: CatalogSet = {
  id: "demo-topps-chrome-tennis-2025",
  name: "Topps Chrome Tennis 2025",
  slug: "topps-chrome-tennis-2025",
  brand: "Topps",
  year: 2025,
  sport: "Tennis",
  sportSlug: "tennis",
  cards: [
    {
      id: "demo-carlos-alcaraz",
      player: "Carlos Alcaraz",
      cardName: "Topps Chrome Tennis 2025",
      parallel: "Superfractor",
      serial: "1/1",
      status: "Pulled",
      attribution: "Court Kings Breaks",
      value: "$18,500",
    },
    {
      id: "demo-novak-djokovic",
      player: "Novak Djokovic",
      cardName: "Topps Chrome Tennis 2025",
      parallel: "Superfractor",
      serial: "1/1",
      status: "Open",
      attribution: "-",
      value: "-",
    },
    {
      id: "demo-jannik-sinner",
      player: "Jannik Sinner",
      cardName: "Topps Chrome Tennis 2025",
      parallel: "Red Refractor",
      serial: "/5",
      status: "Available",
      attribution: "Nordic Card Store",
      value: "$4,200",
    },
  ],
};

const demoSports: SportCatalog[] = [
  {
    sport: "Tennis",
    sportSlug: "tennis",
    sets: [demoSet],
  },
];

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

const toDisplayStatus = (status: string): CatalogCard["status"] => {
  if (status === "pulled") return "Pulled";
  if (status === "claimed") return "Claimed";
  if (status === "available") return "Available";
  if (status === "sold") return "Sold";
  return "Open";
};

async function getCatalogSets(): Promise<CatalogSet[]> {
  const db = getDb();

  if (!db) {
    return [demoSet];
  }

  try {
    const rows = await db
      .select({
        setId: cardSets.id,
        setName: cardSets.name,
        setSlug: cardSets.slug,
        brand: cardSets.brand,
        year: cardSets.year,
        sport: cardSets.sport,
        cardId: cards.id,
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
      .from(cardSets)
      .leftJoin(cards, eq(cards.setId, cardSets.id))
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
      .orderBy(desc(cardSets.year), asc(cardSets.name), asc(cards.playerName));

    const sets = new Map<string, CatalogSet>();

    for (const row of rows) {
      const existingSet = sets.get(row.setId);
      const set =
        existingSet ??
        {
          id: row.setId,
          name: row.setName,
          slug: row.setSlug,
          brand: row.brand,
          year: row.year,
          sport: row.sport,
          sportSlug: slugify(row.sport),
          cards: [],
        };

      if (!existingSet) {
        sets.set(row.setId, set);
      }

      if (!row.cardId) {
        continue;
      }

      const status = toDisplayStatus(row.status ?? "open");
      const isAvailable = status === "Available" && row.listingPrice;

      set.cards.push({
        id: row.cardId,
        player: row.player ?? "Unknown player",
        cardName: row.cardName ?? row.setName,
        parallel: row.parallel,
        serial: row.serial ?? "-",
        status,
        attribution: (isAvailable ? row.storeName : row.breakerName) ?? "-",
        value: formatCurrency(
          isAvailable ? row.listingPrice : row.estimatedValue,
          row.listingCurrency ?? "USD",
        ),
      });
    }

    return sets.size ? Array.from(sets.values()) : [demoSet];
  } catch (error) {
    console.error("Failed to load catalog data", error);
    return [demoSet];
  }
}

export async function getSportsOverview(): Promise<SportOverview[]> {
  const sets = await getCatalogSets();
  const sports = new Map<string, SportOverview>();

  for (const set of sets) {
    const existingSport = sports.get(set.sportSlug);

    if (existingSport) {
      existingSport.setCount += 1;
      existingSport.cardCount += set.cards.length;
    } else {
      sports.set(set.sportSlug, {
        sport: set.sport,
        sportSlug: set.sportSlug,
        setCount: 1,
        cardCount: set.cards.length,
      });
    }
  }

  return Array.from(sports.values());
}

export async function getSportCatalog(sportSlug: string): Promise<SportCatalog | null> {
  const normalizedSlug = slugify(sportSlug);
  const sets = (await getCatalogSets()).filter((set) => set.sportSlug === normalizedSlug);

  if (!sets.length) {
    return demoSports.find((sport) => sport.sportSlug === normalizedSlug) ?? null;
  }

  return {
    sport: sets[0].sport,
    sportSlug: sets[0].sportSlug,
    sets,
  };
}

export async function getSetCatalog(setSlug: string): Promise<CatalogSet | null> {
  const normalizedSlug = slugify(setSlug);
  const sets = await getCatalogSets();
  return sets.find((set) => set.slug === normalizedSlug) ?? null;
}

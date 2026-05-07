import { and, asc, desc, eq, sql } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import { getDb } from "./client";
import {
  cards,
  cardSets,
  claims,
  listings,
  pullReports,
  stores,
} from "./schema";

export type CatalogCard = {
  id: string;
  slug: string;
  player: string;
  cardName: string;
  cardNumber: number | null;
  isRookie: boolean;
  parallel: string | null;
  serial: string;
  printRun: number | null;
  pulledCount: number;
  claimedCount: number;
  pendingClaimCount: number;
  pulledLabel: string;
  status: "Open" | "Pulled" | "Claimed" | "Available" | "Sold";
  attribution: string;
  value: string;
  imageUrl: string | null;
  sourceUrl: string | null;
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

export type CardVariantGroup = {
  key: string;
  primary: CatalogCard;
  variants: CatalogCard[];
  pulledCopies: number;
  totalCopies: number;
  completeVariants: number;
  isComplete: boolean;
};

export type CardCatalogDetail = {
  card: CatalogCard;
  set: Omit<CatalogSet, "cards">;
  variants: CatalogCard[];
};

export type SportCatalog = {
  sport: string;
  sportSlug: string;
  sets: CatalogSet[];
};

export type SportOverview = {
  sport: string;
  sportSlug: string;
  displayName: string;
  setCount: number;
  cardCount: number;
  pulledCardCount: number;
  pullProgressPercent: number;
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
      slug: "carlos-alcaraz-1-superfractor",
      player: "Carlos Alcaraz",
      cardName: "Topps Chrome Tennis 2025",
      cardNumber: 1,
      isRookie: false,
      parallel: "Superfractor",
      serial: "1/1",
      printRun: 1,
      pulledCount: 1,
      claimedCount: 0,
      pendingClaimCount: 0,
      pulledLabel: "1 / 1 pulled",
      status: "Pulled",
      attribution: "Court Kings Breaks",
      value: "$18,500",
      imageUrl: null,
      sourceUrl:
        "https://www.sportscardspro.com/game/tennis-cards-2025-topps-chrome/carlos-alcaraz-superfractor-1",
    },
    {
      id: "demo-novak-djokovic",
      slug: "novak-djokovic-1-superfractor",
      player: "Novak Djokovic",
      cardName: "Topps Chrome Tennis 2025",
      cardNumber: 100,
      isRookie: false,
      parallel: "Superfractor",
      serial: "1/1",
      printRun: 1,
      pulledCount: 0,
      claimedCount: 0,
      pendingClaimCount: 0,
      pulledLabel: "0 / 1 pulled",
      status: "Open",
      attribution: "-",
      value: "-",
      imageUrl: null,
      sourceUrl:
        "https://www.sportscardspro.com/game/tennis-cards-2025-topps-chrome/novak-djokovic-superfractor-100",
    },
    {
      id: "demo-jannik-sinner",
      slug: "jannik-sinner-5-red-refractor",
      player: "Jannik Sinner",
      cardName: "Topps Chrome Tennis 2025",
      cardNumber: null,
      isRookie: false,
      parallel: "Red Refractor",
      serial: "/5",
      printRun: 5,
      pulledCount: 1,
      claimedCount: 0,
      pendingClaimCount: 0,
      pulledLabel: "1 / 5 pulled",
      status: "Available",
      attribution: "Nordic Card Store",
      value: "$4,200",
      imageUrl: null,
      sourceUrl: null,
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

const formatPulledLabel = (pulledCount: number, printRun: number | null) => {
  if (!printRun || printRun <= 0) {
    return `${pulledCount} pulled`;
  }

  return `${Math.min(pulledCount, printRun)} / ${printRun} pulled`;
};

const normalizePlayerName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();

const rookiePlayers = new Set(
  [
    "Flavio Cobolli",
    "Matteo Arnaldi",
    "Carel Ngounoue",
    "Mariano Navone",
    "Elina Avanesyan",
    "Peyton Stearns",
    "Giovanni Mpetshi Perricard",
    "Alexander Shevchenko",
    "Clervie Ngounoue",
    "Yunchaokete Bu",
    "Olivia Gadecki",
    "Yannick Hanfmann",
    "Jake Fearnley",
    "Julia Riera",
    "Thiago Agustin Tirante",
    "Valentin Vacherot",
    "Roman Andres Burruchaga",
    "Matteo Gigante",
    "Elsa Jacquemot",
    "Jaime Faria",
    "Terence Atmane",
    "Tristan Boyer",
    "Raphael Collignon",
    "Juan Pablo Ficovich",
    "Leolia Jeanjean",
    "Timofey Skatov",
    "Iva Jovic",
    "Kaylan Bigun",
    "Cooper Woestendick",
    "Alexis Galarneau",
    "Eliakim Coulibaly",
    "Tara Wuerth",
    "Katrina Scott",
    "Lukas Neumayer",
    "Francesco Maestrelli",
    "Gabriel Debru",
    "Fabian Marozsan",
    "Maya Joint",
    "Linda Noskova",
    "Alex Michelsen",
    "Jagger Leach",
    "Alycia Parks",
    "Arthur Cazaux",
    "Luciano Darderi",
    "Marina Stakusic",
  ].map(normalizePlayerName),
);

const isRookiePlayer = (playerName: string) =>
  rookiePlayers.has(normalizePlayerName(playerName));

const sortVariants = (variants: CatalogCard[]) =>
  [...variants].sort((a, b) => (a.printRun ?? 999999) - (b.printRun ?? 999999));

export const groupCatalogCards = (cards: CatalogCard[]): CardVariantGroup[] => {
  const groups = new Map<string, CatalogCard[]>();

  for (const card of cards) {
    const key = card.cardNumber ? String(card.cardNumber) : card.slug;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }

  return Array.from(groups.entries())
    .map(([key, cardsInGroup]) => {
      const variants = sortVariants(cardsInGroup);
      const primary =
        variants.find((card) => card.parallel?.toLowerCase().includes("superfractor")) ??
        variants[0];
      const totalCopies = variants.reduce(
        (total, card) => total + Math.max(card.printRun ?? 1, 1),
        0,
      );
      const pulledCopies = variants.reduce(
        (total, card) => total + Math.min(card.pulledCount, card.printRun ?? card.pulledCount),
        0,
      );
      const completeVariants = variants.filter(
        (card) => card.printRun && card.pulledCount >= card.printRun,
      ).length;

      return {
        key,
        primary,
        variants,
        pulledCopies,
        totalCopies,
        completeVariants,
        isComplete: totalCopies > 0 && pulledCopies >= totalCopies,
      };
    })
    .sort(
      (a, b) =>
        (a.primary.cardNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.primary.cardNumber ?? Number.MAX_SAFE_INTEGER),
    );
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
        cardSlug: cards.slug,
        player: cards.playerName,
        cardName: cards.cardName,
        cardNumber: cards.cardNumber,
        parallel: cards.parallel,
        serial: cards.serialNumber,
        printRun: cards.printRun,
        pulledCount: sql<number>`cast((
          select count(*)
          from ${pullReports}
          where ${pullReports.cardId} = ${cards.id}
            and ${pullReports.verificationStatus} = 'verified'
        ) as integer)`,
        claimedCount: sql<number>`cast((
          select count(*)
          from ${claims}
          where ${claims.cardId} = ${cards.id}
            and ${claims.verificationStatus} = 'verified'
        ) as integer)`,
        pendingClaimCount: sql<number>`cast((
          select count(*)
          from ${claims}
          where ${claims.cardId} = ${cards.id}
            and ${claims.verificationStatus} = 'pending'
        ) as integer)`,
        status: cards.status,
        estimatedValue: cards.estimatedValue,
        imageUrl: cards.imageUrl,
        sourceUrl: cards.sourceUrl,
        breakerName: sql<string | null>`(
          select b.display_name
          from pull_reports pr
          left join breakers b on b.id = pr.breaker_id
          where pr.card_id = ${cards.id}
            and pr.verification_status = 'verified'
          order by pr.pulled_at desc nulls last, pr.created_at desc
          limit 1
        )`,
        storeName: stores.displayName,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
      })
      .from(cardSets)
      .leftJoin(cards, eq(cards.setId, cardSets.id))
      .leftJoin(
        listings,
        and(eq(listings.cardId, cards.id), eq(listings.status, "active")),
      )
      .leftJoin(stores, eq(listings.storeId, stores.id))
      .orderBy(
        desc(cardSets.year),
        asc(cardSets.name),
        asc(cards.cardNumber),
        asc(cards.playerName),
        asc(cards.printRun),
      );

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
      const pulledCount = row.pulledCount ?? 0;
      const claimedCount = row.claimedCount ?? 0;
      const pendingClaimCount = row.pendingClaimCount ?? 0;
      const displayStatus =
        claimedCount > 0 ? "Claimed" : pulledCount > 0 ? "Pulled" : status;

      set.cards.push({
        id: row.cardId,
        slug: row.cardSlug ?? row.cardId,
        player: row.player ?? "Unknown player",
        cardName: row.cardName ?? row.setName,
        cardNumber: row.cardNumber,
        isRookie: isRookiePlayer(row.player ?? ""),
        parallel: row.parallel,
        serial: row.serial ?? "-",
        printRun: row.printRun,
        pulledCount,
        claimedCount,
        pendingClaimCount,
        pulledLabel: formatPulledLabel(pulledCount, row.printRun),
        status: displayStatus,
        attribution: (isAvailable ? row.storeName : row.breakerName) ?? "-",
        value: formatCurrency(
          isAvailable ? row.listingPrice : row.estimatedValue,
          row.listingCurrency ?? "USD",
        ),
        imageUrl: row.imageUrl,
        sourceUrl: row.sourceUrl,
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
    const pulledCardCount = set.cards.filter((card) => card.pulledCount > 0).length;

    if (existingSport) {
      existingSport.setCount += 1;
      existingSport.cardCount += set.cards.length;
      existingSport.pulledCardCount += pulledCardCount;
      existingSport.pullProgressPercent = existingSport.cardCount
        ? (existingSport.pulledCardCount / existingSport.cardCount) * 100
        : 0;
    } else {
      const displayName =
        set.sportSlug === "tennis" && set.slug === "topps-chrome-tennis-2025"
          ? "Tennis Chrome 2025"
          : set.sport;

      sports.set(set.sportSlug, {
        sport: set.sport,
        sportSlug: set.sportSlug,
        displayName,
        setCount: 1,
        cardCount: set.cards.length,
        pulledCardCount,
        pullProgressPercent: set.cards.length
          ? (pulledCardCount / set.cards.length) * 100
          : 0,
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

export async function getCardCatalog(cardSlug: string): Promise<CardCatalogDetail | null> {
  const normalizedSlug = slugify(cardSlug);
  const sets = await getCatalogSets();

  for (const set of sets) {
    const card = set.cards.find((candidate) => candidate.slug === normalizedSlug);

    if (card) {
      const { cards: _cards, ...setMeta } = set;
      const variants = set.cards
        .filter(
          (candidate) =>
            candidate.cardNumber === card.cardNumber &&
            candidate.player === card.player,
        )
        .sort((a, b) => (a.printRun ?? 999999) - (b.printRun ?? 999999));

      return {
        card,
        set: setMeta,
        variants,
      };
    }
  }

  return null;
}

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import { getDb } from "./client";
import {
  cards,
  cardSets,
  cardBids,
  cardFavorites,
  breakers,
  claims,
  listings,
  pullReports,
  stores,
  tennisPlayerProfiles,
} from "./schema";

export type CatalogCard = {
  id: string;
  slug: string;
  player: string;
  playerCountry: string | null;
  playerCountryCode: string | null;
  playerRanking: number | null;
  playerRankingMovement: number | null;
  playerRankingPoints: number | null;
  playerRaceRanking: number | null;
  playerRaceRankingMovement: number | null;
  playerRaceRankingPoints: number | null;
  playerRankingSyncedAt: Date | null;
  cardName: string;
  cardNumber: number | null;
  isRookie: boolean;
  parallel: string | null;
  serial: string;
  printRun: number | null;
  pulledCount: number;
  claimedCount: number;
  pendingPullCount: number;
  pendingClaimCount: number;
  remainingCopies: number | null;
  ownerDisplayName: string | null;
  ownedAt: Date | null;
  pulledBy: string | null;
  pulledAt: Date | null;
  favoriteCount: number;
  bidCount: number;
  highestBid: string;
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

export type CardCopyStatus = "Open" | "Pending" | "Pulled" | "Claimed";

export type CardCopyState = {
  copyNumber: number;
  label: string;
  marker: string | null;
  status: CardCopyStatus;
  ownerDisplayName: string | null;
  ownedAt: Date | null;
  pulledBy: string | null;
  pulledAt: Date | null;
  bidCount: number;
  highestBid: string;
  favoriteCount: number;
};

export type CardCatalogDetail = {
  card: CatalogCard;
  set: Omit<CatalogSet, "cards">;
  variants: CatalogCard[];
  copies: CardCopyState[];
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
  sets: {
    name: string;
    slug: string;
    cardCount: number;
    pulledCardCount: number;
    pullProgressPercent: number;
  }[];
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
      playerCountry: "Spain",
      playerCountryCode: "ESP",
      playerRanking: 1,
      playerRankingMovement: 0,
      playerRankingPoints: 0,
      playerRaceRanking: 1,
      playerRaceRankingMovement: 0,
      playerRaceRankingPoints: 0,
      playerRankingSyncedAt: null,
      cardName: "Topps Chrome Tennis 2025",
      cardNumber: 1,
      isRookie: false,
      parallel: "Superfractor",
      serial: "1/1",
      printRun: 1,
      pulledCount: 1,
      claimedCount: 0,
      pendingPullCount: 0,
      pendingClaimCount: 0,
      remainingCopies: 0,
      ownerDisplayName: null,
      ownedAt: null,
      pulledBy: "Court Kings Breaks",
      pulledAt: null,
      favoriteCount: 0,
      bidCount: 0,
      highestBid: "-",
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
      playerCountry: "Serbia",
      playerCountryCode: "SRB",
      playerRanking: 4,
      playerRankingMovement: 0,
      playerRankingPoints: 0,
      playerRaceRanking: null,
      playerRaceRankingMovement: null,
      playerRaceRankingPoints: null,
      playerRankingSyncedAt: null,
      cardName: "Topps Chrome Tennis 2025",
      cardNumber: 100,
      isRookie: false,
      parallel: "Superfractor",
      serial: "1/1",
      printRun: 1,
      pulledCount: 0,
      claimedCount: 0,
      pendingPullCount: 0,
      pendingClaimCount: 0,
      remainingCopies: 1,
      ownerDisplayName: null,
      ownedAt: null,
      pulledBy: null,
      pulledAt: null,
      favoriteCount: 0,
      bidCount: 0,
      highestBid: "-",
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
      playerCountry: "Italy",
      playerCountryCode: "ITA",
      playerRanking: 2,
      playerRankingMovement: 0,
      playerRankingPoints: 0,
      playerRaceRanking: 2,
      playerRaceRankingMovement: 0,
      playerRaceRankingPoints: 0,
      playerRankingSyncedAt: null,
      cardName: "Topps Chrome Tennis 2025",
      cardNumber: null,
      isRookie: false,
      parallel: "Red Refractor",
      serial: "/5",
      printRun: 5,
      pulledCount: 1,
      claimedCount: 0,
      pendingPullCount: 0,
      pendingClaimCount: 0,
      remainingCopies: 4,
      ownerDisplayName: null,
      ownedAt: null,
      pulledBy: "Nordic Card Store",
      pulledAt: null,
      favoriteCount: 0,
      bidCount: 0,
      highestBid: "-",
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

const formatCopyLabel = (copyNumber: number, printRun: number) => {
  const width = String(printRun).length;
  return `${String(copyNumber).padStart(width, "0")}/${String(printRun).padStart(width, "0")}`;
};

const getCopyMarker = (copyNumber: number, printRun: number) => {
  if (copyNumber === 1 && copyNumber === printRun) return "First + Bookend";
  if (copyNumber === 1) return "First of Print";
  if (copyNumber === printRun) return "Bookend";
  return null;
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
    const autographCode = card.sourceUrl?.match(/ca-[a-z0-9]+/i)?.[0] ?? null;
    const key = card.cardNumber ? String(card.cardNumber) : autographCode ?? card.slug;
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
        playerCountry: tennisPlayerProfiles.country,
        playerCountryCode: tennisPlayerProfiles.countryCode,
        playerRanking: tennisPlayerProfiles.singlesRanking,
        playerRankingMovement: tennisPlayerProfiles.singlesRankingMovement,
        playerRankingPoints: tennisPlayerProfiles.singlesRankingPoints,
        playerRaceRanking: tennisPlayerProfiles.raceRanking,
        playerRaceRankingMovement: tennisPlayerProfiles.raceRankingMovement,
        playerRaceRankingPoints: tennisPlayerProfiles.raceRankingPoints,
        playerRankingSyncedAt: tennisPlayerProfiles.syncedAt,
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
        pendingPullCount: sql<number>`cast((
          select count(*)
          from ${pullReports}
          where ${pullReports.cardId} = ${cards.id}
            and ${pullReports.verificationStatus} = 'pending'
        ) as integer)`,
        pendingClaimCount: sql<number>`cast((
          select count(*)
          from ${claims}
          where ${claims.cardId} = ${cards.id}
            and ${claims.verificationStatus} = 'pending'
        ) as integer)`,
        ownerDisplayName: sql<string | null>`(
          select c.owner_display_name
          from claims c
          where c.card_id = ${cards.id}
            and c.verification_status = 'verified'
          order by c.claimed_at desc nulls last, c.created_at desc
          limit 1
        )`,
        ownedAt: sql<Date | null>`(
          select c.claimed_at
          from claims c
          where c.card_id = ${cards.id}
            and c.verification_status = 'verified'
          order by c.claimed_at desc nulls last, c.created_at desc
          limit 1
        )`,
        status: cards.status,
        estimatedValue: cards.estimatedValue,
        imageUrl: cards.imageUrl,
        sourceUrl: cards.sourceUrl,
        breakerName: sql<string | null>`(
          select coalesce(b.display_name, pr.reported_by_name)
          from pull_reports pr
          left join breakers b on b.id = pr.breaker_id
          where pr.card_id = ${cards.id}
            and pr.verification_status = 'verified'
          order by pr.pulled_at desc nulls last, pr.created_at desc
          limit 1
        )`,
        pulledAt: sql<Date | null>`(
          select pr.pulled_at
          from pull_reports pr
          where pr.card_id = ${cards.id}
            and pr.verification_status = 'verified'
          order by pr.pulled_at desc nulls last, pr.created_at desc
          limit 1
        )`,
        favoriteCount: sql<number>`cast((
          select count(*)
          from ${cardFavorites}
          where ${cardFavorites.cardId} = ${cards.id}
        ) as integer)`,
        bidCount: sql<number>`cast((
          select count(*)
          from ${cardBids}
          where ${cardBids.cardId} = ${cards.id}
        ) as integer)`,
        highestBidAmount: sql<string | null>`(
          select cb.amount
          from card_bids cb
          where cb.card_id = ${cards.id}
          order by cb.amount desc, cb.created_at desc
          limit 1
        )`,
        highestBidCurrency: sql<string | null>`(
          select cb.currency
          from card_bids cb
          where cb.card_id = ${cards.id}
          order by cb.amount desc, cb.created_at desc
          limit 1
        )`,
        storeName: stores.displayName,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
      })
      .from(cardSets)
      .leftJoin(cards, eq(cards.setId, cardSets.id))
      .leftJoin(tennisPlayerProfiles, eq(tennisPlayerProfiles.playerName, cards.playerName))
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
      const pendingPullCount = row.pendingPullCount ?? 0;
      const pendingClaimCount = row.pendingClaimCount ?? 0;
      const remainingCopies = row.printRun ? Math.max(0, row.printRun - pulledCount) : null;
      const displayStatus =
        row.printRun && pulledCount >= row.printRun
          ? claimedCount > 0
            ? "Claimed"
            : "Pulled"
          : claimedCount > 0
            ? "Claimed"
            : pulledCount > 0
              ? "Pulled"
              : status;

      set.cards.push({
        id: row.cardId,
        slug: row.cardSlug ?? row.cardId,
        player: row.player ?? "Unknown player",
        playerCountry: row.playerCountry,
        playerCountryCode: row.playerCountryCode,
        playerRanking: row.playerRanking,
        playerRankingMovement: row.playerRankingMovement,
        playerRankingPoints: row.playerRankingPoints,
        playerRaceRanking: row.playerRaceRanking,
        playerRaceRankingMovement: row.playerRaceRankingMovement,
        playerRaceRankingPoints: row.playerRaceRankingPoints,
        playerRankingSyncedAt: row.playerRankingSyncedAt,
        cardName: row.cardName ?? row.setName,
        cardNumber: row.cardNumber,
        isRookie: isRookiePlayer(row.player ?? ""),
        parallel: row.parallel,
        serial: row.serial ?? "-",
        printRun: row.printRun,
        pulledCount,
        claimedCount,
        pendingPullCount,
        pendingClaimCount,
        remainingCopies,
        ownerDisplayName: row.ownerDisplayName,
        ownedAt: row.ownedAt,
        pulledBy: row.breakerName,
        pulledAt: row.pulledAt,
        favoriteCount: row.favoriteCount ?? 0,
        bidCount: row.bidCount ?? 0,
        highestBid: formatCurrency(row.highestBidAmount, row.highestBidCurrency ?? "EUR"),
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
    const setOverview = {
      name: set.name,
      slug: set.slug,
      cardCount: set.cards.length,
      pulledCardCount,
      pullProgressPercent: set.cards.length
        ? (pulledCardCount / set.cards.length) * 100
        : 0,
    };

    if (existingSport) {
      existingSport.setCount += 1;
      existingSport.cardCount += set.cards.length;
      existingSport.pulledCardCount += pulledCardCount;
      existingSport.pullProgressPercent = existingSport.cardCount
        ? (existingSport.pulledCardCount / existingSport.cardCount) * 100
        : 0;
      existingSport.sets.push(setOverview);
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
        sets: [setOverview],
      });
    }
  }

  const sortSetsForOverview = (
    a: SportOverview["sets"][number],
    b: SportOverview["sets"][number],
  ) => {
    const aIsSapphire = a.name.toLowerCase().includes("sapphire");
    const bIsSapphire = b.name.toLowerCase().includes("sapphire");

    if (aIsSapphire !== bIsSapphire) {
      return aIsSapphire ? 1 : -1;
    }

    return a.name.localeCompare(b.name);
  };

  return Array.from(sports.values()).map((sport) => ({
    ...sport,
    sets: sport.sets.sort(sortSetsForOverview),
  }));
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
        copies: await getCardCopyStates(card),
      };
    }
  }

  return null;
}

async function getCardCopyStates(card: CatalogCard): Promise<CardCopyState[]> {
  const printRun = card.printRun;

  if (!printRun || printRun <= 0) {
    return [];
  }

  const baseCopies: CardCopyState[] = Array.from({ length: printRun }, (_, index) => {
    const copyNumber = index + 1;

    return {
      copyNumber,
      label: formatCopyLabel(copyNumber, printRun),
      marker: getCopyMarker(copyNumber, printRun),
      status: "Open" as CardCopyStatus,
      ownerDisplayName: null,
      ownedAt: null,
      pulledBy: null,
      pulledAt: null,
      bidCount: 0,
      highestBid: "-",
      favoriteCount: card.favoriteCount,
    };
  });

  const db = getDb();

  if (!db) {
    return baseCopies;
  }

  const [pullRows, claimRows, bidRows] = await Promise.all([
    db
      .select({
        copyNumber: pullReports.copyNumber,
        reportedByName: pullReports.reportedByName,
        breakerName: breakers.displayName,
        pulledAt: pullReports.pulledAt,
        verificationStatus: pullReports.verificationStatus,
        createdAt: pullReports.createdAt,
      })
      .from(pullReports)
      .leftJoin(breakers, eq(pullReports.breakerId, breakers.id))
      .where(
        and(
          eq(pullReports.cardId, card.id),
          inArray(pullReports.verificationStatus, ["pending", "verified"]),
        ),
      )
      .orderBy(desc(pullReports.pulledAt), desc(pullReports.createdAt)),
    db
      .select({
        copyNumber: claims.copyNumber,
        ownerDisplayName: claims.ownerDisplayName,
        claimedAt: claims.claimedAt,
        verificationStatus: claims.verificationStatus,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .where(
        and(
          eq(claims.cardId, card.id),
          inArray(claims.verificationStatus, ["pending", "verified"]),
        ),
      )
      .orderBy(desc(claims.claimedAt), desc(claims.createdAt)),
    db
      .select({
        copyNumber: cardBids.copyNumber,
        amount: cardBids.amount,
        currency: cardBids.currency,
        createdAt: cardBids.createdAt,
      })
      .from(cardBids)
      .where(eq(cardBids.cardId, card.id))
      .orderBy(desc(cardBids.amount), desc(cardBids.createdAt)),
  ]);

  const copies = new Map(baseCopies.map((copy) => [copy.copyNumber, copy]));

  for (const row of pullRows) {
    if (!row.copyNumber) continue;

    const copy = copies.get(row.copyNumber);

    if (!copy || copy.status === "Claimed" || copy.status === "Pulled") {
      continue;
    }

    copy.status = row.verificationStatus === "verified" ? "Pulled" : "Pending";
    copy.pulledBy = row.breakerName ?? row.reportedByName;
    copy.pulledAt = row.pulledAt;
  }

  for (const row of claimRows) {
    if (!row.copyNumber) continue;

    const copy = copies.get(row.copyNumber);

    if (!copy || copy.status === "Claimed") {
      continue;
    }

    copy.status = row.verificationStatus === "verified" ? "Claimed" : "Pending";
    copy.ownerDisplayName = row.ownerDisplayName;
    copy.ownedAt = row.claimedAt;
  }

  for (const copy of copies.values()) {
    const copyBids = bidRows.filter((bid) => bid.copyNumber === copy.copyNumber);
    copy.bidCount = copyBids.length;

    if (copyBids[0]) {
      copy.highestBid = formatCurrency(copyBids[0].amount, copyBids[0].currency);
    }
  }

  return Array.from(copies.values());
}

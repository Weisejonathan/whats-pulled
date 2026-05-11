import "../lib/db/load-env";

import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, cardSets, tennisPlayerProfiles } from "@/lib/db/schema";

type SportradarCompetitor = {
  id?: string;
  name?: string;
  country?: string;
  country_code?: string;
  abbreviation?: string;
  gender?: string;
};

type SportradarRankingEntry = {
  rank?: number;
  movement?: number;
  points?: number;
  competitions_played?: number;
  competitor?: SportradarCompetitor;
};

type SportradarRanking = {
  name?: string;
  gender?: string;
  competitor_rankings?: SportradarRankingEntry[];
};

type SportradarRankingsResponse = {
  rankings?: SportradarRanking[];
};

type RankingMatch = {
  ranking: SportradarRanking;
  entry: SportradarRankingEntry;
};

const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL?.trim() || "trial";
const language = process.env.SPORTRADAR_LANGUAGE?.trim() || "en";
const baseUrl = `https://api.sportradar.com/tennis/${accessLevel}/v3/${language}`;

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

const sportradarNameVariants = (name: string) => {
  const variants = new Set<string>([normalizeName(name)]);
  const [last, first] = name.split(",").map((part) => part.trim());

  if (last && first) {
    variants.add(normalizeName(`${first} ${last}`));
    variants.add(normalizeName(`${last} ${first}`));
  }

  return Array.from(variants);
};

const requestJson = async <T>(path: string): Promise<T> => {
  const apiKey = process.env.SPORTRADAR_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("SPORTRADAR_API_KEY is missing. Add it to .env.local or your Vercel env.");
  }

  const url = `${baseUrl}${path}`;
  let lastError = "";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    lastError = `${response.status} ${response.statusText}: ${await response.text()}`;

    if (response.status !== 429 || attempt === 4) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
  }

  throw new Error(`Sportradar request failed for ${path}: ${lastError}`);
};

const flattenRankings = (response: SportradarRankingsResponse) => {
  const byName = new Map<string, RankingMatch>();

  for (const ranking of response.rankings ?? []) {
    for (const entry of ranking.competitor_rankings ?? []) {
      const competitorName = entry.competitor?.name;

      if (!competitorName) {
        continue;
      }

      for (const variant of sportradarNameVariants(competitorName)) {
        byName.set(variant, { ranking, entry });
      }
    }
  }

  return byName;
};

async function main() {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing. Add it to .env.local before syncing rankings.");
  }

  const playerRows = await db
    .select({ playerName: cards.playerName })
    .from(cards)
    .innerJoin(cardSets, eq(cards.setId, cardSets.id))
    .where(sql`lower(${cardSets.sport}) = 'tennis'`)
    .orderBy(asc(cards.playerName));

  const playerNames = Array.from(new Set(playerRows.map((row) => row.playerName).filter(Boolean)));

  if (!playerNames.length) {
    console.log("No tennis players found in cards table.");
    return;
  }

  console.log(`Syncing Sportradar rankings for ${playerNames.length} tennis players...`);

  const rankings = flattenRankings(await requestJson<SportradarRankingsResponse>("/rankings.json"));
  await new Promise((resolve) => setTimeout(resolve, 2500));

  let raceRankings = new Map<string, RankingMatch>();

  try {
    raceRankings = flattenRankings(
      await requestJson<SportradarRankingsResponse>("/race_rankings.json"),
    );
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
  }

  let matched = 0;
  let unmatched = 0;
  const syncedAt = new Date();

  for (const playerName of playerNames) {
    const normalizedName = normalizeName(playerName);
    const rankingMatch = rankings.get(normalizedName);
    const raceMatch = raceRankings.get(normalizedName);
    const competitor = rankingMatch?.entry.competitor ?? raceMatch?.entry.competitor;

    if (rankingMatch || raceMatch) {
      matched += 1;
    } else {
      unmatched += 1;
    }

    await db
      .insert(tennisPlayerProfiles)
      .values({
        playerName,
        normalizedName,
        sportradarCompetitorId: competitor?.id ?? null,
        country: competitor?.country ?? null,
        countryCode: competitor?.country_code ?? null,
        abbreviation: competitor?.abbreviation ?? null,
        gender: competitor?.gender ?? rankingMatch?.ranking.gender ?? raceMatch?.ranking.gender ?? null,
        singlesRanking: rankingMatch?.entry.rank ?? null,
        singlesRankingMovement: rankingMatch?.entry.movement ?? null,
        singlesRankingPoints: rankingMatch?.entry.points ?? null,
        singlesRankingName: rankingMatch?.ranking.name ?? null,
        raceRanking: raceMatch?.entry.rank ?? null,
        raceRankingMovement: raceMatch?.entry.movement ?? null,
        raceRankingPoints: raceMatch?.entry.points ?? null,
        raceRankingName: raceMatch?.ranking.name ?? null,
        rawRankingPayload: rankingMatch ?? null,
        rawRacePayload: raceMatch ?? null,
        syncedAt,
      })
      .onConflictDoUpdate({
        target: tennisPlayerProfiles.normalizedName,
        set: {
          playerName,
          sportradarCompetitorId: competitor?.id ?? null,
          country: competitor?.country ?? null,
          countryCode: competitor?.country_code ?? null,
          abbreviation: competitor?.abbreviation ?? null,
          gender: competitor?.gender ?? rankingMatch?.ranking.gender ?? raceMatch?.ranking.gender ?? null,
          singlesRanking: rankingMatch?.entry.rank ?? null,
          singlesRankingMovement: rankingMatch?.entry.movement ?? null,
          singlesRankingPoints: rankingMatch?.entry.points ?? null,
          singlesRankingName: rankingMatch?.ranking.name ?? null,
          raceRanking: raceMatch?.entry.rank ?? null,
          raceRankingMovement: raceMatch?.entry.movement ?? null,
          raceRankingPoints: raceMatch?.entry.points ?? null,
          raceRankingName: raceMatch?.ranking.name ?? null,
          rawRankingPayload: rankingMatch ?? null,
          rawRacePayload: raceMatch ?? null,
          syncedAt,
          updatedAt: syncedAt,
        },
      });
  }

  console.log(`Sportradar sync complete. Matched: ${matched}. Unmatched: ${unmatched}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

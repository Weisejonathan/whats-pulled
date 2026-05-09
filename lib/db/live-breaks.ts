import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  breakers,
  breakSessions,
  cards,
  cardSets,
  detectorTrainingSamples,
  pullReports,
  recognitionEvents,
} from "./schema";
import { slugify } from "@/lib/slug";
import { parallelForLimitation } from "@/lib/card-parallels";

export type OverlayRecognition = {
  cardId: string | null;
  cardName: string;
  cardUrl: string | null;
  confidence: string;
  frameImageUrl: string | null;
  id: string;
  isAutographed: boolean;
  limitation: string | null;
  playerName: string;
  rawCardNumber: string | null;
  rawSetName: string | null;
  serialNumber: string | null;
  setName: string;
  status: "pending" | "confirmed" | "rejected";
  timestamp: string;
};

export type BreakSessionView = {
  breakerName: string;
  createdAt: string;
  id: string;
  overlayKey: string;
  overlayUrl: string;
  pullCount: number;
  recognitions: OverlayRecognition[];
  status: "setup" | "live" | "paused" | "ended";
  title: string;
};

export type RecognitionInput = {
  cardId?: string | null;
  cardName?: string | null;
  cardNumber?: string | number | null;
  confidence?: number | string | null;
  frameImageUrl?: string | null;
  isAutographed?: boolean | null;
  limitation?: string | null;
  payload?: unknown;
  playerName?: string | null;
  setName?: string | null;
  source?: string | null;
};

export type CardMatch = {
  cardId: string;
  cardName: string;
  cardNumber: number | null;
  cardUrl: string;
  imageUrl: string | null;
  playerName: string;
  score: number;
  serialNumber: string;
  setName: string;
};

export type TrainingSampleInput = {
  cardId?: string | null;
  cardName?: string | null;
  cardNumber?: string | null;
  detectedText?: string | null;
  imageDataUrl: string;
  isAutographed?: boolean | null;
  limitation?: string | null;
  notes?: string | null;
  overlayKey?: string | null;
  playerName?: string | null;
  setName?: string | null;
};

const demoRecognitions: OverlayRecognition[] = [
  {
    cardId: "demo-djokovic",
    cardName: "Superfractor Auto",
    cardUrl: "/cards/novak-djokovic-1-superfractor",
    confidence: "98%",
    frameImageUrl: "/card-images/novak-djokovic-superfractor-1-1.jpg",
    id: "demo-recognition-1",
    isAutographed: true,
    limitation: "1/1",
    playerName: "Novak Djokovic",
    rawCardNumber: "1",
    rawSetName: "Topps Chrome Tennis 2025",
    serialNumber: "1/1",
    setName: "Topps Chrome Tennis 2025",
    status: "confirmed",
    timestamp: "Demo live",
  },
];

export const demoSession: BreakSessionView = {
  breakerName: "Court Kings Breaks",
  createdAt: "Demo session",
  id: "demo-session",
  overlayKey: "demo",
  overlayUrl: "/overlay/demo",
  pullCount: 1,
  recognitions: demoRecognitions,
  status: "live",
  title: "Topps Chrome Tennis Case Break",
};

const formatConfidence = (value: string | null) => {
  const numeric = Number(value);

  if (!value || Number.isNaN(numeric)) {
    return "Manual";
  }

  return `${Math.round(numeric * 100)}%`;
};

const formatTimestamp = (value: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);

const overlayUrlFor = (key: string) => `/overlay/${key}`;

function toOverlayRecognition(row: {
  cardId: string | null;
  cardName: string | null;
  cardSlug: string | null;
  confidence: string | null;
  createdAt: Date;
  frameImageUrl: string | null;
  id: string;
  isAutographed: boolean;
  limitation: string | null;
  playerName: string | null;
  rawCardNumber: string | null;
  rawCardName: string | null;
  rawPlayerName: string | null;
  rawSetName: string | null;
  serialNumber: string | null;
  setName: string | null;
  status: "pending" | "confirmed" | "rejected";
}): OverlayRecognition {
  return {
    cardId: row.cardId,
    cardName: row.cardName ?? row.rawCardName ?? "Unknown card",
    cardUrl: row.cardSlug ? `/cards/${row.cardSlug}` : null,
    confidence: formatConfidence(row.confidence),
    frameImageUrl: row.frameImageUrl,
    id: row.id,
    isAutographed: row.isAutographed,
    limitation: row.limitation,
    playerName: row.playerName ?? row.rawPlayerName ?? "Unmatched player",
    rawCardNumber: row.rawCardNumber,
    rawSetName: row.rawSetName,
    serialNumber: row.serialNumber,
    setName: row.setName ?? row.rawSetName ?? "Unknown set",
    status: row.status,
    timestamp: formatTimestamp(row.createdAt),
  };
}

async function loadRecognitions(sessionId: string, limit = 12) {
  const db = getDb();

  if (!db) {
    return demoRecognitions;
  }

  try {
    const rows = await db
      .select({
        id: recognitionEvents.id,
        cardId: recognitionEvents.cardId,
        rawSetName: recognitionEvents.rawSetName,
        rawCardNumber: recognitionEvents.rawCardNumber,
        rawPlayerName: recognitionEvents.rawPlayerName,
        rawCardName: recognitionEvents.rawCardName,
        limitation: recognitionEvents.limitation,
        isAutographed: recognitionEvents.isAutographed,
        confidence: recognitionEvents.confidence,
        frameImageUrl: recognitionEvents.frameImageUrl,
        status: recognitionEvents.status,
        createdAt: recognitionEvents.createdAt,
        playerName: cards.playerName,
        cardName: cards.cardName,
        cardSlug: cards.slug,
        serialNumber: cards.serialNumber,
        setName: cardSets.name,
      })
      .from(recognitionEvents)
      .leftJoin(cards, eq(recognitionEvents.cardId, cards.id))
      .leftJoin(cardSets, eq(cards.setId, cardSets.id))
      .where(eq(recognitionEvents.sessionId, sessionId))
      .orderBy(desc(recognitionEvents.createdAt))
      .limit(limit);

    return rows.map(toOverlayRecognition);
  } catch (error) {
    console.error("Failed to load recognition events", error);
    return demoRecognitions;
  }
}

export async function getRecentBreakSessions(): Promise<BreakSessionView[]> {
  const db = getDb();

  if (!db) {
    return [demoSession];
  }

  try {
    const rows = await db
      .select({
        id: breakSessions.id,
        title: breakSessions.title,
        status: breakSessions.status,
        overlayKey: breakSessions.overlayKey,
        createdAt: breakSessions.createdAt,
        breakerName: breakers.displayName,
        pullCount: sql<number>`cast(count(${pullReports.id}) as integer)`,
      })
      .from(breakSessions)
      .leftJoin(breakers, eq(breakSessions.breakerId, breakers.id))
      .leftJoin(pullReports, eq(pullReports.breakerId, breakSessions.breakerId))
      .groupBy(breakSessions.id, breakers.displayName)
      .orderBy(desc(breakSessions.createdAt))
      .limit(8);

    if (!rows.length) {
      return [demoSession];
    }

    return Promise.all(
      rows.map(async (row) => ({
        breakerName: row.breakerName ?? "Unassigned breaker",
        createdAt: formatTimestamp(row.createdAt),
        id: row.id,
        overlayKey: row.overlayKey,
        overlayUrl: overlayUrlFor(row.overlayKey),
        pullCount: row.pullCount,
        recognitions: await loadRecognitions(row.id, 5),
        status: row.status,
        title: row.title,
      })),
    );
  } catch (error) {
    console.error("Failed to load break sessions", error);
    return [demoSession];
  }
}

export async function getBreakSessionByOverlayKey(
  overlayKey: string,
): Promise<BreakSessionView | null> {
  if (overlayKey === "demo") {
    return demoSession;
  }

  const db = getDb();

  if (!db) {
    return null;
  }

  try {
    const [row] = await db
      .select({
        id: breakSessions.id,
        title: breakSessions.title,
        status: breakSessions.status,
        overlayKey: breakSessions.overlayKey,
        createdAt: breakSessions.createdAt,
        breakerName: breakers.displayName,
      })
      .from(breakSessions)
      .leftJoin(breakers, eq(breakSessions.breakerId, breakers.id))
      .where(eq(breakSessions.overlayKey, overlayKey))
      .limit(1);

    if (!row) {
      return null;
    }

    const recognitions = await loadRecognitions(row.id, 12);

    return {
      breakerName: row.breakerName ?? "Unassigned breaker",
      createdAt: formatTimestamp(row.createdAt),
      id: row.id,
      overlayKey: row.overlayKey,
      overlayUrl: overlayUrlFor(row.overlayKey),
      pullCount: recognitions.filter((event) => event.status === "confirmed").length,
      recognitions,
      status: row.status,
      title: row.title,
    };
  } catch (error) {
    console.error("Failed to load overlay session", error);
    return null;
  }
}

export async function createBreakSession(input: {
  breakerName: string;
  title: string;
  streamPlatform?: string | null;
}) {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  const now = new Date();
  const breakerSlug = slugify(input.breakerName);
  const sessionSlug = `${slugify(input.title)}-${Date.now().toString(36)}`;
  const overlayKey = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

  const [breaker] = await db
    .insert(breakers)
    .values({
      displayName: input.breakerName,
      slug: breakerSlug,
      verified: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: breakers.slug,
      set: {
        displayName: input.breakerName,
        updatedAt: now,
      },
    })
    .returning();

  const [session] = await db
    .insert(breakSessions)
    .values({
      breakerId: breaker.id,
      title: input.title,
      slug: sessionSlug,
      overlayKey,
      streamPlatform: input.streamPlatform,
      status: "live",
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  return session;
}

async function findCardForRecognition(input: RecognitionInput) {
  const db = getDb();

  if (!db) {
    return null;
  }

  if (input.cardId) {
    const [card] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.id, input.cardId))
      .limit(1);

    return card?.id ?? null;
  }

  const clauses = [];
  const cardNumber = Number(input.cardNumber);

  if (Number.isInteger(cardNumber)) {
    clauses.push(eq(cards.cardNumber, cardNumber));
  }

  if (input.playerName) {
    clauses.push(ilike(cards.playerName, `%${input.playerName}%`));
  }

  if (input.cardName) {
    clauses.push(ilike(cards.cardName, `%${input.cardName}%`));
    clauses.push(ilike(cards.parallel, `%${input.cardName}%`));
  }

  const limitationParallel = parallelForLimitation(input.limitation);
  const limitationSerial = input.limitation?.trim()
    ? input.limitation.trim().match(/\/\s*(\d{1,4})\b/)?.[1] ?? null
    : null;

  if (limitationParallel) {
    clauses.push(ilike(cards.parallel, `%${limitationParallel}%`));
  }

  if (limitationSerial) {
    clauses.push(eq(cards.serialNumber, `/${limitationSerial}`));
  }

  if (!clauses.length) {
    return null;
  }

  const [match] = await db
    .select({ id: cards.id })
    .from(cards)
    .leftJoin(cardSets, eq(cards.setId, cardSets.id))
    .where(
      and(
        or(...clauses),
        input.setName ? ilike(cardSets.name, `%${input.setName}%`) : sql`true`,
      ),
    )
    .limit(1);

  return match?.id ?? null;
}

export async function createRecognitionForOverlayKey(
  overlayKey: string,
  input: RecognitionInput,
) {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  const [session] = await db
    .select({ id: breakSessions.id })
    .from(breakSessions)
    .where(eq(breakSessions.overlayKey, overlayKey))
    .limit(1);

  if (!session) {
    return null;
  }

  const cardId = await findCardForRecognition(input);
  const confidence =
    input.confidence === null || input.confidence === undefined
      ? null
      : Math.min(1, Math.max(0, Number(input.confidence))).toFixed(4);

  const [event] = await db
    .insert(recognitionEvents)
    .values({
      sessionId: session.id,
      cardId,
      rawSetName: input.setName?.trim() || null,
      rawCardNumber: input.cardNumber ? String(input.cardNumber) : null,
      rawPlayerName: input.playerName?.trim() || null,
      rawCardName: input.cardName?.trim() || null,
      limitation: input.limitation?.trim() || null,
      isAutographed: Boolean(input.isAutographed),
      confidence,
      frameImageUrl: input.frameImageUrl?.trim() || null,
      source: input.source?.trim() || "obs-local",
      status: cardId ? "confirmed" : "pending",
      payload: input.payload ?? null,
      confirmedAt: cardId ? new Date() : null,
      updatedAt: new Date(),
    })
    .returning();

  return event;
}

export async function searchCardMatches(input: {
  cardName?: string | null;
  cardNumber?: string | number | null;
  detectedText?: string | null;
  limitation?: string | null;
  playerName?: string | null;
  setName?: string | null;
}): Promise<CardMatch[]> {
  const db = getDb();

  if (!db) {
    return [
      {
        cardId: "demo-djokovic",
        cardName: "Superfractor Auto",
        cardNumber: 1,
        cardUrl: "/cards/novak-djokovic-1-superfractor",
        imageUrl: "/card-images/novak-djokovic-superfractor-1-1.jpg",
        playerName: "Novak Djokovic",
        score: 0.98,
        serialNumber: "1/1",
        setName: "Topps Chrome Tennis 2025",
      },
    ];
  }

  const clauses = [];
  const cardNumber = Number(input.cardNumber);

  if (input.playerName?.trim()) {
    clauses.push(ilike(cards.playerName, `%${input.playerName.trim()}%`));
  }

  if (input.cardName?.trim()) {
    clauses.push(ilike(cards.cardName, `%${input.cardName.trim()}%`));
    clauses.push(ilike(cards.parallel, `%${input.cardName.trim()}%`));
  }

  if (Number.isInteger(cardNumber)) {
    clauses.push(eq(cards.cardNumber, cardNumber));
  }

  if (input.setName?.trim()) {
    clauses.push(ilike(cardSets.name, `%${input.setName.trim()}%`));
  }

  const limitationParallel = parallelForLimitation(input.limitation);
  const limitationSerial = input.limitation?.trim()
    ? input.limitation.trim().match(/\/\s*(\d{1,4})\b/)?.[1] ?? null
    : null;

  if (limitationParallel) {
    clauses.push(ilike(cards.parallel, `%${limitationParallel}%`));
  }

  if (limitationSerial) {
    clauses.push(eq(cards.serialNumber, `/${limitationSerial}`));
  }

  const textTokens =
    input.detectedText
      ?.split(/[^a-zA-Z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .slice(0, 8) ?? [];

  for (const token of textTokens) {
    clauses.push(ilike(cards.playerName, `%${token}%`));
    clauses.push(ilike(cards.cardName, `%${token}%`));
    clauses.push(ilike(cards.parallel, `%${token}%`));
    clauses.push(ilike(cardSets.name, `%${token}%`));
  }

  const strongClauses = [];

  if (input.playerName?.trim()) {
    strongClauses.push(ilike(cards.playerName, `%${input.playerName.trim()}%`));
  }

  if (input.setName?.trim()) {
    strongClauses.push(ilike(cardSets.name, `%${input.setName.trim()}%`));
  }

  if (limitationSerial) {
    strongClauses.push(eq(cards.serialNumber, `/${limitationSerial}`));
  }

  if (limitationParallel) {
    strongClauses.push(ilike(cards.parallel, `%${limitationParallel}%`));
  }

  if (!clauses.length && !strongClauses.length) {
    return [];
  }

  const whereClause = input.playerName?.trim() && strongClauses.length
    ? and(...strongClauses)
    : clauses.length
      ? or(...clauses)
      : sql`false`;

  const rows = await db
    .select({
      cardId: cards.id,
      cardName: cards.cardName,
      cardNumber: cards.cardNumber,
      cardSlug: cards.slug,
      imageUrl: cards.imageUrl,
      parallel: cards.parallel,
      playerName: cards.playerName,
      serialNumber: cards.serialNumber,
      setName: cardSets.name,
    })
    .from(cards)
    .innerJoin(cardSets, eq(cards.setId, cardSets.id))
    .where(whereClause)
    .limit(80);

  return rows.map((row) => {
    let score = 0.35;

    if (input.playerName && row.playerName.toLowerCase() === input.playerName.toLowerCase()) {
      score += 0.45;
    } else if (input.playerName && row.playerName.toLowerCase().includes(input.playerName.toLowerCase())) {
      score += 0.25;
    }

    if (input.setName && row.setName.toLowerCase().includes(input.setName.toLowerCase())) {
      score += 0.2;
    }

    if (input.cardName && row.cardName.toLowerCase().includes(input.cardName.toLowerCase())) {
      score += 0.15;
    }

    if (input.cardName && row.parallel?.toLowerCase().includes(input.cardName.toLowerCase())) {
      score += 0.15;
    }

    if (limitationParallel && row.parallel?.toLowerCase().includes(limitationParallel.toLowerCase())) {
      score += 0.25;
    }

    if (limitationSerial && row.serialNumber === `/${limitationSerial}`) {
      score += 0.3;
    }

    if (Number.isInteger(cardNumber) && row.cardNumber === cardNumber) {
      score += 0.2;
    }

    return {
      cardId: row.cardId,
      cardName: row.parallel ?? row.cardName,
      cardNumber: row.cardNumber,
      cardUrl: `/cards/${row.cardSlug}`,
      imageUrl: row.imageUrl,
      playerName: row.playerName,
      score: Math.min(0.99, score),
      serialNumber: row.serialNumber,
      setName: row.setName,
    };
  }).sort((left, right) => right.score - left.score).slice(0, 8);
}

export async function createDetectorTrainingSample(input: TrainingSampleInput) {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  if (!input.imageDataUrl.startsWith("data:image/")) {
    throw new Error("imageDataUrl must be a browser image data URL.");
  }

  let sessionId: string | null = null;

  if (input.overlayKey?.trim()) {
    const [session] = await db
      .select({ id: breakSessions.id })
      .from(breakSessions)
      .where(eq(breakSessions.overlayKey, input.overlayKey.trim()))
      .limit(1);
    sessionId = session?.id ?? null;
  }

  const [sample] = await db
    .insert(detectorTrainingSamples)
    .values({
      cardId: input.cardId || null,
      sessionId,
      imageDataUrl: input.imageDataUrl,
      playerName: input.playerName?.trim() || null,
      setName: input.setName?.trim() || null,
      cardName: input.cardName?.trim() || null,
      cardNumber: input.cardNumber?.trim() || null,
      limitation: input.limitation?.trim() || null,
      isAutographed: Boolean(input.isAutographed),
      notes: input.notes?.trim() || null,
      payload: input,
      updatedAt: new Date(),
    })
    .returning();

  return sample;
}

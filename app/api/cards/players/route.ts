import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const fallbackPlayers = [
  "Linda Noskova",
  "Sebastian Korda",
  "Valentin Vacherot",
];

export async function GET() {
  const db = getDb();

  if (!db) {
    return NextResponse.json({ players: fallbackPlayers });
  }

  try {
    const rows = await db
      .select({ playerName: cards.playerName })
      .from(cards)
      .orderBy(asc(cards.playerName));
    const players = Array.from(new Set(rows.map((row) => row.playerName).filter(Boolean)));

    return NextResponse.json({ players });
  } catch (error) {
    console.error("Failed to load detector player names", error);
    return NextResponse.json({ players: fallbackPlayers });
  }
}

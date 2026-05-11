import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { hasAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { cards, cardSets, claims, pullReports } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const readText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const parseCopyNumber = (limitation: string | null, printRun: number | null) => {
  const match = limitation?.match(/\b0*(\d{1,4})\s*[/|\\]\s*0*(\d{1,4})\b/);

  if (match) {
    return Number(match[1]);
  }

  return printRun === 1 ? 1 : null;
};

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON payload expected." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const cardId = readText(body, "cardId");
  const pulledBy = readText(body, "pulledBy");
  const limitation = readText(body, "limitation");

  if (!cardId) {
    return NextResponse.json({ error: "cardId is required." }, { status: 400 });
  }

  if (!pulledBy) {
    return NextResponse.json({ error: "pulledBy is required." }, { status: 400 });
  }

  const db = getDb();

  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL is missing." }, { status: 500 });
  }

  const [card] = await db
    .select({
      id: cards.id,
      printRun: cards.printRun,
      serialNumber: cards.serialNumber,
      slug: cards.slug,
      setSlug: cardSets.slug,
    })
    .from(cards)
    .innerJoin(cardSets, eq(cards.setId, cardSets.id))
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }

  const serialPrintRun = Number(card.serialNumber.match(/\/\s*(\d{1,4})\b/)?.[1] ?? 0) || null;
  const printRun = card.printRun ?? serialPrintRun;
  const copyNumber = parseCopyNumber(limitation, printRun);

  if (copyNumber && printRun && copyNumber > printRun) {
    return NextResponse.json({ error: `Copy number must be between 1 and ${printRun}.` }, { status: 400 });
  }

  if (copyNumber) {
    const [pullUsage] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(pullReports)
      .where(
        and(
          eq(pullReports.cardId, card.id),
          eq(pullReports.copyNumber, copyNumber),
          inArray(pullReports.verificationStatus, ["pending", "verified"]),
        ),
      );
    const [claimUsage] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(claims)
      .where(
        and(
          eq(claims.cardId, card.id),
          eq(claims.copyNumber, copyNumber),
          inArray(claims.verificationStatus, ["pending", "verified"]),
        ),
      );

    if ((pullUsage?.count ?? 0) > 0 || (claimUsage?.count ?? 0) > 0) {
      return NextResponse.json({ error: `Copy ${copyNumber} is already pulled, claimed, or reserved.` }, { status: 409 });
    }
  }

  const now = new Date();
  const [pull] = await db
    .insert(pullReports)
    .values({
      cardId: card.id,
      copyNumber,
      externalRef: `stream-pull-${card.id}-${now.getTime()}`,
      pulledAt: now,
      reportedByName: pulledBy,
      verificationStatus: "verified",
      updatedAt: now,
    })
    .returning({
      id: pullReports.id,
      copyNumber: pullReports.copyNumber,
    });

  await db
    .update(cards)
    .set({
      status: "pulled",
      updatedAt: now,
    })
    .where(eq(cards.id, card.id));

  revalidatePath("/");
  revalidatePath(`/sets`);
  revalidatePath(`/sets/${card.setSlug}`);
  revalidatePath(`/cards/${card.slug}`);

  return NextResponse.json({
    ok: true,
    pull,
  });
}

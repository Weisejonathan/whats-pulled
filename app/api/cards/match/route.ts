import { NextResponse } from "next/server";
import { searchCardMatches } from "@/lib/db/live-breaks";

export const dynamic = "force-dynamic";

const readText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON payload expected." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const cardNumber = body.cardNumber;
  const matches = await searchCardMatches({
    cardName: readText(body, "cardName"),
    cardNumber:
      typeof cardNumber === "string" || typeof cardNumber === "number" ? cardNumber : null,
    detectedText: readText(body, "detectedText"),
    limitation: readText(body, "limitation"),
    playerName: readText(body, "playerName"),
    setName: readText(body, "setName"),
  });

  return NextResponse.json({ matches });
}

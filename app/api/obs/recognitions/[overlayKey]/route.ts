import { NextResponse } from "next/server";
import { createRecognitionForOverlayKey } from "@/lib/db/live-breaks";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    overlayKey: string;
  }>;
};

const readText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readBoolean = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "boolean" ? value : null;
};

const readNumber = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export async function POST(request: Request, context: RouteContext) {
  const { overlayKey } = await context.params;
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON payload expected." }, { status: 400 });
  }

  try {
    const body = payload as Record<string, unknown>;
    const cardNumber = body.cardNumber;
    const event = await createRecognitionForOverlayKey(overlayKey, {
      cardId: readText(body, "cardId"),
      cardName: readText(body, "cardName"),
      cardNumber:
        typeof cardNumber === "string" || typeof cardNumber === "number" ? cardNumber : null,
      confidence: readNumber(body, "confidence"),
      frameImageUrl: readText(body, "frameImageUrl"),
      isAutographed: readBoolean(body, "isAutographed"),
      limitation: readText(body, "limitation"),
      playerName: readText(body, "playerName"),
      setName: readText(body, "setName"),
      source: readText(body, "source"),
      payload,
    });

    if (!event) {
      return NextResponse.json({ error: "Overlay session not found." }, { status: 404 });
    }

    return NextResponse.json({ event, ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recognition failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

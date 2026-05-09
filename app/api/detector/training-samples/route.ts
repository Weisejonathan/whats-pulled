import { NextResponse } from "next/server";
import { createDetectorTrainingSample } from "@/lib/db/live-breaks";

export const dynamic = "force-dynamic";

const readText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readBoolean = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "boolean" ? value : null;
};

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON payload expected." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const imageDataUrl = readText(body, "imageDataUrl");

  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
  }

  try {
    const sample = await createDetectorTrainingSample({
      cardId: readText(body, "cardId"),
      cardName: readText(body, "cardName"),
      cardNumber: readText(body, "cardNumber"),
      detectedText: readText(body, "detectedText"),
      imageDataUrl,
      isAutographed: readBoolean(body, "isAutographed"),
      limitation: readText(body, "limitation"),
      notes: readText(body, "notes"),
      overlayKey: readText(body, "overlayKey"),
      playerName: readText(body, "playerName"),
      setName: readText(body, "setName"),
    });

    return NextResponse.json({ ok: true, sample }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save training sample.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

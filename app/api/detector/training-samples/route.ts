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

const readNumber = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const readJson = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return value && typeof value === "object" ? value : null;
};

const readFeedbackResult = (payload: Record<string, unknown>) => {
  const value = payload.feedbackResult;
  return value === "correct" || value === "incorrect" ? value : null;
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
      confidence: readNumber(body, "confidence"),
      detectedText: readText(body, "detectedText"),
      feedbackResult: readFeedbackResult(body),
      imageDataUrl,
      isAutographed: readBoolean(body, "isAutographed"),
      lightingDiagnostics: readJson(body, "lightingDiagnostics"),
      limitation: readText(body, "limitation"),
      notes: readText(body, "notes"),
      overlayKey: readText(body, "overlayKey"),
      playerName: readText(body, "playerName"),
      prediction: readJson(body, "prediction"),
      setName: readText(body, "setName"),
      source: readText(body, "source"),
      topMatch: readJson(body, "topMatch"),
    });

    return NextResponse.json({ ok: true, sample }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save training sample.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

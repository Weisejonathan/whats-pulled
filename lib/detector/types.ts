import type { CardEvidence, CardMatch } from "./matching";

export type DetectorSet = { id: string; name: string; year: number };
export type ObservationPayload = {
  suggestion: CardEvidence;
  matches: CardMatch[];
  detectedText: string;
  notes: string;
  model?: string;
  durationMs?: number;
  sourceUrl?: string;
  originalSuggestion?: CardEvidence;
  originalMatches?: CardMatch[];
  usage?: { inputTokens: number; outputTokens: number };
};
export type DetectorObservation = {
  id: string;
  revision: number;
  status: "pending" | "approved" | "rejected";
  selectedCardId: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  capturedAt: string;
  payload: ObservationPayload;
  pullReportId: string | null;
  overlayEventId: string | null;
  overlayKey: string | null;
  overlayError: string | null;
  pulledBy: string | null;
};

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function readEvidence(value: unknown): CardEvidence {
  if (!value || typeof value !== "object") throw new Error("Card details are required.");
  const input = value as Record<string, unknown>;
  const text = (key: string, max = 160) => typeof input[key] === "string" ? input[key].trim().slice(0, max) : "";
  const setId = text("setId");
  if (setId && !isUuid(setId)) throw new Error("Invalid set.");
  return {
    playerName: text("playerName"), setName: text("setName"), setId: setId || null,
    cardName: text("cardName"), cardNumber: typeof input.cardNumber === "number" ? String(input.cardNumber) : text("cardNumber", 30),
    limitation: text("limitation", 30), isAutographed: typeof input.isAutographed === "boolean" ? input.isAutographed : null,
  };
}

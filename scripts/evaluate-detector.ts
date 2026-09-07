import { readFile } from "node:fs/promises";
import { normalizeLabel, rankCardCandidates } from "../lib/detector/matching";
import type { DetectorObservation } from "../lib/detector/types";

const path = process.argv[2];
if (!path) { console.error("Usage: npm run detector:eval -- exported-review-queue.json"); process.exit(1); }
const observations = JSON.parse(await readFile(path, "utf8")) as DetectorObservation[];
if (!Array.isArray(observations)) throw new Error("Expected a review queue export.");
const labelled = observations.filter(item => item.status === "approved" && item.selectedCardId && item.payload?.originalSuggestion && item.payload.originalMatches);
const fields = ["playerName", "setName", "cardName", "cardNumber", "limitation", "isAutographed"] as const;
const fieldAccuracy: Record<string, { correct: number; labelled: number; accuracy: number | null }> = {};
for (const field of fields) {
  const samples = labelled.filter(item => item.payload.suggestion[field] !== null && item.payload.suggestion[field] !== undefined && item.payload.suggestion[field] !== "");
  const correct = samples.filter(item => normalizeLabel(item.payload.originalSuggestion?.[field]) === normalizeLabel(item.payload.suggestion[field])).length;
  fieldAccuracy[field] = { correct, labelled: samples.length, accuracy: samples.length ? correct / samples.length : null };
}
let supportedSuggestions = 0, correctSuggestions = 0, wrongSuggestions = 0;
for (const item of labelled) {
  const best = rankCardCandidates(item.payload.originalMatches!, item.payload.originalSuggestion!)[0];
  if (!best?.autoEligible) continue;
  supportedSuggestions++;
  if (best.cardId === item.selectedCardId) correctSuggestions++; else wrongSuggestions++;
}
const latencies = observations.map(item => item.payload?.durationMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
console.log(JSON.stringify({
  scope: "Offline comparison of original readings with reviewed labels. This is not a held-out video recall benchmark.",
  observations: observations.length, labelled: labelled.length,
  unlabelled: observations.length - labelled.length, fieldAccuracy,
  supportedSuggestions, correctSuggestions, wrongSuggestions,
  suggestionPrecision: supportedSuggestions ? correctSuggestions / supportedSuggestions : null,
  medianRecognitionMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
  p95RecognitionMs: latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * .95))] : null,
  inputTokens: observations.reduce((sum, item) => sum + (item.payload?.usage?.inputTokens ?? 0), 0),
  outputTokens: observations.reduce((sum, item) => sum + (item.payload?.usage?.outputTokens ?? 0), 0),
  missedCards: null,
  note: "Missed cards require independently labelled complete videos, including cards that never produced an observation. Token counts are not currency prices.",
}, null, 2));

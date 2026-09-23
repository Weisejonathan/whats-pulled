import { normalizeLabel, parseSerial, type CardEvidence, type CardMatch } from "./matching";
import type { ColorEvidence, FieldProof, ObservationFieldEvidence, ObservationPayload } from "./types";

/** Cross-presentation identity requires a uniquely resolved variant and a full copy number. */
export function exactCardIdentity(suggestion: CardEvidence, matches: CardMatch[]) {
  const serial = parseSerial(suggestion.limitation);
  if (!serial || serial.copy === null || !normalizeLabel(suggestion.playerName) || matches.length !== 1 || matches[0].conflicts.length) return null;
  return `${matches[0].cardId}:${serial.copy}/${serial.total}`;
}

function fieldProof(value: unknown): FieldProof[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap(item => {
    if (!item || typeof item !== "object" || !item.box || typeof item.box !== "object") return [];
    const { x, y, width, height } = item.box;
    if (![x, y, width, height, item.score].every(v => typeof v === "number" && Number.isFinite(v)) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) return [];
    return [{ text: String(item.text ?? "").slice(0, 200), score: Math.max(0, Math.min(1, item.score)), box: { x, y, width, height } }];
  });
}

/** Keep all coordinates tied to the exact image that generated their reading. */
export function buildFrameEvidence(body: Record<string, unknown>, suggestion: CardEvidence, images: { imageUrl: string; thumbnailUrl: string }, capturedAt: string) {
  const quality = typeof body.frameQuality === "number" && Number.isFinite(body.frameQuality) ? Math.max(0, Math.min(1000, body.frameQuality)) : 0;
  const inputProof = body.proof && typeof body.proof === "object" ? body.proof as Record<string, unknown> : {};
  const proof = { name: fieldProof(inputProof.name), serial: fieldProof(inputProof.serial) };
  const dimensions = body.proofImage && typeof body.proofImage === "object" ? body.proofImage as Record<string, unknown> : {};
  const proofImage = [dimensions.width, dimensions.height].every(value => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000)
    ? { width: dimensions.width as number, height: dimensions.height as number } : undefined;
  const nameSource = body.fields && typeof body.fields === "object" && "name" in body.fields && body.fields.name === "catalog" ? "catalog" : "read";
  const evidence: NonNullable<ObservationPayload["evidence"]> = {};
  const fields = { name: suggestion.playerName, serial: suggestion.limitation, variant: suggestion.cardName, cardNumber: suggestion.cardNumber, autograph: suggestion.isAutographed };
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") continue;
    const fieldBoxes = key === "name" || key === "serial" ? proof[key] : [];
    const fieldQuality = (fieldBoxes.length ? fieldBoxes.reduce((sum, box) => sum + box.score, 0) / fieldBoxes.length * 100 : 0) + quality / 1000;
    evidence[key as keyof typeof evidence] = {
      frameId: String(body.id), ...images, capturedAt, value: typeof value === "boolean" ? value : String(value),
      source: key === "name" ? nameSource : "read", quality: fieldQuality, proofImage,
      ...(key === "name" || key === "serial" ? { proof: proof[key] } : {}),
    } satisfies ObservationFieldEvidence;
  }
  const inputColor = body.color && typeof body.color === "object" ? body.color as Record<string, unknown> : {};
  const labels = ["red", "orange", "yellow/gold", "green", "blue", "purple", "unknown"];
  const color: ColorEvidence | undefined = labels.includes(String(inputColor.label)) && typeof inputColor.support === "number" && Number.isFinite(inputColor.support)
    ? { label: inputColor.label as ColorEvidence["label"], support: Math.max(0, Math.min(1, inputColor.support)), reason: String(inputColor.reason ?? "").slice(0, 400) } : undefined;
  const visualFingerprint = typeof body.visualFingerprint === "string" && /^[a-f0-9]{16}$/i.test(body.visualFingerprint) ? body.visualFingerprint.toLowerCase() : undefined;
  return { quality, evidence, proof, proofImage, color, visualFingerprint };
}

import { normalizeLabel, parseSerial, type CardEvidence } from "./matching";
import type { VisionReading } from "./vision-types";

export type LocalReading = {
  suggestion: CardEvidence;
  detectedText: string;
  notes: string;
  model: string;
  durationMs: number;
  fields?: { name: "read" | "unknown" | "conflict"; serial: "read" | "unknown" | "conflict"; autograph: "visual-evidence" | "unknown" };
  /** OCR line scores, not calibrated probabilities of correct card identity. */
  ocrQuality?: { name: number; serial: number };
};

/** Exact catalog text only: never identify faces or manufacture a missing first name. */
export function readLocalEvidence(text: string, players: string[], confidence: number): LocalReading {
  const normalized = ` ${normalizeLabel(text)} `;
  const names = [...new Set(players)].filter(name => normalized.includes(` ${normalizeLabel(name)} `));
  const serials = new Set<string>();
  for (const match of text.matchAll(/(?:^|[^\w/])(\d{1,5}\s*[/|\\]\s*\d{1,5})(?![\w/])/g)) {
    const serial = parseSerial(match[1]);
    if (serial && serial.copy !== null) serials.add(`${serial.copy}/${serial.total}`);
  }
  // OCR scores are quality hints, not probabilities of card identity.
  const readable = confidence >= 65;
  const playerName = readable && names.length === 1 ? names[0] : "";
  const limitation = readable && serials.size === 1 ? [...serials][0] : "";
  const autographLabel = /\b(?:certified\s+autograph|autograph\s+issue)\b/i.test(text);
  return {
    suggestion: { playerName, limitation, isAutographed: null },
    detectedText: text,
    notes: [
      "Local OCR suggestion; check the captured card before confirming.",
      !playerName ? "Full player name unreadable or ambiguous." : "",
      !limitation ? "Full serial unreadable or ambiguous." : "",
      autographLabel ? "Autograph label detected; the signature itself still needs visual verification." : "Autograph presence is unknown; absence of text is not evidence of an unsigned card.",
    ].filter(Boolean).join(" "),
    model: "local-unavailable", durationMs: 0,
  };
}

/** Per-line evidence avoids rejecting a clear name because the logo is unreadable. */
export function readVisionEvidence(vision: VisionReading, players: string[]): LocalReading {
  const readable = vision.items.filter(line => line.score >= .8);
  const text = ` ${normalizeLabel(readable.map(line => line.text).join(" "))} `;
  const names = [...new Set(players)].filter(name => text.includes(` ${normalizeLabel(name)} `));
  const serials = new Set<string>();
  for (const line of readable) {
    const serial = parseSerial(line.text.trim());
    if (serial?.copy) serials.add(`${serial.copy}/${serial.total}`);
  }
  const fields: NonNullable<LocalReading["fields"]> = {
    name: names.length === 1 ? "read" : names.length > 1 ? "conflict" : "unknown",
    serial: serials.size === 1 ? "read" : serials.size > 1 ? "conflict" : "unknown",
    autograph: vision.signature.present === true ? "visual-evidence" : "unknown",
  };
  const nameScores = names.length === 1 ? readable.filter(line => ` ${normalizeLabel(names[0])} `.includes(` ${normalizeLabel(line.text)} `)).map(line => line.score) : [];
  return {
    suggestion: {
      playerName: fields.name === "read" ? names[0] : "",
      limitation: fields.serial === "read" ? [...serials][0] : "",
      isAutographed: vision.signature.present,
    },
    detectedText: vision.items.map(line => line.text).join("\n"),
    model: "local-paddleocr-v6", durationMs: Math.round(vision.metrics.totalMs), fields,
    ocrQuality: {
      name: nameScores.length ? Math.min(...nameScores) : 0,
      serial: serials.size === 1 ? Math.max(...readable.filter(line => {
        const serial = parseSerial(line.text); return serial?.copy && serials.has(`${serial.copy}/${serial.total}`);
      }).map(line => line.score), 0) : 0,
    },
    notes: [
      "Local visual suggestion; check the proof before confirming.",
      fields.name === "conflict" ? "Conflicting player names." : fields.name === "unknown" ? "Full name could not be verified against the selected checklist." : "",
      fields.serial === "conflict" ? "Conflicting serial readings; do not choose one automatically." : fields.serial === "unknown" ? "Individual serial is unreadable." : "",
      vision.signature.reason,
    ].filter(Boolean).join(" "),
  };
}

export const needsAiReview = (reading: LocalReading) => reading.fields?.name !== "read" || reading.fields.serial !== "read"
  || reading.fields.autograph !== "visual-evidence" || (reading.ocrQuality?.name ?? 0) < .9 || (reading.ocrQuality?.serial ?? 0) < .9;

export function mergeAiReading(local: LocalReading, ai: LocalReading): LocalReading {
  const suggestion = { ...local.suggestion };
  const conflicts: string[] = [];
  for (const key of ["playerName", "limitation", "isAutographed", "cardName", "cardNumber"] as const) {
    const before = local.suggestion[key], after = ai.suggestion[key];
    if (after === null || after === undefined || after === "") continue;
    if (key === "limitation") {
      const oldSerial = parseSerial(before), newSerial = parseSerial(after);
      if (!newSerial) continue;
      if (oldSerial && oldSerial.total === newSerial.total && (oldSerial.copy === null || newSerial.copy === null || oldSerial.copy === newSerial.copy)) {
        const copy = oldSerial.copy ?? newSerial.copy;
        suggestion.limitation = `${copy ?? ""}/${oldSerial.total}`;
        continue;
      }
    }
    if (before !== null && before !== undefined && before !== "" && normalizeLabel(before) !== normalizeLabel(after)) {
      // Keep disagreement visible instead of silently replacing one confident read.
      Object.assign(suggestion, { [key]: key === "isAutographed" ? null : "" }); conflicts.push(key);
    } else Object.assign(suggestion, { [key]: after });
  }
  return { ...ai, suggestion, detectedText: [local.detectedText, ai.detectedText].filter(Boolean).join("\n"),
    notes: [local.notes, ai.notes, conflicts.length ? `Local/AI disagreement in ${conflicts.join(", ")}; compare the proof before confirming.` : ""].filter(Boolean).join(" ") };
}

/** Keep the complete better frame as proof; never fabricate a composite card identity. */
export function chooseFrameReading(first: LocalReading, second: LocalReading) {
  const score = (reading: LocalReading) => Number(Boolean(reading.suggestion.playerName))
    + Number(Boolean(reading.suggestion.limitation)) + Number(reading.suggestion.isAutographed === true) * .5;
  const index = score(second) > score(first) ? 1 : 0;
  const chosen = index ? second : first;
  const reading: LocalReading = { ...chosen, suggestion: { ...chosen.suggestion }, fields: chosen.fields ? { ...chosen.fields } : undefined };
  for (const [key, field] of [["playerName", "name"], ["limitation", "serial"]] as const) {
    if (first.suggestion[key] && second.suggestion[key] && first.suggestion[key] !== second.suggestion[key]) {
      reading.suggestion[key] = "";
      if (reading.fields) reading.fields[field] = "conflict";
      reading.notes += ` Conflicting ${field} across the stable frames; manual review required.`;
    }
  }
  return { index, reading };
}

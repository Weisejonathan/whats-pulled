import type { ColorEvidence, TextLine } from "./vision-types";
import { normalizeLabel } from "./matching";

export type FieldProof = { text: string; score: number; box: { x: number; y: number; width: number; height: number } };

/** Proof coordinates always refer to the retained, possibly rectified image. */
export function lineProof(line: TextLine, width: number, height: number): FieldProof | null {
  if (line.poly.length !== 4 || !width || !height) return null;
  const xs = line.poly.map(p => p[0]), ys = line.poly.map(p => p[1]);
  const x = Math.max(0, Math.min(...xs) / width), y = Math.max(0, Math.min(...ys) / height);
  return { text: line.text, score: line.score, box: { x, y,
    width: Math.max(0, Math.min(1, Math.max(...xs) / width) - x),
    height: Math.max(0, Math.min(1, Math.max(...ys) / height) - y) } };
}

/** Names on separate cards must not be assembled just because OCR lists them together. */
export function neighboringNameLines(a: TextLine, b: TextLine) {
  if (a === b) return true;
  if (a.poly.length !== 4 || b.poly.length !== 4) return false;
  const center = (line: TextLine) => ({ x: line.poly.reduce((s, p) => s + p[0], 0) / 4, y: line.poly.reduce((s, p) => s + p[1], 0) / 4 });
  const direction = (line: TextLine) => Math.atan2(line.poly[1][1] - line.poly[0][1], line.poly[1][0] - line.poly[0][0]);
  const size = (line: TextLine) => Math.hypot(line.poly[3][0] - line.poly[0][0], line.poly[3][1] - line.poly[0][1]);
  const angle = direction(a), delta = Math.abs(Math.atan2(Math.sin(angle - direction(b)), Math.cos(angle - direction(b))));
  if (delta > .3) return false;
  const ca = center(a), cb = center(b), height = Math.max(size(a), size(b));
  const along = Math.abs((cb.x - ca.x) * Math.cos(angle) + (cb.y - ca.y) * Math.sin(angle));
  const across = Math.abs(-(cb.x - ca.x) * Math.sin(angle) + (cb.y - ca.y) * Math.cos(angle));
  const width = Math.max(Math.hypot(a.poly[1][0] - a.poly[0][0], a.poly[1][1] - a.poly[0][1]), Math.hypot(b.poly[1][0] - b.poly[0][0], b.poly[1][1] - b.poly[0][1]));
  return across <= height * 2.6 && along <= width * .8;
}

/** 64-bit dHash, not an identity. Use only alongside session and field evidence. */
export function visualFingerprint(data: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const cells: number[] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 9; col++) {
    let sum = 0, count = 0;
    for (let y = Math.floor(row * height / 8); y < Math.floor((row + 1) * height / 8); y += 2)
      for (let x = Math.floor(col * width / 9); x < Math.floor((col + 1) * width / 9); x += 2) {
        const i = (y * width + x) * 4; sum += data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; count++;
      }
    cells.push(sum / Math.max(1, count));
  }
  let result = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | Number(cells[row * 9 + col] > cells[row * 9 + col + 1]);
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

/** Validate a known printed layout, not merely an image with portrait dimensions.
 * Full-frame acceptance is intentionally stricter than a separately found card
 * boundary: logo, complete name and certification must occupy their expected
 * positions, with no second checklist surname elsewhere in the picture.
 */
export function hasChromeCardLayout(lines: TextLine[], players: string[], width: number, height: number, fullFrame = false) {
  if (!width || !height || Math.abs(width / height - 63 / 88) > .025) return false;
  const positioned = lines.filter(line => line.score >= .88 && line.poly.length === 4);
  const center = (line: TextLine) => ({ x: line.poly.reduce((sum, p) => sum + p[0], 0) / 4 / width, y: line.poly.reduce((sum, p) => sum + p[1], 0) / 4 / height });
  const level = (line: TextLine) => Math.abs(line.poly[1][1] - line.poly[0][1]) / Math.max(1, Math.abs(line.poly[1][0] - line.poly[0][0])) < .18;
  const logo = positioned.some(line => /\bchrome\b/.test(normalizeLabel(line.text)) && center(line).x < .3 && center(line).y < .18 && level(line));
  if (!logo) return false;
  const nameLines = positioned.filter(line => center(line).y > (fullFrame ? .86 : .8) && (!fullFrame || center(line).x > .55) && level(line));
  const names = [...new Set(players)].filter(player => {
    const tokens = normalizeLabel(player).split(" ");
    return nameLines.some(anchor => {
      const words = new Set(nameLines.filter(line => neighboringNameLines(anchor, line)).flatMap(line => normalizeLabel(line.text).split(" ")));
      return tokens.every(token => words.has(token));
    });
  });
  if (names.length !== 1) return false;
  const foreignSurname = players.some(player => player !== names[0] && positioned.some(line => {
    const surname = normalizeLabel(player).split(" ").at(-1)!;
    return surname.length >= 5 && normalizeLabel(line.text) === surname;
  }));
  if (foreignSurname) return false;
  if (!fullFrame) return true;
  return positioned.some(line => /\bcertified\s+autograph\s+issue\b/i.test(line.text)
    && center(line).y > .7 && center(line).y < .86 && center(line).x > .3 && center(line).x < .7 && level(line));
}

/** Sample actual foil, excluding clothing and the green branding swoosh. */
export function inspectParallelColor(data: Uint8ClampedArray | Uint8Array, width: number, height: number, localized: boolean, chromeLayout = false): ColorEvidence {
  const unknown = (reason: string): ColorEvidence => ({ label: "unknown", support: 0, reason });
  if (!localized) return unknown("A reliable card boundary is required before estimating the parallel color.");
  const regions = chromeLayout
    ? [{ x: .76, y: .025, width: .1, height: .055 }, { x: .88, y: .04, width: .09, height: .055 }]
    : [{ x: .74, y: .06, width: .2, height: .14 }, { x: .06, y: .91, width: .24, height: .06 }];
  const readings = regions.map(region => {
    const votes = new Map<ColorEvidence["label"], number>(); let usable = 0, all = 0;
    for (let y = Math.floor(region.y * height); y < Math.floor((region.y + region.height) * height); y += 2)
      for (let x = Math.floor(region.x * width); x < Math.floor((region.x + region.width) * width); x += 2) {
        all++; const i = (y * width + x) * 4, r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        if (max < .18 || max > .98 && min > .8 || !max || d / max < .38) continue;
        let hue = max === r ? 60 * ((g - b) / d % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
        if (hue < 0) hue += 360;
        const label: ColorEvidence["label"] = hue < 18 || hue >= 340 ? "red" : hue < 40 ? "orange" : hue < 72 ? "yellow/gold" : hue < 165 ? "green" : hue < 265 ? "blue" : "purple";
        votes.set(label, (votes.get(label) ?? 0) + 1); usable++;
      }
    const [label, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? ["unknown", 0];
    return { label, support: count / Math.max(1, usable), coverage: usable / Math.max(1, all) };
  });
  if (readings.some(r => r.coverage < .25 || r.support < .6) || readings[0].label !== readings[1].label)
    return unknown("Foil regions disagree or are reflective. Color alone cannot identify a parallel.");
  return { label: readings[0].label, support: Math.min(...readings.map(r => r.support)),
    reason: chromeLayout ? "Matching color in two patches of the Chrome layout's upper foil corner. A visual hint, not a confirmed parallel or print run."
      : "Matching color in two separated foil regions. A visual hint, not a confirmed parallel or print run." };
}

/** Color narrows the selected checklist; it never supplies /50 or the individual copy. */
export function parallelColorHints(color: ColorEvidence | undefined, setId: string,
  rows: Array<{ setId?: string; parallel?: string | null; cardName?: string }>): string[] {
  if (!color || color.label === "unknown" || color.support < .6 || !setId) return [];
  const words = color.label === "yellow/gold" ? ["yellow", "gold"] : [color.label];
  return [...new Set(rows.filter(row => row.setId === setId).map(row => row.parallel || row.cardName || "")
    .filter(label => words.some(word => new RegExp(`\\b${word}\\b`, "i").test(label))))].sort();
}

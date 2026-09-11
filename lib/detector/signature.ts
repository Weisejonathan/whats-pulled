import type { TextLine, SignatureEvidence } from "./vision-types";

/** Conservative ink evidence, not authenticity or a general autograph classifier. */
export function inspectSignature(data: Uint8ClampedArray | Uint8Array, width: number, height: number, lines: TextLine[]): SignatureEvidence {
  const unknown = (reason: string): SignatureEvidence => ({ present: null, method: "unknown", reason });
  const certification = lines.find(line => line.source !== "context" && line.score >= .85 && /\bcertified\s+autograph\s+issue\b/i.test(line.text));
  if (!certification) return unknown("No legible autograph certification; signature needs visual review.");
  const bottom = Math.max(0, Math.floor(Math.min(...certification.poly.map(p => p[1])) - height * .01));
  const top = Math.max(0, Math.floor(bottom - height * .24));
  const left = Math.floor(width * .08), right = Math.ceil(width * .94);
  const roiWidth = right - left, roiHeight = bottom - top;
  if (roiHeight <= 0) return unknown("Signature region is not visible.");
  const mask = new Uint8Array(roiWidth * roiHeight);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const at = (y * width + x) * 4, r = data[at], g = data[at + 1], b = data[at + 2];
    // Blue/cyan pen strokes. Black, silver, red and obscured signatures stay unknown.
    if (b - r > 45 && b - g > 25 && g < 165 && b > 75 && r * .299 + g * .587 + b * .114 < 150) mask[(y - top) * roiWidth + x - left] = 1;
  }
  const components: Array<{ count: number; x: number; y: number; width: number; height: number }> = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    const queue = [start]; mask[start] = 0;
    let minX = roiWidth, maxX = 0, minY = roiHeight, maxY = 0;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], x = index % roiWidth, y = Math.floor(index / roiWidth);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * roiWidth + nx;
        if (nx >= 0 && nx < roiWidth && ny >= 0 && ny < roiHeight && mask[next]) { mask[next] = 0; queue.push(next); }
      }
    }
    const box = { count: queue.length, x: minX + left, y: minY + top, width: maxX - minX + 1, height: maxY - minY + 1 };
    const fill = box.count / (box.width * box.height);
    const border = Math.max(2, Math.min(box.width, box.height) * .06);
    const onBorder = queue.filter(index => {
      const x = index % roiWidth, y = Math.floor(index / roiWidth);
      return Math.min(x - minX, maxX - x, y - minY, maxY - y) < border;
    }).length / queue.length;
    if (box.width >= width * .22 && box.height >= height * .035 && box.height <= height * .23
      && fill > .035 && fill < .38 && onBorder < .65 && box.width / box.height > 1.2 && box.count > width * height * .001) components.push(box);
  }
  const best = components.sort((a, b) => b.width - a.width)[0];
  return best ? { present: true, method: "certification-and-ink", box: best,
    reason: "Visible blue pen-like strokes above a legible certification label. Preliminary visual evidence; not an authenticity check." }
    : unknown("Certification text is visible, but signature strokes could not be confirmed.");
}

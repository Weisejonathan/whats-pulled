import type { FrameSample } from "./frame-tracker";

export type Point = { x: number; y: number };
export type Capture = { imageDataUrl: string; detailImageDataUrl: string; rectified: boolean; ocrCanvas: HTMLCanvasElement };
const canvas = (width: number, height: number) => Object.assign(document.createElement("canvas"), { width, height });

export function quadArea(points: Point[]) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - p.y * q.x; }, 0)) / 2;
}

/** Conservative connected-edge quadrilateral: uncertain crops retain the full focus region. */
export function findCardQuad(data: Uint8ClampedArray, width: number, height: number): Point[] | null {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114;
  const edges = new Uint8Array(gray.length);
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x;
    if (Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + width] - gray[i - width]) > 75) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) edges[i + dy * width + dx] = 1;
    }
  }
  let best: Point[] | null = null;
  let bestArea = 0;
  for (let start = 0; start < edges.length; start++) {
    if (!edges[start]) continue;
    const queue = [start]; edges[start] = 0;
    const points: Point[] = [];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % width, y = Math.floor(i / width);
      points.push({ x, y });
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy, ni = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && edges[ni]) { edges[ni] = 0; queue.push(ni); }
      }
    }
    if (points.length < (width + height) / 2) continue;
    const extreme = (score: (p: Point) => number) => points.reduce((a, b) => score(a) > score(b) ? a : b);
    const quad = [extreme(p => -p.x - p.y), extreme(p => p.x - p.y), extreme(p => p.x + p.y), extreme(p => -p.x + p.y)];
    const area = quadArea(quad), fraction = area / (width * height);
    // A textured background becomes one dense component after edge dilation.
    // It is not a card border, even when its extreme points resemble a rectangle.
    if (!area || points.length / area > .45) continue;
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const ratio = (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / (distance(quad[0], quad[3]) + distance(quad[1], quad[2]));
    if (fraction > .25 && fraction < .96 && ratio > .5 && ratio < .95 && area > bestArea) { best = quad; bestArea = area; }
  }
  return best;
}

export function quadProjector(quad: Point[]) {
  const [a, b, c, d] = quad;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(determinant) < 1e-8 ? 0 : (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = Math.abs(determinant) < 1e-8 ? 0 : (dx1 * dy3 - dx3 * dy1) / determinant;
  const xx = b.x - a.x + g * b.x, xy = d.x - a.x + h * d.x;
  const yx = b.y - a.y + g * b.y, yy = d.y - a.y + h * d.y;
  return (u: number, v: number): Point => {
    const divisor = g * u + h * v + 1;
    return { x: (xx * u + xy * v + a.x) / divisor, y: (yx * u + yy * v + a.y) / divisor };
  };
}

export const projectQuad = (quad: Point[], u: number, v: number) => quadProjector(quad)(u, v);

function rectify(source: HTMLCanvasElement, quad: Point[]) {
  const output = canvas(630, 880);
  const context = output.getContext("2d")!;
  const input = source.getContext("2d")!.getImageData(0, 0, source.width, source.height);
  const result = context.createImageData(output.width, output.height);
  const project = quadProjector(quad);
  for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
    const point = project(x / (output.width - 1), y / (output.height - 1));
    const sx = Math.max(0, Math.min(source.width - 2, point.x)), sy = Math.max(0, Math.min(source.height - 2, point.y));
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    for (let channel = 0; channel < 3; channel++) {
      const at = (dx: number, dy: number) => input.data[((iy + dy) * source.width + ix + dx) * 4 + channel];
      result.data[(y * output.width + x) * 4 + channel] = at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy;
    }
    result.data[(y * output.width + x) * 4 + 3] = 255;
  }
  context.putImageData(result, 0, 0);
  return output;
}

export function inspectFrame(source: HTMLCanvasElement): FrameSample<HTMLCanvasElement> {
  const small = canvas(48, 64), context = small.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, 48, 64);
  const data = context.getImageData(0, 0, 48, 64).data;
  const pixels: number[] = [];
  let glare = 0;
  for (let i = 0; i < data.length; i += 4) { const luma = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; pixels.push(luma); if (luma > 246) glare++; }
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  const contrast = Math.sqrt(pixels.reduce((a, b) => a + (b - mean) ** 2, 0) / pixels.length);
  let edges = 0;
  for (let i = 49; i < pixels.length - 49; i++) edges += Math.abs(4 * pixels[i] - pixels[i - 1] - pixels[i + 1] - pixels[i - 48] - pixels[i + 48]);
  const sharpness = edges / pixels.length;
  return { value: source, pixels, quality: sharpness * (1 - glare / pixels.length), usable: mean > 28 && mean < 230 && contrast > 18 && sharpness > 9 && glare / pixels.length < .3 };
}

export function prepareCapture(source: HTMLCanvasElement, detectBoundary = true): Capture {
  const scale = Math.min(1, 240 / Math.max(source.width, source.height));
  const sample = canvas(Math.round(source.width * scale), Math.round(source.height * scale));
  const context = sample.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const quad = detectBoundary ? findCardQuad(context.getImageData(0, 0, sample.width, sample.height).data, sample.width, sample.height) : null;
  const card = quad ? rectify(source, quad.map(p => ({ x: p.x / scale, y: p.y / scale }))) : source;
  const detailScale = Math.min(2, 1200 / card.width, 800 / (card.height * .45));
  const detail = canvas(Math.max(1, Math.round(card.width * detailScale)), Math.max(1, Math.round(card.height * .45 * detailScale)));
  detail.getContext("2d")!.drawImage(card, 0, card.height * .55, card.width, card.height * .45, 0, 0, detail.width, detail.height);
  // Preserve the complete card: layouts differ and serials can sit above the signature.
  // Pass the canvas directly to OCR; JPEG encode/decode loses tiny stamped digits.
  return { imageDataUrl: card.toDataURL("image/jpeg", .9), detailImageDataUrl: detail.toDataURL("image/jpeg", .9), rectified: Boolean(quad), ocrCanvas: card };
}

export async function imageFileCanvas(file: File) {
  if (file.size > 20_000_000) throw new Error("Choose an image smaller than 20 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const result = canvas(Math.round(image.width * scale), Math.round(image.height * scale));
  result.getContext("2d")!.drawImage(image, 0, 0, result.width, result.height); image.close();
  return result;
}

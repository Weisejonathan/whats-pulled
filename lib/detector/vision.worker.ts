import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { rectifyCard, handSupportsQuad } from "./card-geometry";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { inspectSignature } from "./signature";
import { parseSerial, normalizeLabel } from "./matching";
import type { TextLine } from "./vision-types";
import cvModule from "@techstark/opencv-js";

let ocr: Awaited<ReturnType<typeof PaddleOCR.create>> | null = null;
let busy = false;
let handDetector: HandLandmarker | null = null;

async function initializeHands() {
  try {
    const files = await FilesetResolver.forVisionTasks(new URL("./hands", self.location.href).href, true);
    const model = await cachedFetch("https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task");
    if (!model.ok) return;
    handDetector = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: new Uint8Array(await model.arrayBuffer()), delegate: "CPU" },
      runningMode: "IMAGE", numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6,
      canvas: new OffscreenCanvas(256, 256),
    });
  } catch { handDetector = null; }
}

async function cachedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let cache: Cache | undefined;
  try {
    cache = await caches.open("detector-paddle-v6-0.4.2");
    const cached = await cache.match(input);
    if (cached) return cached;
  } catch { /* Private browsing may disable disk caching. */ }
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(60_000) });
  if (response.ok && cache) await cache.put(input, response.clone()).catch(() => undefined);
  return response;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, image, context } = event.data;
  if (busy) { self.postMessage({ id, error: "Reader busy" }); return; }
  busy = true;
  try {
    if (type === "init") {
      const handsReady = initializeHands();
      ocr = await PaddleOCR.create({
        textDetectionModelName: "PP-OCRv6_tiny_det",
        textRecognitionModelName: "PP-OCRv6_small_rec",
        worker: false, fetch: cachedFetch,
        textRecognitionBatchSize: 6,
        ortOptions: { backend: "wasm", numThreads: 1, wasmPaths: new URL("./", self.location.href).href },
      });
      await handsReady;
      self.postMessage({ id, result: { ...ocr.getInitializationSummary(), handsAvailable: Boolean(handDetector) } });
    } else if (type === "read") {
      if (!ocr) throw new Error("Reader has not initialized");
      const started = performance.now();
      const cv = cvModule instanceof Promise ? await cvModule : cvModule;
      const mat = cv.matFromImageData(image);
      let hands: Array<Array<{ x: number; y: number }>> = [];
      try { hands = handDetector?.detect(image).landmarks.map(hand => hand.map(point => ({ x: point.x * image.width, y: point.y * image.height }))) ?? []; }
      catch { handDetector?.close(); handDetector = null; }
      const card = rectifyCard(cv, mat, hands);
      try {
        const [result] = await ocr.predict(card.mat, { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: .4 });
        const lines: TextLine[] = [...result.items];
        const players: string[] = context?.players ?? [];
        const hasName = () => {
          const text = ` ${normalizeLabel(lines.filter(line => line.score >= .8).map(line => line.text).join(" "))} `;
          return players.some(player => text.includes(` ${normalizeLabel(player)} `));
        };
        const detailStarted = performance.now();
        if (!lines.some(line => line.score >= .8 && parseSerial(line.text)?.copy)) {
          // Re-read actual pixels; never replace an OCR '1' with a slash by guessing.
          const candidates = lines.filter(line => /^[\dIlOoSs\s/|\\]{3,12}$/.test(line.text) && /\d/.test(line.text) && line.score > .5).slice(0, 2);
          for (const line of candidates) {
            if (performance.now() - started > 1100) break;
            const xs = line.poly.map(p => p[0]), ys = line.poly.map(p => p[1]);
            const x = Math.max(0, Math.floor(Math.min(...xs) - 12)), y = Math.max(0, Math.floor(Math.min(...ys) - 10));
            const w = Math.min(card.mat.cols - x, Math.ceil(Math.max(...xs) - x + 12));
            const h = Math.min(card.mat.rows - y, Math.ceil(Math.max(...ys) - y + 10));
            if (w <= 0 || h <= 0) continue;
            const crop = card.mat.roi(new cv.Rect(x, y, w, h)), enlarged = new cv.Mat(), gray = new cv.Mat();
            try {
              const factor = Math.min(3, 900 / w);
              cv.resize(crop, enlarged, new cv.Size(Math.round(w * factor), Math.round(h * factor)), 0, 0, cv.INTER_CUBIC);
              cv.cvtColor(enlarged, gray, cv.COLOR_RGBA2GRAY);
              cv.equalizeHist(gray, gray);
              const details = await ocr.predict([enlarged, gray], { textDetLimitSideLen: 640, textDetLimitType: "max", textRecScoreThresh: .7 });
              for (const detail of details) for (const candidate of detail.items) {
                if (parseSerial(candidate.text)?.copy) lines.push({ ...candidate, poly: line.poly, source: "detail" });
              }
            } finally { crop.delete(); enlarged.delete(); gray.delete(); }
          }
        }
        const hasCertification = lines.some(line => line.score >= .85 && /\bcertified\s+autograph\s+issue\b/i.test(line.text));
        if ((!hasName() || !hasCertification) && performance.now() - started < 1000) {
          // A smaller field band gives tiny italic names and certification text
          // more detector pixels, especially after stream JPEG compression.
          const nameTokens = players.flatMap(player => normalizeLabel(player).split(" ")).filter(token => token.length >= 4);
          const anchors = lines.filter(line => nameTokens.some(token => ` ${normalizeLabel(line.text)} `.includes(` ${token} `)));
          const anchorY = anchors.length ? Math.min(...anchors.flatMap(line => line.poly.map(p => p[1]))) / card.mat.rows : .85;
          const top = Math.max(0, Math.floor(card.mat.rows * Math.max(0, anchorY - .3)));
          const crop = card.mat.roi(new cv.Rect(0, top, card.mat.cols, card.mat.rows - top)), enlarged = new cv.Mat();
          try {
            const factor = Math.min(2, 1200 / crop.cols);
            cv.resize(crop, enlarged, new cv.Size(Math.round(crop.cols * factor), Math.round(crop.rows * factor)), 0, 0, cv.INTER_CUBIC);
            const [detail] = await ocr.predict(enlarged, { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: .4 });
            for (const line of detail.items) lines.push({ ...line, source: "detail", poly: line.poly.map(p => [p[0] / factor, p[1] / factor + top]) });
          } finally { crop.delete(); enlarged.delete(); }
        }
        if (card.quad && !hasName() && performance.now() - started < 1050) {
          // Resampling can hurt small italic names. Recover from the original
          // pixels as a separate view, not by forcing a fuzzy catalog match.
          const [original] = await ocr.predict(mat, { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: .8 });
          const inside = (point: number[]) => {
            const crosses = card.quad!.map((a, i) => { const b = card.quad![(i + 1) % 4]; return (b.x - a.x) * (point[1] - a.y) - (b.y - a.y) * (point[0] - a.x); });
            return crosses.every(x => x >= 0) || crosses.every(x => x <= 0);
          };
          for (const line of original.items) if (line.poly.every(inside)) lines.push({ ...line, source: "context" });
        }
        const signature = inspectSignature(card.mat.data, card.mat.cols, card.mat.rows, lines);
        const cardImage = new ImageData(new Uint8ClampedArray(card.mat.data), card.mat.cols, card.mat.rows);
        self.postMessage({ id, result: { ...result, items: lines, quad: card.quad, signature, cardImage,
          handSupport: { available: Boolean(handDetector), holdingCard: Boolean(card.quad && hands.some(hand => handSupportsQuad(hand, card.quad!))) },
          metrics: { ...result.metrics, detailMs: performance.now() - detailStarted, totalMs: performance.now() - started } } }, { transfer: [cardImage.data.buffer] });
      } finally { card.mat.delete(); mat.delete(); }
    } else throw new Error("Unknown reader request");
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally { busy = false; }
};

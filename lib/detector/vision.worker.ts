import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { rectifyCard, handSupportsQuad } from "./card-geometry";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { inspectSignature } from "./signature";
import { quadProjector } from "./capture";
import { parseSerial, normalizeLabel } from "./matching";
import type { TextLine } from "./vision-types";
import cvModule from "@techstark/opencv-js";
import { hasChromeCardLayout, inspectParallelColor, visualFingerprint } from "./visual-evidence";

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
        // Card text lines vary greatly in width. Single-line batches avoid
        // padding short serials to the width of long certification labels.
        textRecognitionBatchSize: 1,
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
        const players: string[] = context?.players ?? [];
        let [result] = await ocr.predict(card.mat, { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: .4 });
        // Sideways stream screenshots need a text-validated orientation retry.
        // Never accept a geometric rotation of the whole stream without actual
        // name/serial evidence, which previously rotated ordinary landscapes.
        const orientationScore = (items: TextLine[]) => {
          const text = ` ${normalizeLabel(items.filter(line => line.score >= .88).map(line => line.text).join(" "))} `;
          const full = players.some(player => text.includes(` ${normalizeLabel(player)} `));
          const surname = players.some(player => { const token = normalizeLabel(player).split(" ").at(-1)!; return token.length >= 5 && text.includes(` ${token} `); });
          return Number(full) * 4 + Number(surname) * 2 + Number(items.some(line => line.score >= .9 && parseSerial(line.text)?.copy)) * 2;
        };
        if (!card.quad && card.mat.rows > card.mat.cols && orientationScore(result.items) === 0) {
          for (const rotation of [cv.ROTATE_90_COUNTERCLOCKWISE, cv.ROTATE_90_CLOCKWISE]) {
            if (performance.now() - started > 750) break;
            const rotated = new cv.Mat();
            cv.rotate(card.mat, rotated, rotation);
            try {
              const [candidate] = await ocr.predict(rotated, { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: .4 });
              if (orientationScore(candidate.items) >= 2) {
                card.mat.delete(); card.mat = rotated.clone(); result = candidate; break;
              }
            } finally { rotated.delete(); }
          }
        }
        const lines: TextLine[] = [...result.items];
        const hasName = () => {
          const text = ` ${normalizeLabel(lines.filter(line => line.score >= .8).map(line => line.text).join(" "))} `;
          return players.some(player => text.includes(` ${normalizeLabel(player)} `));
        };
        const detailStarted = performance.now();
        if (!hasName() || !lines.some(line => line.score >= .8 && parseSerial(line.text)?.copy)) {
          const nameAnchors = new Set(players.flatMap(player => normalizeLabel(player).split(" ")).filter(token => token.length >= 5));
          const anchors = lines.filter(line => line.score >= .85 && nameAnchors.has(normalizeLabel(line.text))).slice(0, 2);
          for (const line of anchors) {
            if (performance.now() - started > 900) break;
            if (line.poly.length !== 4) continue;
            const [a, b, , d] = line.poly;
            const u = { x: b[0] - a[0], y: b[1] - a[1] }, v = { x: d[0] - a[0], y: d[1] - a[1] };
            if (Math.hypot(u.x, u.y) < 4 || Math.hypot(v.x, v.y) < 2) continue;
            const point = (x: number, y: number) => ({ x: a[0] + u.x * x + v.x * y, y: a[1] + u.y * x + v.y * y });
            // A short first name is often right-aligned over a much longer
            // surname. The previous 15% margin cut TREVISAN to TREVIS.
            const quad = [point(-.65, -2), point(1.8, -2), point(1.8, 3), point(-.65, 3)];
            const width = Math.min(900, Math.round(Math.hypot(u.x, u.y) * 2.45 * 4));
            const height = Math.max(32, Math.round(width * Math.hypot(v.x, v.y) * 5 / (Math.hypot(u.x, u.y) * 2.45)));
            const src = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap(p => [p.x, p.y]));
            const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
            const transform = cv.getPerspectiveTransform(src, dst), enlarged = new cv.Mat();
            try {
              cv.warpPerspective(card.mat, enlarged, transform, new cv.Size(width, height), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
              const [detail] = await ocr.predict(enlarged, { textDetLimitSideLen: 640, textDetLimitType: "max", textRecScoreThresh: .4, textDetThresh: .15, textDetBoxThresh: .3 });
              const project = quadProjector(quad);
              for (const item of detail.items) lines.push({ ...item, source: "detail", poly: item.poly.map(p => { const at = project(p[0] / width, p[1] / height); return [at.x, at.y]; }) });
            } finally { src.delete(); dst.delete(); transform.delete(); enlarged.delete(); }
          }
        }
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
        // A tiny stamp may never produce a general OCR box. Search the actual
        // lower-left card region independently, but only on a localized card.
        // This is a printed-layout hint, never a guessed serial or print run.
        if (card.quad && !lines.some(line => line.score >= .8 && parseSerial(line.text)?.copy) && performance.now() - started < 950) {
          const x = Math.floor(card.mat.cols * .03), y = Math.floor(card.mat.rows * .46);
          const width = Math.floor(card.mat.cols * .48), height = Math.floor(card.mat.rows * .41);
          const crop = card.mat.roi(new cv.Rect(x, y, width, height)), enlarged = new cv.Mat(), gray = new cv.Mat();
          try {
            const factor = Math.min(3, 900 / width);
            cv.resize(crop, enlarged, new cv.Size(Math.round(width * factor), Math.round(height * factor)), 0, 0, cv.INTER_CUBIC);
            cv.cvtColor(enlarged, gray, cv.COLOR_RGBA2GRAY);
            cv.equalizeHist(gray, gray);
            const [detail] = await ocr.predict(gray, { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: .7, textDetThresh: .15, textDetBoxThresh: .3 });
            for (const line of detail.items) if (parseSerial(line.text)?.copy) lines.push({ ...line, source: "detail", poly: line.poly.map(p => [p[0] / factor + x, p[1] / factor + y]) });
          } finally { crop.delete(); enlarged.delete(); gray.delete(); }
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
          const src = cv.matFromArray(4, 1, cv.CV_32FC2, card.quad.flatMap(p => [p.x, p.y]));
          const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, card.mat.cols - 1, 0, card.mat.cols - 1, card.mat.rows - 1, 0, card.mat.rows - 1]);
          const transform = cv.getPerspectiveTransform(src, dst);
          try {
            const h = transform.data64F;
            for (const line of original.items) if (line.poly.every(inside)) lines.push({ ...line, source: "context", poly: line.poly.map(([x, y]) => {
              const divisor = h[6] * x + h[7] * y + h[8];
              return [(h[0] * x + h[1] * y + h[2]) / divisor, (h[3] * x + h[4] * y + h[5]) / divisor];
            }) });
          } finally { src.delete(); dst.delete(); transform.delete(); }
        }
        const signature = inspectSignature(card.mat.data, card.mat.cols, card.mat.rows, lines);
        const cardImage = new ImageData(new Uint8ClampedArray(card.mat.data), card.mat.cols, card.mat.rows);
        const localized = Boolean(card.quad) || hasChromeCardLayout(lines, players, card.mat.cols, card.mat.rows, true);
        const chromeLayout = localized && hasChromeCardLayout(lines, players, card.mat.cols, card.mat.rows);
        const color = inspectParallelColor(card.mat.data, card.mat.cols, card.mat.rows, localized, chromeLayout);
        self.postMessage({ id, result: { ...result, image: { width: card.mat.cols, height: card.mat.rows }, items: lines, quad: card.quad, signature, cardImage, color,
          visualFingerprint: localized ? visualFingerprint(card.mat.data, card.mat.cols, card.mat.rows) : undefined,
          handSupport: { available: Boolean(handDetector), holdingCard: Boolean(card.quad && hands.some(hand => handSupportsQuad(hand, card.quad!))) },
          metrics: { ...result.metrics, detailMs: performance.now() - detailStarted, totalMs: performance.now() - started } } }, { transfer: [cardImage.data.buffer] });
      } finally { card.mat.delete(); mat.delete(); }
    } else throw new Error("Unknown reader request");
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally { busy = false; }
};

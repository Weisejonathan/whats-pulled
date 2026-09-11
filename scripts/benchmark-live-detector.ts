import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { readVisionEvidence } from "../lib/detector/local-evidence";
import type { VisionReading } from "../lib/detector/vision-types";

async function main() {
const args = process.argv.slice(2);
const option = (name: string, fallback = "") => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const manifestPath = option("--manifest");
if (!manifestPath) throw new Error("Use --manifest path.json with [{image, expected: {playerName, limitation, isAutographed}}]. Start the app first.");
const origin = option("--base-url", "http://127.0.0.1:3000");
const runs = Number(option("--runs", "3"));
if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error("--runs must be between 1 and 100.");
const samples = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as Array<{
  image: string; expected: { playerName: string; limitation: string; isAutographed: boolean | null };
}>;
const cases: Array<{ name: string; image: Buffer; expected: typeof samples[number]["expected"] }> = [];
for (const sample of samples) {
  const source = await readFile(resolve(sample.image));
  const variants = args.includes("--augment") ? ["original", "jpeg-1080", "rotation-6", "dim"] : ["original"];
  for (const variant of variants) {
    let pipeline = sharp(source);
    if (variant === "rotation-6") pipeline = pipeline.rotate(6, { background: "#777777" });
    if (variant === "dim") pipeline = pipeline.modulate({ brightness: .7 });
    const size = variant === "jpeg-1080" ? 1080 : 1600;
    pipeline = pipeline.resize({ width: size, height: size, fit: "inside", withoutEnlargement: true });
    const image = await (variant === "jpeg-1080" ? pipeline.jpeg({ quality: 45 }) : pipeline.png()).toBuffer();
    cases.push({ name: `${basename(sample.image)} / ${variant}`, image, expected: sample.expected });
  }
}
const browser = await chromium.launch(process.env.CHROME_EXECUTABLE
  ? { executablePath: process.env.CHROME_EXECUTABLE, headless: true } : { channel: "chrome", headless: true });
const results: Array<Record<string, unknown>> = [];
try {
  const page = await browser.newPage();
  await page.route("**/__detector_benchmark", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local detector benchmark</title><h1>Local detector benchmark</h1>" }));
  await page.route("**/__detector_image/*", route => {
    const item = cases[Number(route.request().url().split("/").at(-1))];
    return route.fulfill({ contentType: "image/png", body: item.image });
  });
  await page.goto(`${origin}/__detector_benchmark`);
  // tsx preserves function names using this helper inside serialized callbacks.
  await page.addScriptTag({ content: "globalThis.__name = (value) => value;" });
  const players = [...new Set(samples.map(item => item.expected.playerName))];
  const measurements = await page.evaluate(async ({ count, runs, players }) => {
    const worker = new Worker("/detector-runtime/vision-worker.js", { type: "module" });
    let nextId = 0;
    const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
    worker.onmessage = event => {
      const job = pending.get(event.data.id); if (!job) return;
      pending.delete(event.data.id);
      if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.result);
    };
    worker.onerror = event => { for (const job of pending.values()) job.reject(new Error(event.message)); pending.clear(); };
    const call = (type: string, image?: ImageData) => new Promise<unknown>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); worker.terminate(); reject(new Error(`${type} deadline exceeded`)); }, type === "init" ? 90_000 : 10_000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      worker.postMessage({ id, type, image, context: { players } }, image ? [image.data.buffer] : []);
    });
    try {
      const cold = performance.now();
      await call("init");
      const coldStartMs = Math.round(performance.now() - cold);
      const measurements = [];
      for (let index = 0; index < count; index++) for (let run = 0; run < runs; run++) {
        const bitmap = await createImageBitmap(await (await fetch(`/__detector_image/${index}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0); bitmap.close();
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const started = performance.now();
        const reading = await call("read", image) as VisionReading;
        delete reading.cardImage;
        measurements.push({ index, run, wallMs: Math.round(performance.now() - started), reading });
      }
      return { coldStartMs, measurements };
    } finally { worker.terminate(); }
  }, { count: cases.length, runs, players });
  for (const item of measurements.measurements) {
    const sample = cases[item.index];
    const reading = readVisionEvidence(item.reading, players);
    const fields = ["playerName", "limitation", "isAutographed"] as const;
    const exact = fields.every(field => reading.suggestion[field] === sample.expected[field]);
    const incorrect = fields.filter(field => reading.suggestion[field] !== null && reading.suggestion[field] !== ""
      && reading.suggestion[field] !== sample.expected[field]);
    results.push({ case: sample.name, run: item.run, wallMs: item.wallMs, exact, incorrect, suggestion: reading.suggestion,
      items: item.reading.items, quad: item.reading.quad, fields: reading.fields, ocrQuality: reading.ocrQuality, signature: item.reading.signature, handSupport: item.reading.handSupport, metrics: item.reading.metrics });
  }
  const times = results.map(item => item.wallMs as number).sort((a, b) => a - b);
  const percentile = (p: number) => times[Math.max(0, Math.ceil(times.length * p) - 1)];
  const summary = { date: new Date().toISOString(), browser: await browser.version(), runs: results.length,
    coldStartMs: measurements.coldStartMs, p50Ms: percentile(.5), p95Ms: percentile(.95),
    exact: results.filter(item => item.exact).length, incorrect: results.filter(item => (item.incorrect as string[]).length).length };
  await writeFile(option("--output", "detector-benchmark.json"), JSON.stringify({ summary, results }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  for (const item of results) console.log(`${item.exact ? "PASS" : "REVIEW"} ${item.wallMs} ms ${item.case} ${JSON.stringify(item.suggestion)}`);
  if (args.includes("--strict") && (summary.exact !== summary.runs || summary.p95Ms > 2000)) process.exitCode = 1;
} finally { await browser.close(); }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });

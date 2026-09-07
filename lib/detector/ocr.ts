import type { ImageLike, Worker } from "tesseract.js";
let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** One reusable worker, bounded queue: do not load four WASM engines per frame. */
export function recognizeText(source: ImageLike) {
  const task = queue.then(async () => {
    if (!workerPromise) workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("eng")).catch(error => { workerPromise = null; throw error; });
    const worker = await workerPromise;
    return worker.recognize(source);
  });
  queue = task.catch(() => undefined);
  return task;
}
export async function disposeOcr() {
  await queue;
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await pending.then(worker => worker.terminate()).catch(() => undefined);
}

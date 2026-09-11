type ImageLike = HTMLCanvasElement | ImageData | string;
import type { VisionReading } from "./vision-types";

type OcrResult = { data: { text: string; confidence: number; vision?: VisionReading } };
export type ReadContext = { players?: string[] };
export type LiveWorker = { initialize?(): Promise<unknown>; recognize(source: ImageLike, context?: ReadContext): Promise<OcrResult>; terminate(): Promise<unknown> };

type ReaderSession = {
  promise: Promise<LiveWorker>;
  instance?: LiveWorker;
  cancelled: boolean;
  rejectInitialization?: (error: Error) => void;
  abort?: Promise<never>;
};

/** One real worker per session; every deadline cancels its underlying work. */
export class LiveOcr {
  private session: ReaderSession | null = null;
  private busy = false;
  constructor(private readonly create: () => LiveWorker | Promise<LiveWorker>, private readonly timeoutMs = 1400, private readonly warmupTimeoutMs = 20_000) {}

  private cancel(session: ReaderSession, error: Error) {
    if (session.cancelled) return;
    session.cancelled = true;
    if (this.session === session) this.session = null;
    session.rejectInitialization?.(error);
    void session.instance?.terminate().catch(() => undefined);
  }

  warm(): Promise<LiveWorker> {
    if (this.session) return this.session.promise;
    const session: ReaderSession = { promise: Promise.resolve(null as unknown as LiveWorker), cancelled: false };
    this.session = session;
    let timer: ReturnType<typeof setTimeout>;
    const creating = Promise.resolve().then(this.create).then(async worker => {
      if (session.cancelled) { await worker.terminate(); throw new Error("Local reader initialization was cancelled."); }
      session.instance = worker;
      await worker.initialize?.();
      return worker;
    });
    const deadline = new Promise<never>((_, reject) => {
      session.rejectInitialization = reject;
      timer = setTimeout(() => this.cancel(session, new Error("Local reader download timed out.")), this.warmupTimeoutMs);
    });
    session.abort = deadline;
    session.promise = Promise.race([creating, deadline]).finally(() => clearTimeout(timer));
    void session.promise.catch(error => this.cancel(session, error));
    return session.promise;
  }

  async read(source: ImageLike, context?: ReadContext, remainingMs = this.timeoutMs) {
    if (this.busy) throw new Error("Local reader is busy. Hold the current card steady.");
    this.busy = true;
    const ready = this.warm(), session = this.session!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        ready.then(worker => worker.recognize(source, context)),
        session.abort!,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("Local reading exceeded its time budget. Retry with a sharper card image or use AI review.");
            this.cancel(session, error); reject(error);
          }, Math.max(1, Math.min(remainingMs, this.timeoutMs)));
        }),
      ]);
    } catch (error) {
      this.cancel(session, error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally { if (timer) clearTimeout(timer); this.busy = false; }
  }

  dispose() {
    if (this.session) this.cancel(this.session, new Error("Local reader was stopped."));
  }
}

function createVisionWorker(): LiveWorker {
  const worker = new Worker("/detector-runtime/vision-worker.js", { type: "module" });
  let nextId = 0;
  let pending: { id: number; resolve(value: unknown): void; reject(error: Error): void } | null = null;
  let terminated = false;
  worker.onmessage = event => {
    if (!pending || pending.id !== event.data.id) return;
    const job = pending; pending = null;
    if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.result);
  };
  worker.onerror = event => { const job = pending; pending = null; job?.reject(new Error(event.message || "Local vision worker failed.")); };
  const call = (type: string, image?: ImageData, context?: ReadContext) => new Promise<unknown>((resolve, reject) => {
    if (terminated) { reject(new Error("Local reader was stopped.")); return; }
    if (pending) { reject(new Error("Local reader is busy.")); return; }
    pending = { id: ++nextId, resolve, reject };
    worker.postMessage({ id: nextId, type, image, context }, image ? [image.data.buffer] : []);
  });
  return {
    initialize: () => call("init"),
    async recognize(source, context) {
      const image = source instanceof HTMLCanvasElement
        ? source.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, source.width, source.height)
        : source instanceof ImageData ? new ImageData(new Uint8ClampedArray(source.data), source.width, source.height) : null;
      if (!image) throw new Error("Local vision requires a canvas or image pixels.");
      const vision = await call("read", image, context) as VisionReading;
      return { data: { text: vision.items.map(line => line.text).join("\n"),
        confidence: vision.items.length ? vision.items.reduce((sum, line) => sum + line.score, 0) / vision.items.length * 100 : 0, vision } };
    },
    async terminate() {
      terminated = true; worker.terminate();
      const job = pending; pending = null; job?.reject(new Error("Local reader was stopped."));
    },
  };
}

export const liveOcr = new LiveOcr(createVisionWorker, 1700, 90_000);

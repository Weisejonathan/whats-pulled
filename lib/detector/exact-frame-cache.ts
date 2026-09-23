import type { LocalReading } from "./local-evidence";

export type CapturedFrameResult = {
  frameId: string;
  trackId: string;
  reading: LocalReading;
  imageDataUrl: string;
};

/** Exact encoded pixels only. Perceptual similarity cannot identify a physical copy. */
export async function exactFrameKey(setId: string, imageDataUrl: string, readingContext = "") {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${imageDataUrl}\0${readingContext}`));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${setId}:${hash}`;
}

/** Keep repeated captures out of OCR, the outbox and the upload queue. */
export class ExactFrameCache {
  private entries = new Map<string, CapturedFrameResult>();
  constructor(private readonly limit = 32) {}

  get(key: string) { return this.entries.get(key); }

  remember(key: string, result: CapturedFrameResult) {
    this.entries.delete(key);
    this.entries.set(key, result);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }

  canonicalize(frameId: string, observationId: string) {
    for (const [key, result] of this.entries) {
      if (result.frameId === frameId) this.entries.set(key, { ...result, frameId: observationId });
    }
  }
}

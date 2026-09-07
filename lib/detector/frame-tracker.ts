export type FrameSample<T> = { value: T; pixels: number[]; quality: number; usable: boolean };
export const frameDistance = (left: number[], right: number[]) => left.length !== right.length || !left.length
  ? Infinity : left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;

/** Track a stable presentation, not an arbitrary slice of compressed JPEG bytes. */
export class StableFrameTracker<T> {
  private previous: number[] = [];
  private accepted: number[] = [];
  private stable = 0;
  private absent = 0;
  private best: FrameSample<T> | null = null;
  private pending = false;
  private retryAt = 0;
  reset() { this.previous = []; this.accepted = []; this.stable = 0; this.absent = 0; this.best = null; this.pending = false; this.retryAt = 0; }
  push(sample: FrameSample<T>, now: number): FrameSample<T> | null {
    if (!sample.usable) {
      this.absent++;
      this.stable = 0;
      this.best = null;
      if (this.absent >= 3) this.accepted = [];
      return null;
    }
    this.absent = 0;
    if (frameDistance(sample.pixels, this.previous) < 7) this.stable++;
    else { this.stable = 1; this.best = null; }
    this.previous = sample.pixels;
    if (!this.best || sample.quality > this.best.quality) this.best = sample;
    if (this.pending || now < this.retryAt || this.stable < 3 || frameDistance(sample.pixels, this.accepted) < 12) return null;
    this.pending = true;
    return this.best;
  }
  complete(sample: FrameSample<T>, success: boolean, now: number) {
    this.pending = false;
    this.retryAt = now + (success ? 1200 : 5000);
    if (success) this.accepted = sample.pixels;
    this.best = null;
  }
}

export type FrameSample<T> = { value: T; pixels: number[]; quality: number; usable: boolean };
export const frameDistance = (left: number[], right: number[]) => left.length !== right.length || !left.length
  ? Infinity : left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;

/** Track a stable presentation, not an arbitrary slice of compressed JPEG bytes. */
export class StableFrameTracker<T> {
  private previous: number[] = [];
  private accepted: number[] = [];
  private stable = 0;
  private absent = 0;
  private transition = 0;
  private recent: FrameSample<T>[] = [];
  private best: FrameSample<T> | null = null;
  private pending: FrameSample<T> | null = null;
  private retryAt = 0;
  reset() { this.previous = []; this.accepted = []; this.stable = 0; this.absent = 0; this.transition = 0; this.recent = []; this.best = null; this.pending = null; this.retryAt = 0; }
  alternative(): FrameSample<T> | null { return this.recent.find(sample => sample !== this.best) ?? null; }
  push(sample: FrameSample<T>, now: number): FrameSample<T> | null {
    if (!sample.usable) {
      this.absent++;
      this.stable = 0;
      this.best = null;
      this.recent = [];
      if (this.absent >= 3) this.accepted = [];
      return null;
    }
    this.absent = 0;
    if (this.accepted.length && frameDistance(sample.pixels, this.accepted) >= 12) this.transition++;
    else this.transition = 0;
    // A witnessed card removal/turn re-arms even an identical-looking next copy.
    // One flash or a single corrupt video frame must not re-arm the detector.
    if (this.transition >= 2) { this.accepted = []; this.transition = 0; }
    if (frameDistance(sample.pixels, this.previous) < 7) this.stable++;
    else { this.stable = 1; this.best = null; this.recent = []; }
    this.previous = sample.pixels;
    this.recent = [...this.recent.slice(-2), sample];
    if (!this.best || sample.quality > this.best.quality) this.best = sample;
    if (this.pending || now < this.retryAt || this.stable < 3 || frameDistance(sample.pixels, this.accepted) < 12) return null;
    this.pending = this.best;
    return this.best;
  }
  complete(sample: FrameSample<T>, success: boolean, now: number) {
    // A completion from the previous camera/focus session must not suppress new cards.
    if (this.pending !== sample) return;
    this.pending = null;
    this.retryAt = now + (success ? 0 : 750);
    if (success) this.accepted = sample.pixels;
    this.best = null;
    this.recent = [];
  }
}

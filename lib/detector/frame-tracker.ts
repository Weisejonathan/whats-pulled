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
  private pendingPresentation = 0;
  private retryAt = 0;
  private attempts = 0;
  private incomplete = false;
  private acceptedQuality = 0;
  private qualityRetries = 0;
  private absentSince: number | null = null;
  private absenceSeparated = false;
  private presentation = 0;
  reset() {
    this.previous = []; this.accepted = []; this.stable = 0; this.absent = 0; this.transition = 0;
    this.recent = []; this.best = null; this.pending = null; this.retryAt = 0; this.attempts = 0;
    this.incomplete = false; this.acceptedQuality = 0; this.qualityRetries = 0;
    this.absentSince = null; this.absenceSeparated = false; this.presentation++;
  }
  /** Short flashes and ordinary hand motion do not manufacture a new card ID. */
  presentationId() { return this.presentation; }
  status() {
    if (this.pending) return "Reading the card…";
    if (this.stable < 3) return "Card is moving. Hold it steady briefly or use Capture now.";
    if (this.accepted.length && this.incomplete) return this.attempts < 5
      ? "Reading another view to improve the name and serial…"
      : "Best available reading retained. Show the serial more clearly or use Capture now.";
    if (this.accepted.length) return "This card has been read. Show the next card or use Capture now to retry.";
    return "Looking for a readable card…";
  }
  alternative(): FrameSample<T> | null { return this.recent.find(sample => sample !== this.best) ?? null; }
  push(sample: FrameSample<T>, now: number, allowRead = true): FrameSample<T> | null {
    if (!sample.usable) {
      this.absent++;
      this.absentSince ??= now;
      this.stable = 0;
      this.best = null;
      this.recent = [];
      // A few blurred frames while the hand turns a card are not a witnessed
      // removal. Only a sustained unusable interval breaks weak visual identity.
      if (!this.absenceSeparated && this.absent >= 5 && now - this.absentSince >= 500) {
        this.accepted = []; this.previous = []; this.attempts = 0; this.retryAt = 0;
        this.incomplete = false; this.qualityRetries = 0; this.acceptedQuality = 0; this.presentation++;
        this.absenceSeparated = true;
      }
      return null;
    }
    this.absent = 0;
    this.absentSince = null; this.absenceSeparated = false;
    if (this.accepted.length && frameDistance(sample.pixels, this.accepted) >= 12) this.transition++;
    else this.transition = 0;
    // A substantial visual change re-arms reading, while CardSessionTracker
    // decides whether the result is another view of the same physical card.
    // One flash or a single corrupt video frame must not re-arm the detector.
    if (this.transition >= 2) {
      this.accepted = []; this.transition = 0; this.attempts = 0; this.qualityRetries = 0;
      this.acceptedQuality = 0; this.retryAt = 0;
    }
    if (frameDistance(sample.pixels, this.previous) < 7) this.stable++;
    else { this.stable = 1; this.best = null; this.recent = []; }
    this.previous = sample.pixels;
    this.recent = [...this.recent.slice(-2), sample];
    if (!this.best || sample.quality > this.best.quality) this.best = sample;
    if (!allowRead || this.pending || now < this.retryAt || this.stable < 3) return null;
    if (frameDistance(sample.pixels, this.accepted) < 12) {
      if (!this.incomplete) return null;
      if (this.attempts >= 5) {
        // A genuinely sharper view can rescue a tiny unreadable stamp, but an
        // unchanged frame must not keep OCR/uploads running indefinitely.
        if (this.qualityRetries >= 2 || sample.quality <= this.acceptedQuality * 1.3 + 5) return null;
        this.qualityRetries++;
      }
    }
    this.pending = this.best;
    this.pendingPresentation = this.presentation;
    return this.best;
  }
  complete(sample: FrameSample<T>, success: boolean, now: number, completeFields = true) {
    // A completion from the previous camera/focus session must not suppress new cards.
    if (this.pending !== sample) return;
    this.pending = null;
    if (this.pendingPresentation !== this.presentation) return;
    this.attempts++;
    this.incomplete = !success || !completeFields;
    this.retryAt = now + (this.incomplete ? 750 : 0);
    this.accepted = sample.pixels;
    this.acceptedQuality = Math.max(this.acceptedQuality, sample.quality);
    this.best = null;
    this.recent = [];
  }
}

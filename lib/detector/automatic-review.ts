import type { DetectorObservation } from "./types";

type QueuedReview = { item: DetectorObservation; dueAt: number; attempts: number; requestedRevision: number | null };
const eligible = (item: DetectorObservation) => item.status === "pending" && !item.payload.mergedIntoId
  && !item.selectedCardId && item.payload.nameSource !== "manual";

/** Debounce progressive evidence; allow one bounded retry when a first AI result becomes stale. */
export class AutomaticReviewQueue {
  private items = new Map<string, QueuedReview>();
  private history = new Map<string, { attempts: number; revision: number }>();
  constructor(private readonly quietMs = 1800, private readonly maxAttempts = 2) {}

  schedule(item: DetectorObservation, now: number) {
    const previous = this.items.get(item.id);
    if (!eligible(item)) { this.items.delete(item.id); return; }
    if (previous && previous.item.revision > item.revision) return;
    const history = this.history.get(item.id);
    const entry: QueuedReview = previous ?? { item, dueAt: now + this.quietMs, attempts: history?.attempts ?? 0, requestedRevision: history?.revision ?? null };
    entry.item = item;
    if (entry.requestedRevision !== item.revision && entry.attempts < this.maxAttempts) entry.dueAt = now + this.quietMs;
    this.items.set(item.id, entry);
  }

  reconcile(current: DetectorObservation[], now: number) {
    const byId = new Map(current.map(item => [item.id, item]));
    for (const [id, queued] of this.items) {
      const item = byId.get(id);
      if (!item || !eligible(item)) { this.items.delete(id); continue; }
      if (item.revision > queued.item.revision) this.schedule(item, now);
    }
  }

  /** Caller owns the one-provider-request-at-a-time lock. */
  take(now: number): DetectorObservation | null {
    const entry = [...this.items.values()].filter(item => item.attempts < this.maxAttempts
      && item.requestedRevision !== item.item.revision && item.dueAt <= now)
      .sort((left, right) => left.dueAt - right.dueAt)[0];
    if (!entry) return null;
    entry.attempts++;
    entry.requestedRevision = entry.item.revision;
    this.history.set(entry.item.id, { attempts: entry.attempts, revision: entry.item.revision });
    entry.dueAt = Infinity;
    return entry.item;
  }
}

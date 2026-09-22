/** Bounded retries for retained frames; never retry while a fresh frame is read. */
export class UploadRetry {
  private attempts = new Map<string, { count: number; after: number }>();
  ready(id: string, now: number) { const entry = this.attempts.get(id); return !entry || (entry.count < 3 && now >= entry.after); }
  start(id: string, now: number) {
    const count = (this.attempts.get(id)?.count ?? 0) + 1;
    this.attempts.set(id, { count, after: now + (count === 1 ? 5000 : 15000) });
  }
  done(id: string) { this.attempts.delete(id); }
  online() { this.attempts.clear(); }
}

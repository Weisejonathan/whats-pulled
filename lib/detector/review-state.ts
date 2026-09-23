import type { DetectorObservation } from "./types";
import type { PendingObservation } from "./outbox";

export function canonicalReviewId(id: string, aliases: ReadonlyMap<string, string>) {
  const visited = new Set<string>();
  while (aliases.has(id) && !visited.has(id)) { visited.add(id); id = aliases.get(id)!; }
  return id;
}

/** A late upload response must not replace newer edits or an approval. */
export function upsertReviewCard(current: DetectorObservation[], incoming: DetectorObservation, aliases: Map<string, string> = new Map()) {
  if (incoming.payload.mergedIntoId) aliases.set(incoming.id, incoming.payload.mergedIntoId);
  const visible = current.filter(item => !aliases.has(item.id) && !item.payload.mergedIntoId);
  if (aliases.has(incoming.id)) return visible;
  const existing = visible.find(item => item.id === incoming.id);
  if (existing && existing.revision > incoming.revision) return visible;
  if (existing?.revision === incoming.revision && existing.payload.group && incoming.payload.group) {
    incoming = { ...incoming, payload: { ...incoming.payload, group: { ...incoming.payload.group,
      seenCount: Math.max(existing.payload.group.seenCount, incoming.payload.group.seenCount),
      firstSeenAt: [existing.payload.group.firstSeenAt, incoming.payload.group.firstSeenAt].sort()[0],
      lastSeenAt: [existing.payload.group.lastSeenAt, incoming.payload.group.lastSeenAt].sort().at(-1)!,
    } } };
  }
  return [incoming, ...visible.filter(item => item.id !== incoming.id)]
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/** Refresh is authoritative for untouched rows, but cannot undo changes made while it was loading. */
export function refreshReviewCards(current: DetectorObservation[], incoming: DetectorObservation[],
  atRequest: ReadonlyMap<string, number>, aliases: Map<string, string> = new Map()) {
  for (const item of incoming) if (item.payload.mergedIntoId) aliases.set(item.id, item.payload.mergedIntoId);
  const returned = new Set(incoming.map(item => item.id));
  const retained = current.filter(item => returned.has(item.id) || !atRequest.has(item.id) || item.revision > atRequest.get(item.id)!);
  return incoming.reduce((rows, item) => upsertReviewCard(rows, item, aliases), retained)
    .filter(item => !aliases.has(item.id) && !item.payload.mergedIntoId);
}

export function pendingCardGroups(frames: PendingObservation[]) {
  const groups = new Map<string, PendingObservation[]>();
  for (const frame of frames) {
    const key = frame.sessionId && frame.trackId ? `${frame.sessionId}:${frame.trackId}` : frame.id;
    groups.set(key, [...(groups.get(key) ?? []), frame]);
  }
  return [...groups.entries()].map(([id, items]) => {
    const frames = [...items].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    return { id, frames, latest: frames[frames.length - 1] };
  });
}

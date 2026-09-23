import test from "node:test";
import assert from "node:assert/strict";
import { pendingCardGroups, refreshReviewCards, upsertReviewCard } from "../lib/detector/review-state";
import type { DetectorObservation } from "../lib/detector/types";

const card = (revision: number, status: DetectorObservation["status"] = "pending"): DetectorObservation => ({
  id: "card", revision, status, capturedAt: "2026-09-23T12:00:00Z",
  payload: { suggestion: {}, matches: [], detectedText: "", notes: "" },
  selectedCardId: null, imageUrl: "proof.webp", thumbnailUrl: "thumb.webp", pullReportId: null,
  overlayEventId: null, overlayKey: null, overlayError: null, pulledBy: null,
});

test("late upload cannot reset an approved card or create a second review item", () => {
  const approved = card(6, "approved");
  let queue = upsertReviewCard([card(1)], card(2));
  queue = upsertReviewCard(queue, approved);
  queue = upsertReviewCard(queue, card(3));
  assert.deepEqual(queue, [approved]);
});

test("a slow refresh cannot undo an approval or erase captures added during its request", () => {
  const baseline = new Map([["card", 1]]);
  const approved = card(5, "approved"), newCard = { ...card(1), id: "new-card" };
  const refreshed = refreshReviewCards([approved, newCard], [card(1)], baseline);
  assert.deepEqual(refreshed.find(item => item.id === "card"), approved);
  assert.deepEqual(refreshed.find(item => item.id === "new-card"), newCard);
});

test("merge tombstones prevent late uploads and stale refresh from restoring duplicate cards", () => {
  const aliases = new Map<string, string>();
  const target = { ...card(3), id: "target" };
  const alias = { ...card(2, "rejected"), payload: { ...card(1).payload, mergedIntoId: "target" } };
  let queue = upsertReviewCard([card(1), target], alias, aliases);
  queue = upsertReviewCard(queue, card(1), aliases);
  queue = refreshReviewCards(queue, [card(1), target], new Map([["card", 1], ["target", 3]]), aliases);
  assert.deepEqual(queue, [target]);
});

test("refresh removes untouched rows absent from the authoritative server list", () => {
  assert.deepEqual(refreshReviewCards([card(1)], [], new Map([["card", 1]])), []);
});

test("offline frames group by session and track without losing individual retries", () => {
  const frames = Array.from({ length: 5 }, (_, i) => ({ id: `frame-${i}`, sessionId: "session", trackId: "card", imageDataUrl: "data", capturedAt: "now", suggestion: {} }));
  const groups = pendingCardGroups(frames);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].frames.length, 5);
  assert.equal(pendingCardGroups([...frames, { ...frames[0], id: "next", trackId: "next-card" }]).length, 2);
  assert.equal(pendingCardGroups([...frames, { ...frames[0], id: "other", sessionId: "other-session" }]).length, 2);
  assert.equal(pendingCardGroups(frames.map(({ sessionId: _, trackId: __, ...frame }) => frame)).length, 5);
});

test("same-revision late responses cannot reduce the grouped sighting count", () => {
  const grouped = (seenCount: number, lastSeenAt: string) => ({ ...card(2), payload: { ...card(2).payload,
    group: { sessionId: "session", trackId: "track", seenCount, firstSeenAt: "2026-09-23T12:00:00Z", lastSeenAt, bestFrameId: "frame", bestQuality: 30 } } });
  const queue = upsertReviewCard([grouped(5, "2026-09-23T12:00:05Z")], grouped(2, "2026-09-23T12:00:02Z"));
  assert.equal(queue[0].payload.group?.seenCount, 5);
  assert.equal(queue[0].payload.group?.lastSeenAt, "2026-09-23T12:00:05Z");
});

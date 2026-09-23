import test from "node:test";
import assert from "node:assert/strict";
import { AutomaticReviewQueue } from "../lib/detector/automatic-review";
import type { DetectorObservation } from "../lib/detector/types";

const card = (revision = 1): DetectorObservation => ({
  id: "card", revision, status: "pending", selectedCardId: null, imageUrl: "proof.webp", thumbnailUrl: "thumb.webp",
  capturedAt: "2026-09-23T12:00:00Z", payload: { suggestion: {}, matches: [], detectedText: "", notes: "" },
  pullReportId: null, overlayEventId: null, overlayKey: null, overlayError: null, pulledBy: null,
});

test("automatic review waits for progressive evidence to settle and uses its newest revision", () => {
  const queue = new AutomaticReviewQueue();
  queue.schedule(card(1), 0);
  assert.equal(queue.take(1000), null);
  queue.schedule(card(2), 1200);
  assert.equal(queue.take(2000), null);
  assert.equal(queue.take(3000)?.revision, 2);
  assert.equal(queue.take(4000), null);
});

test("a stale first review can be replaced once, never indefinitely", () => {
  const queue = new AutomaticReviewQueue();
  queue.schedule(card(1), 0);
  assert.equal(queue.take(1800)?.revision, 1);
  queue.reconcile([card(2)], 2000);
  assert.equal(queue.take(3700), null);
  assert.equal(queue.take(3800)?.revision, 2);
  queue.schedule(card(3), 4000);
  assert.equal(queue.take(10000), null, "two paid automatic requests is the hard group limit");
});

test("late old upload responses cannot queue a stale revision or duplicate the same request", () => {
  const queue = new AutomaticReviewQueue();
  queue.schedule(card(3), 0);
  queue.schedule(card(1), 500);
  assert.equal(queue.take(1800)?.revision, 3);
  queue.schedule(card(3), 2500);
  assert.equal(queue.take(5000), null);
});

test("approval, manual correction and merged aliases cancel queued automatic work", () => {
  for (const update of [
    { ...card(), status: "approved" as const },
    { ...card(), selectedCardId: "catalog-id" },
    { ...card(), payload: { ...card().payload, nameSource: "manual" as const } },
    { ...card(), payload: { ...card().payload, mergedIntoId: "target" } },
  ]) {
    const queue = new AutomaticReviewQueue();
    queue.schedule(card(), 0);
    queue.reconcile([update], 500);
    assert.equal(queue.take(2000), null);
    queue.schedule(update, 3000);
    assert.equal(queue.take(5000), null);
  }
});

test("temporarily leaving the loaded review list does not reset the paid-request budget", () => {
  const queue = new AutomaticReviewQueue(10);
  queue.schedule(card(1), 0); assert.ok(queue.take(10));
  queue.reconcile([], 20);
  queue.schedule(card(2), 30); assert.ok(queue.take(40));
  queue.reconcile([], 50);
  queue.schedule(card(3), 60); assert.equal(queue.take(100), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { StableFrameTracker } from "../lib/detector/frame-tracker";
import { projectQuad, findCardQuad } from "../lib/detector/capture";
test("stable presentation sends once, failures remain retryable, new cards are detected", () => {
  const tracker = new StableFrameTracker<string>();
  const sample = { value: "frame", pixels: [30, 50, 100], quality: 40, usable: true };
  assert.equal(tracker.push(sample, 0), null); assert.equal(tracker.push(sample, 350), null);
  assert.equal(tracker.push(sample, 700)?.value, "frame");
  tracker.complete(sample, false, 800); assert.equal(tracker.push(sample, 1000), null);
  assert.ok(tracker.push(sample, 6000)); tracker.complete(sample, true, 6100);
  assert.equal(tracker.push(sample, 9000), null);
  const next = { ...sample, pixels: [130, 150, 200] };
  tracker.push(next, 10000); tracker.push(next, 10350); assert.ok(tracker.push(next, 10700));
});
test("perspective mapping preserves all four card corners", () => {
  const quad = [{ x: 10, y: 20 }, { x: 100, y: 10 }, { x: 120, y: 180 }, { x: 0, y: 150 }];
  for (const [i, [u, v]] of [[0, 0], [1, 0], [1, 1], [0, 1]].entries()) {
    const result = projectQuad(quad, u, v);
    assert.ok(Math.abs(result.x - quad[i].x) < .0001 && Math.abs(result.y - quad[i].y) < .0001);
  }
});
test("blank frames are never rectified into a fictitious card", () => {
  assert.equal(findCardQuad(new Uint8ClampedArray(100 * 140 * 4), 100, 140), null);
});

test("camera reset ignores completion from the previous presentation", () => {
  const tracker = new StableFrameTracker<string>();
  const old = { value: "old", pixels: [30, 50], quality: 40, usable: true };
  tracker.push(old, 0); tracker.push(old, 120); tracker.push(old, 240);
  tracker.reset();
  const next = { ...old, value: "new" };
  tracker.push(next, 300); tracker.push(next, 420);
  assert.equal(tracker.push(next, 540), next);
  tracker.complete(old, true, 550);
  assert.equal(tracker.push(next, 660), null, "new request is still in flight");
  tracker.complete(next, false, 700);
  assert.equal(tracker.push(next, 800), null);
  assert.equal(tracker.push(next, 1500), next);
});

test("a successful card does not impose a cooldown on a different stable card", () => {
  const tracker = new StableFrameTracker<string>();
  const first = { value: "first", pixels: [30, 50], quality: 40, usable: true };
  tracker.push(first, 0); tracker.push(first, 120); tracker.push(first, 240);
  tracker.complete(first, true, 300);
  const second = { ...first, value: "second", pixels: [130, 150] };
  tracker.push(second, 360); tracker.push(second, 480);
  assert.equal(tracker.push(second, 600), second);
});

test("dense textured backgrounds do not become a card crop", () => {
  const width = 100, height = 140;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 240 : 20;
    pixels[i + 3] = 255;
  }
  assert.equal(findCardQuad(pixels, width, height), null);
});

test("a witnessed removal allows an identical-looking next copy, but one flash does not", () => {
  const tracker = new StableFrameTracker<string>();
  const card = { value: "card", pixels: [30, 50], quality: 40, usable: true };
  tracker.push(card, 0); tracker.push(card, 120); tracker.push(card, 240); tracker.complete(card, true, 300);
  const hand = { ...card, value: "hand", pixels: [100, 150] };
  tracker.push(hand, 400); tracker.push(card, 520); tracker.push(card, 640);
  assert.equal(tracker.push(card, 760), null);
  tracker.push(hand, 900); tracker.push(hand, 1020);
  tracker.push(card, 1140); tracker.push(card, 1260);
  assert.equal(tracker.push(card, 1380), card);
});

test("the retry alternative is from the same stable burst and is cleared on movement", () => {
  const tracker = new StableFrameTracker<string>();
  const first = { value: "first", pixels: [30, 50], quality: 40, usable: true };
  tracker.push(first, 0);
  tracker.push({ ...first, value: "second", quality: 30 }, 120);
  tracker.push({ ...first, value: "third", quality: 20 }, 240);
  assert.equal(tracker.alternative()?.value, "second");
  tracker.reset();
  assert.equal(tracker.alternative(), null);
});

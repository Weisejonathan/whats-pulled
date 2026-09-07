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

import test from "node:test";
import assert from "node:assert/strict";
import { ExactFrameCache, exactFrameKey } from "../lib/detector/exact-frame-cache";
import { readLocalEvidence } from "../lib/detector/local-evidence";

const result = (id: string) => ({ frameId: id, trackId: "track", imageDataUrl: "proof", reading: readLocalEvidence("", [], 0) });

test("identical screenshots share an exact key while changed pixels and checklists remain distinct", async () => {
  assert.equal(await exactFrameKey("set", "image-1"), await exactFrameKey("set", "image-1"));
  assert.notEqual(await exactFrameKey("set", "image-1"), await exactFrameKey("set", "image-2"));
  assert.notEqual(await exactFrameKey("set", "image-1"), await exactFrameKey("other", "image-1"));
  assert.notEqual(await exactFrameKey("set", "image-1", "[]"), await exactFrameKey("set", "image-1", "[150]"), "New checklist evidence must permit re-reading the same pixels");
});

test("upload and merge responses redirect repeated screenshots to the canonical decision", () => {
  const cache = new ExactFrameCache();
  cache.remember("image", result("frame"));
  cache.canonicalize("frame", "card");
  cache.canonicalize("card", "merged");
  assert.equal(cache.get("image")?.frameId, "merged");
  assert.equal(cache.get("image")?.imageDataUrl, "proof");
});

test("the screenshot cache is bounded without losing the most recent proofs", () => {
  const cache = new ExactFrameCache(2);
  cache.remember("old", result("1"));
  cache.remember("keep", result("2"));
  cache.remember("latest", result("3"));
  assert.equal(cache.get("old"), undefined);
  assert.equal(cache.get("keep")?.frameId, "2");
  assert.equal(cache.get("latest")?.frameId, "3");
});

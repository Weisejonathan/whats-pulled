import test from "node:test";
import assert from "node:assert/strict";
import { POST as obs } from "../app/api/obs/recognitions/[overlayKey]/route";
import { POST as instagram } from "../app/api/detector/instagram/route";
import { POST as training } from "../app/api/detector/training-samples/route";
import { POST as approval } from "../app/api/stream-detector/approve/route";
import { POST as matching } from "../app/api/cards/match/route";
import { GET as players } from "../app/api/cards/players/route";

test("retired detection routes cannot bypass the unified review queue", async () => {
  for (const handler of [obs, instagram, training, approval, matching, players]) {
    const response = handler();
    assert.equal(response.status, 410);
    assert.equal((await response.json()).detectorUrl, "/stream-detector");
  }
});

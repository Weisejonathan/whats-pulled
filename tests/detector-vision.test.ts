import test from "node:test";
import assert from "node:assert/strict";
import { readVisionEvidence, chooseFrameReading, mergeAiReading, needsAiReview } from "../lib/detector/local-evidence";
import { inspectSignature } from "../lib/detector/signature";
import { handSupportsQuad, orderCardCorners, rectifyCard } from "../lib/detector/card-geometry";
import type { TextLine, VisionReading } from "../lib/detector/vision-types";
import cv from "@techstark/opencv-js";
import readings from "./fixtures/paddle-card-readings.json";

const players = ["Amanda Anisimova", "Flavio Cobolli"];
const fixture = (index: number) => readings[index] as unknown as VisionReading;

test("real model outputs recover both example identities without guessing the damaged name or slash", () => {
  const first = readVisionEvidence(fixture(0), players), second = readVisionEvidence(fixture(1), players);
  assert.deepEqual(first.suggestion, { playerName: players[0], limitation: "1/5", isAutographed: true });
  assert.deepEqual(second.suggestion, { playerName: players[1], limitation: "37/50", isAutographed: true });
  assert.equal(needsAiReview(first), false);
  assert.equal(needsAiReview(second), true, "moderate-confidence serial still receives optional verification");
});

test("field confidence is independent of illegible logos; numeric strings do not become serials", () => {
  const original = fixture(1);
  const vision = { ...original, items: original.items.filter(line => line.text !== "37/50") };
  const reading = readVisionEvidence(vision, players);
  assert.equal(reading.suggestion.playerName, players[1]);
  assert.equal(reading.suggestion.limitation, "", "37150 is not automatically rewritten to 37/50");
  assert.equal(reading.fields?.serial, "unknown");
  const conflicting = readVisionEvidence({ ...original, items: [...original.items, { text: "38/50", score: .99, poly: [] }] }, players);
  assert.equal(conflicting.suggestion.limitation, "");
  assert.equal(conflicting.fields?.serial, "conflict");
});

test("better frames retain complete provenance; disagreements cannot create a mixed card", () => {
  const first = readVisionEvidence(fixture(0), players);
  const partial = { ...first, suggestion: { ...first.suggestion, limitation: "" } };
  assert.equal(chooseFrameReading(partial, first).index, 1);
  const second = readVisionEvidence(fixture(1), players);
  const chosen = chooseFrameReading(first, second).reading;
  assert.equal(chosen.suggestion.playerName, "");
  assert.equal(chosen.suggestion.limitation, "");
  assert.match(chosen.notes, /Conflicting/);
  assert.equal(first.suggestion.playerName, players[0], "inputs are immutable");
});

test("AI omissions and partial print runs preserve local readings; explicit disagreements require review", () => {
  const local = readVisionEvidence(fixture(0), players);
  const partial = { ...local, model: "provider", suggestion: { playerName: "", limitation: "/5", isAutographed: null } };
  assert.deepEqual(mergeAiReading(local, partial).suggestion, local.suggestion);
  const wrong = { ...partial, suggestion: { limitation: "2/5", isAutographed: false } };
  const merged = mergeAiReading(local, wrong);
  assert.equal(merged.suggestion.limitation, "");
  assert.equal(merged.suggestion.isAutographed, null);
  assert.match(merged.notes, /disagreement/);
  assert.equal(mergeAiReading(local, { ...partial, suggestion: { limitation: "01/05" } }).suggestion.limitation, "1/5");
});

const certification: TextLine[] = [{ text: "TOPPS CERTIFIED AUTOGRAPH ISSUE", score: .99, poly: [[50, 280], [210, 280], [210, 290], [50, 290]] }];
const image = () => new Uint8ClampedArray(250 * 350 * 4).fill(255);
function blue(data: Uint8ClampedArray, x: number, y: number) { const i = (y * 250 + x) * 4; data[i] = 10; data[i + 1] = 70; data[i + 2] = 180; }

test("certification alone, blue rectangles and printed frames do not prove a signature", () => {
  assert.equal(inspectSignature(image(), 250, 350, certification).present, null);
  for (const filled of [true, false]) {
    const data = image();
    for (let y = 210; y < 260; y++) for (let x = 40; x < 210; x++) {
      if (filled || y < 214 || y > 255 || x < 44 || x > 205) blue(data, x, y);
    }
    assert.equal(inspectSignature(data, 250, 350, certification).present, null);
  }
});

test("connected pen-like strokes require a spatial certification anchor", () => {
  const data = image();
  for (let x = 35; x < 215; x++) for (let dy = -2; dy <= 2; dy++) blue(data, x, Math.round(235 + Math.sin(x / 20) * 18) + dy);
  assert.equal(inspectSignature(data, 250, 350, certification).present, true);
  assert.equal(inspectSignature(data, 250, 350, []).present, null);
  assert.equal(inspectSignature(data, 250, 350, [{ ...certification[0], score: .3 }]).present, null);
});

test("hand support excludes printed hands inside a card and distant hands", () => {
  const quad = [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 330 }, { x: 50, y: 330 }];
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: 100 + i, y: 120 + i }));
  assert.equal(handSupportsQuad(hand, quad), false);
  assert.equal(handSupportsQuad(hand.map(p => ({ x: p.x + 300, y: p.y })), quad), false);
  assert.equal(handSupportsQuad(hand.map((p, i) => ({ x: 35 + i, y: p.y })), quad), true);
  assert.deepEqual(orderCardCorners([quad[2], quad[0], quad[3], quad[1]]), quad);
});

test("real OpenCV rejects blank input and finds a card boundary without hand detection", async () => {
  if (!cv.Mat) await new Promise<void>(resolve => { cv.onRuntimeInitialized = resolve; });
  const mat = new cv.Mat(400, 400, cv.CV_8UC4, new cv.Scalar(40, 40, 40, 255));
  let card = rectifyCard(cv, mat);
  assert.equal(card.quad, null); card.mat.delete();
  cv.rectangle(mat, new cv.Point(100, 60), new cv.Point(300, 340), new cv.Scalar(240, 240, 240, 255), -1);
  card = rectifyCard(cv, mat);
  assert.ok(card.quad);
  assert.ok(Math.abs(card.mat.cols / card.mat.rows - 63 / 88) < .01);
  card.mat.delete(); mat.delete();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readVisionEvidence } from "../lib/detector/local-evidence";
import { hasChromeCardLayout, inspectParallelColor, parallelColorHints, visualFingerprint } from "../lib/detector/visual-evidence";
import type { VisionReading } from "../lib/detector/vision-types";
import streamReadings from "./fixtures/stream-field-readings.json";
import streamSerial from "./fixtures/stream-serial-reading.json";
import fullCard from "./fixtures/full-card-layout-reading.json";

test("foreground name cannot inherit a background card serial", () => {
  const source = streamReadings[0].reading as unknown as VisionReading;
  const reading = readVisionEvidence({ ...source, items: [...source.items,
    { text: "22/50", score: .99, poly: [[205, 510], [250, 520], [246, 535], [201, 525]] }] }, ["Maximilian Marterer", "Martina Trevisan"]);
  assert.equal(reading.suggestion.playerName, "Maximilian Marterer");
  assert.equal(reading.suggestion.limitation, "");
  assert.equal(reading.fields?.serial, "conflict");
  assert.deepEqual(reading.proof?.serial, []);
  assert.match(reading.notes, /cannot safely be assigned/);
});

test("printed first and last names require spatial proximity", () => {
  const source = streamReadings[1].reading as unknown as VisionReading;
  const items = [
    { text: "MARTINA", score: .99, poly: [[20, 20], [100, 20], [100, 35], [20, 35]] },
    { text: "TREVISAN", score: .99, poly: [[500, 400], [610, 400], [610, 420], [500, 420]] },
  ];
  const reading = readVisionEvidence({ ...source, items }, ["Martina Trevisan"]);
  assert.equal(reading.fields?.name, "catalog", "a separate firstname is not claimed as printed full-name evidence");
  const close = readVisionEvidence({ ...source, items: [items[0], { ...items[1], poly: [[20, 37], [130, 37], [130, 57], [20, 57]] }] }, ["Martina Trevisan"]);
  assert.equal(close.fields?.name, "read");
});

test("proof crops use normalized retained-image coordinates and preserve the literal serial", () => {
  const reading = readVisionEvidence(streamReadings[1].reading as unknown as VisionReading, ["Martina Trevisan"]);
  assert.ok(reading.proof?.name.length);
  assert.ok(reading.proof?.serial.length);
  for (const proof of [...reading.proof!.name, ...reading.proof!.serial]) {
    assert.ok(proof.box.x >= 0 && proof.box.y >= 0);
    assert.ok(proof.box.x + proof.box.width <= 1 && proof.box.y + proof.box.height <= 1);
  }
  assert.equal(reading.proof!.serial[0].text, "22/50");
});

test("checklist print runs only resolve actually read denominators with an agreeing copy", () => {
  const source = streamReadings[1].reading as unknown as VisionReading;
  const serial = { text: "144/150", score: .94, poly: [[20, 100], [100, 100], [100, 120], [20, 120]] };
  const vision = { ...source, items: [serial, { ...serial, text: "144/158", score: .96 }] };
  const reading = readVisionEvidence(vision, [], { printRuns: [50, 99, 150] });
  assert.equal(reading.suggestion.limitation, "144/150");
  assert.deepEqual(reading.proof!.serial.map(proof => proof.text), ["144/150"]);
  assert.match(reading.notes, /checklist disambiguated/);
  assert.equal(readVisionEvidence(vision, []).suggestion.limitation, "", "without selected checklist both readings remain a conflict");
  assert.equal(readVisionEvidence(vision, [], { printRuns: [150, 158] }).suggestion.limitation, "");
  assert.equal(readVisionEvidence({ ...vision, items: [serial, { ...serial, text: "145/158" }] }, [], { printRuns: [150] }).suggestion.limitation, "", "differing individual copies are never resolved by checklist");
  assert.equal(readVisionEvidence({ ...vision, items: [{ ...serial, text: "144/158" }] }, [], { printRuns: [150] }).suggestion.limitation, "144/158", "a lone unsupported read is retained for review, never rewritten to /150");
});

test("real sideways stream serial has explicit OCR and checklist provenance", () => {
  const reading = readVisionEvidence(streamSerial as unknown as VisionReading, ["Marco Trungelliti"], { printRuns: [199, 150, 125, 99, 65, 50, 25, 10, 2, 5, 1] });
  assert.equal(reading.suggestion.playerName, "Marco Trungelliti");
  assert.equal(reading.fields?.name, "catalog");
  assert.equal(reading.suggestion.limitation, "144/150");
  assert.equal(reading.proof?.serial[0].text, "144/150");
  assert.match(reading.notes, /checklist disambiguated/);
  assert.equal(readVisionEvidence(streamSerial as unknown as VisionReading, ["Marco Trungelliti"]).fields?.serial, "conflict");
});

function pixels(width: number, height: number, rgb: number[]) {
  return Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : rgb[i % 4]);
}
test("color requires localization and agreeing foil regions, never guesses a serial", () => {
  const gold = pixels(100, 140, [210, 180, 20]);
  assert.equal(inspectParallelColor(gold, 100, 140, false).label, "unknown");
  const color = inspectParallelColor(gold, 100, 140, true);
  assert.equal(color.label, "yellow/gold");
  assert.equal(inspectParallelColor(pixels(100, 140, [255, 255, 255]), 100, 140, true).label, "unknown");
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) { const i = (y * 100 + x) * 4; gold[i] = 10; gold[i + 1] = 40; gold[i + 2] = 230; }
  assert.equal(inspectParallelColor(gold, 100, 140, true).label, "unknown", "two differently colored regions must not produce a confident parallel hint");
  assert.deepEqual(parallelColorHints(color, "tennis", [
    { setId: "tennis", parallel: "Gold Refractor" }, { setId: "tennis", parallel: "Gold Wave Refractor" },
    { setId: "other", parallel: "Gold Sapphire" }, { setId: "tennis", parallel: "Green Refractor" },
  ]), ["Gold Refractor", "Gold Wave Refractor"]);
});

test("appearance fingerprint is compact and insensitive to uniform exposure changes", () => {
  const data = pixels(90, 80, [0, 0, 0]);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 90; x++) for (let c = 0; c < 3; c++) data[(y * 90 + x) * 4 + c] = x * 2;
  const hash = visualFingerprint(data, 90, 80);
  assert.match(hash, /^[a-f0-9]{16}$/);
  assert.equal(visualFingerprint(data.map((v, i) => i % 4 === 3 ? v : v + 30), 90, 80), hash);
});

test("a complete uncropped card needs logo, bottom name and certification, not just portrait dimensions", () => {
  const lines = fullCard.items, players = ["Amanda Anisimova", "Martina Trevisan"];
  assert.equal(hasChromeCardLayout(lines, players, 750, 1050, true), true);
  assert.equal(hasChromeCardLayout(lines, players, 1050, 750, true), false, "sideways streams are not a complete card");
  assert.equal(hasChromeCardLayout(lines.filter(line => line.text !== "chrome"), players, 750, 1050, true), false);
  assert.equal(hasChromeCardLayout(lines.filter(line => !line.text.includes("CERTIFIED")), players, 750, 1050, true), false);
  assert.equal(hasChromeCardLayout(lines.map(line => ({ ...line, poly: line.poly.map(([x,y]) => [x * .6 + 100, y * .6 + 50]) })), players, 750, 1050, true), false, "a smaller card within a portrait scene is not the full frame");
  assert.equal(hasChromeCardLayout([...lines, { text: "TREVISAN", score: .99, poly: [[30, 400], [170, 400], [170, 420], [30, 420]] }], players, 750, 1050, true), false, "a second known card name invalidates whole-frame color and identity");
  assert.equal(hasChromeCardLayout(lines.filter(line => line.text !== "AMANDA"), players, 750, 1050, true), false, "a catalog-inferred firstname is insufficient for full-frame validation");
});

test("Chrome corner color excludes the green branding and different lower foil hues", () => {
  const data = pixels(200, 280, [20, 150, 40]);
  for (let y = 0; y < 32; y++) for (let x = 146; x < 200; x++) {
    const i = (y * 200 + x) * 4; data[i] = 180; data[i + 1] = 20; data[i + 2] = 45;
  }
  assert.equal(inspectParallelColor(data, 200, 280, true, true).label, "red");
  assert.equal(inspectParallelColor(data, 200, 280, false, true).label, "unknown", "layout sampling never overrides missing card validation");
});

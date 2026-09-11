import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSetConflict } from "../lib/detector/set-conflict";

test("missing year, word order and punctuation do not invent a set conflict", () => {
  for (const label of ["", "Topps Chrome Tennis", "2025 TOPPS CHROME TENNIS", "Topps: Chrome Tennis (2025)"]) {
    assert.equal(hasSetConflict(label, "Topps Chrome Tennis 2025"), false);
  }
});
test("a different explicit year or product still requires review", () => {
  for (const label of ["Topps Chrome Tennis 2023", "Topps Chrome Sapphire Tennis 2025", "Topps Chrome Baseball 2025"]) {
    assert.equal(hasSetConflict(label, "Topps Chrome Tennis 2025"), true);
  }
});

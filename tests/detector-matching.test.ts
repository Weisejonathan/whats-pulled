import test from "node:test";
import assert from "node:assert/strict";
import { rankCardCandidates, validateCopy, selectUniquePlayer, type CatalogCandidate } from "../lib/detector/matching";

const card: CatalogCandidate = { cardId: "gold", cardName: "Gold Refractor", parallel: "Gold Refractor", playerName: "Test Player", setName: "Test Set 2025", setId: "set", cardNumber: 1, serialNumber: "/50", cardUrl: "/cards/gold", imageUrl: null };
test("player and set alone never identify a variant", () => {
  const matches = rankCardCandidates([card, { ...card, cardId: "orange", parallel: "Orange Refractor", serialNumber: "/25" }], { playerName: card.playerName, setName: card.setName });
  assert.equal(matches.length, 2);
  assert.ok(matches.every((match) => match.score === 0.45 && !match.autoEligible));
});
test("contradictory serial, number, player or autograph cannot match", () => {
  for (const wrong of [{ limitation: "18/25" }, { cardNumber: 2 }, { playerName: "Other Player" }, { isAutographed: true }, { limitation: "0/50" }]) {
    assert.equal(rankCardCandidates([card], { playerName: card.playerName, setId: "set", ...wrong }).length, 0);
  }
});
test("unique supported candidate can be suggested; ties cannot", () => {
  const input = { playerName: card.playerName, setId: "set", limitation: "18/50", isAutographed: false };
  assert.equal(rankCardCandidates([card], input)[0].autoEligible, true);
  assert.ok(rankCardCandidates([card, { ...card, cardId: "other" }], input).every((match) => !match.autoEligible));
});
test("copy validation checks numerator AND denominator", () => {
  for (const value of ["18/25", "0/99", "100/99", "/99", "foo", "1/99 extra"]) assert.throws(() => validateCopy(value, 99));
  assert.equal(validateCopy("018/099", 99), 18);
  assert.equal(validateCopy("/1", 1), 1);
});
test("ambiguous surnames are never forcibly corrected", () => {
  assert.equal(selectUniquePlayer("Williams", ["Venus Williams", "Serena Williams"]), "");
  assert.equal(selectUniquePlayer("Sabalenka", ["Aryna Sabalenka"]), "Aryna Sabalenka");
});

test("real catalog stores set title separately from plural autograph parallel labels", () => {
  const sapphire = { ...card, cardName: "Topps Chrome Sapphire Tennis 2025 Autograph", parallel: "Autographs Orange Sapphire", serialNumber: "/25" };
  const matches = rankCardCandidates([sapphire], { playerName: card.playerName, setId: card.setId, cardName: "Orange Sapphire Auto", limitation: "18/25", isAutographed: true });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].autoEligible, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { CardSessionTracker, cardFingerprintDistance } from "../lib/detector/card-session";
import type { LocalReading } from "../lib/detector/local-evidence";

const reading = (name = "Martina Trevisan", serial = "22/50"): LocalReading => ({
  suggestion: { playerName: name, limitation: serial, setId: "tennis-2025", isAutographed: null },
  fields: { name: name ? "read" : "unknown", serial: serial ? "read" : "unknown", autograph: "unknown" },
  notes: "", model: "local-test", durationMs: 100, detectedText: `${name} ${serial}`,
});
const makeTracker = () => { let next = 0; return new CardSessionTracker(() => `track-${++next}`); };
const appearance = { visualFingerprint: "01abcdef12345678", pixels: [30, 70, 120, 200], quality: 30, presentation: 0 };

test("five moving views of the same numbered card produce one track", () => {
  const tracker = makeTracker();
  const hashes = ["01abcdef12345678", "01abcdef12345679", "01abcdef1234567a", "01abcdef1234567b", "01abcdef12345670"];
  const decisions = hashes.map((visualFingerprint, index) => tracker.observe({ ...appearance,
    visualFingerprint, pixels: [30 + index * 12, 70, 120, 200], reading: reading(), now: index * 1000 }));
  assert.equal(new Set(decisions.map(item => item.trackId)).size, 1);
  assert.deepEqual(decisions.map(item => item.seenCount), [1, 2, 3, 4, 5]);
  assert.equal(decisions[0].isRepeat, false);
  assert.ok(decisions.slice(1).every(item => item.isRepeat));
  assert.equal(decisions.filter(item => item.shouldPersist).length, 1, "complete unchanged fields need one proof");
});

test("same player and indistinguishable artwork cannot merge 22/50 with 23/50", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading(), now: 0 });
  const second = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", "23/50"), now: 1000 });
  assert.notEqual(first.trackId, second.trackId);
  assert.equal(second.seenCount, 1);
});

test("conflicting names split even when a near-identical card design has the same dHash", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading(), now: 0 });
  const second = tracker.observe({ ...appearance, reading: reading("Alycia Parks", "22/50"), now: 1000 });
  assert.notEqual(first.trackId, second.trackId);
});

test("an incomplete first view can acquire a name and then its serial in one track", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading("", ""), now: 0 });
  const name = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 1000 });
  const numbered = tracker.observe({ ...appearance, reading: reading(), now: 2000 });
  assert.equal(first.trackId, name.trackId);
  assert.equal(first.trackId, numbered.trackId);
  assert.equal(first.complete, false);
  assert.equal(name.complete, false);
  assert.equal(numbered.complete, true);
});

test("a witnessed absence keeps visually identical unnumbered copies separate", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 0 });
  const second = tracker.observe({ ...appearance, presentation: 1, reading: reading("Martina Trevisan", ""), now: 1000 });
  assert.notEqual(first.trackId, second.trackId);
});

test("same name is insufficient after a substantial appearance change", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 0 });
  const second = tracker.observe({ ...appearance, visualFingerprint: "fedcba9876543210",
    reading: reading("Martina Trevisan", ""), now: 1000 });
  assert.notEqual(first.trackId, second.trackId);
});

test("re-entry requires full numbered variant identity, never player and number alone", () => {
  const tracker = makeTracker();
  const initial = tracker.observe({ ...appearance, reading: reading(), now: 0 });
  const ambiguous = tracker.observe({ ...appearance, presentation: 1, reading: reading(), now: 1000 });
  assert.notEqual(initial.trackId, ambiguous.trackId);
  const identified = reading(); identified.suggestion.cardName = "Gold Refractor"; identified.suggestion.isAutographed = false;
  const first = tracker.observe({ ...appearance, presentation: 2, reading: identified, now: 2000 });
  const reentry = tracker.observe({ ...appearance, presentation: 3, reading: identified, now: 3000 });
  assert.equal(first.trackId, reentry.trackId);
  assert.equal(reentry.reason, "exact-numbered-card");
});

test("unchanged repeated views upload once, but a later serial is retained", () => {
  const tracker = makeTracker();
  for (let index = 0; index < 5; index++) {
    assert.equal(tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: index * 1000 }).shouldPersist, index === 0);
  }
  const unchanged = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 6000 });
  assert.equal(unchanged.shouldPersist, false);
  const improved = tracker.observe({ ...appearance, reading: reading(), now: 7000 });
  assert.equal(improved.trackId, unchanged.trackId);
  assert.equal(improved.shouldPersist, true);
});

test("a card held unchanged for more than twelve seconds retains its track", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading("", ""), now: 0 });
  const later = tracker.observe({ ...appearance, reading: reading("", ""), now: 90_000 });
  assert.equal(later.trackId, first.trackId);
  assert.equal(later.shouldPersist, false);
});

test("one transient unrelated view does not prevent reacquiring the same card", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading("", ""), now: 0 });
  const unrelated = tracker.observe({ ...appearance, visualFingerprint: "fedcba9876543210", reading: reading("", ""), now: 1000 });
  const returned = tracker.observe({ ...appearance, reading: reading("", ""), now: 2000 });
  assert.notEqual(unrelated.trackId, first.trackId);
  assert.equal(returned.trackId, first.trackId);
  assert.equal(returned.reason, "reacquired-card");
  assert.equal(returned.shouldPersist, false);
});

test("an unreadable view cannot reacquire one of two visually similar conflicting cards", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, visualFingerprint: "0000000000000001", reading: reading("Martina Trevisan", "22/50"), now: 0 });
  const second = tracker.observe({ ...appearance, visualFingerprint: "0000000000000003", reading: reading("Alycia Parks", "23/50"), now: 1000 });
  tracker.observe({ ...appearance, visualFingerprint: "ffffffffffffffff", reading: reading("", ""), now: 2000 });
  const unreadable = tracker.observe({ ...appearance, visualFingerprint: "0000000000000001", reading: reading("", ""), now: 3000 });
  assert.notEqual(unreadable.trackId, first.trackId);
  assert.notEqual(unreadable.trackId, second.trackId);
});

test("incomplete cards keep at most two complementary views without new field evidence", () => {
  const tracker = makeTracker();
  const hashes = ["0000000000000000", "000000000000000f", "00000000000000f0", "0000000000000f00"];
  const decisions = hashes.map((visualFingerprint, index) => tracker.observe({ ...appearance, visualFingerprint,
    reading: reading("", ""), now: index * 1000 }));
  assert.equal(new Set(decisions.map(item => item.trackId)).size, 1);
  assert.deepEqual(decisions.map(item => item.shouldPersist), [true, true, true, false]);
});

test("a safely associated localized view upgrades an initially missing card fingerprint", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, visualFingerprint: undefined, reading: reading("", ""), now: 0 });
  const localized = tracker.observe({ ...appearance, reading: reading("", ""), now: 1000 });
  const moved = tracker.observe({ ...appearance, pixels: [80, 110, 150, 210], reading: reading("", ""), now: 2000 });
  assert.equal(first.trackId, localized.trackId);
  assert.equal(first.trackId, moved.trackId, "localized artwork now supports movement within the same presentation");
});

test("Different card clears weak identity and no fingerprint means no invented match", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 0 });
  tracker.forceNew();
  const second = tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 1000 });
  assert.notEqual(first.trackId, second.trackId);
  const unavailable = tracker.observe({ reading: reading("Martina Trevisan", ""), now: 2000 });
  assert.notEqual(second.trackId, unavailable.trackId);
});

test("fingerprint comparisons reject malformed hashes and count all 64 bits", () => {
  assert.equal(cardFingerprintDistance("0000000000000000", "ffffffffffffffff"), 64);
  assert.equal(cardFingerprintDistance("01abcdef12345678", "01ABCDEF12345679"), 1);
  assert.equal(cardFingerprintDistance("", ""), Infinity);
});

test("an old in-flight read cannot move the active presentation backwards", () => {
  const tracker = makeTracker();
  tracker.observe({ ...appearance, reading: reading("Martina Trevisan", ""), now: 0 });
  tracker.reset(2);
  const current = tracker.observe({ ...appearance, presentation: 2, reading: reading("Alycia Parks", ""), now: 1000 });
  const old = tracker.observe({ ...appearance, presentation: 0, reading: reading("Martina Trevisan", ""), now: 1200 });
  const repeated = tracker.observe({ ...appearance, presentation: 2, reading: reading("Alycia Parks", ""), now: 2000 });
  assert.equal(current.trackId, repeated.trackId);
  assert.notEqual(old.trackId, current.trackId);
});

test("a later supported color or checklist number is retained once without opening another card", () => {
  const tracker = makeTracker();
  const first = tracker.observe({ ...appearance, reading: reading(), now: 0 });
  const lowSupport = { ...reading(), color: { label: "red" as const, support: .4, reason: "weak" } };
  assert.equal(tracker.observe({ ...appearance, reading: lowSupport, now: 1000 }).shouldPersist, false);
  const colored = { ...reading(), color: { label: "red" as const, support: .8, reason: "localized foil" } };
  const color = tracker.observe({ ...appearance, reading: colored, now: 2000 });
  assert.equal(color.trackId, first.trackId);
  assert.equal(color.shouldPersist, true);
  const changedColor = { ...colored, color: { ...colored.color, label: "orange" as const } };
  assert.equal(tracker.observe({ ...appearance, reading: changedColor, now: 3000 }).shouldPersist, false, "color changes alone are not an endless upload trigger");
  const numbered = { ...colored, suggestion: { ...colored.suggestion, cardNumber: "57" } };
  const number = tracker.observe({ ...appearance, reading: numbered, now: 4000 });
  assert.equal(number.trackId, first.trackId);
  assert.equal(number.shouldPersist, true);
  assert.equal(tracker.observe({ ...appearance, reading: numbered, now: 5000 }).shouldPersist, false);
  const conflicting = { ...numbered, suggestion: { ...numbered.suggestion, limitation: "23/50" } };
  assert.notEqual(tracker.observe({ ...appearance, reading: conflicting, now: 6000 }).trackId, first.trackId);
});

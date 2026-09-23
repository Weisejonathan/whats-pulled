import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildFrameEvidence, exactCardIdentity } from "../lib/detector/grouping";
import type { CardEvidence, CardMatch } from "../lib/detector/matching";

const candidate = (cardId = randomUUID()): CardMatch => ({ cardId, playerName: "Test Player", cardName: "Gold Autograph", parallel: "Gold", cardNumber: 7,
  cardUrl: "/cards/test", imageUrl: null, serialNumber: "/50", setName: "Test Set", score: 1, autoEligible: true, evidence: [], conflicts: [], missing: [] });

test("identity requires a complete serial and one compatible catalog variant", () => {
  const match = candidate();
  assert.equal(exactCardIdentity({ playerName: "Test Player", limitation: "22/50" }, [match]), `${match.cardId}:22/50`);
  assert.equal(exactCardIdentity({ playerName: "Test Player", limitation: "/50" }, [match]), null);
  assert.equal(exactCardIdentity({ playerName: "Test Player", limitation: "22/50" }, [match, candidate()]), null);
  assert.equal(exactCardIdentity({ limitation: "22/50" }, [match]), null);
  assert.equal(exactCardIdentity({ playerName: "Test Player", limitation: "22/50" }, [{ ...match, conflicts: ["Autograph"] }]), null);
});

test("field proof retains its original image and rejects invalid coordinates", () => {
  const good = { text: "22/50", score: .9, box: { x: .1, y: .2, width: .2, height: .1 } };
  const result = buildFrameEvidence({ id: randomUUID(), frameQuality: 45, proofImage: { width: 600, height: 840 }, proof: { name: [], serial: [good, { ...good, box: { ...good.box, x: 4 } }] },
    color: { label: "yellow/gold", support: .8, reason: "card border" }, visualFingerprint: "0123456789abcdef" },
  { playerName: "Test Player", limitation: "22/50", isAutographed: false }, { imageUrl: "proof.webp", thumbnailUrl: "thumb.webp" }, "2026-09-23T10:00:00Z");
  assert.equal(result.evidence.serial?.imageUrl, "proof.webp");
  assert.deepEqual(result.evidence.serial?.proof, [good]);
  assert.deepEqual(result.evidence.serial?.proofImage, { width: 600, height: 840 });
  assert.equal(result.evidence.autograph?.value, false);
  assert.equal(result.color?.label, "yellow/gold");
});

test("PostgreSQL grouping: five frames, one card; conflicts, ownership, retries and approvals remain isolated", async () => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("drizzle")).filter(name => /^000[0-356]_.*\.sql$/.test(name)).sort()) await db.exec(await readFile("drizzle/" + file, "utf8"));
    await db.exec("alter table cards add column if not exists print_run integer; alter table cards add column if not exists image_url text");
    await db.exec(await readFile("drizzle/0007_detector_reliability.sql", "utf8"));
    await db.exec(await readFile("drizzle/0010_detector_card_groups.sql", "utf8"));
    await db.exec(await readFile("drizzle/0010_detector_card_groups.sql", "utf8"));
    const setId = randomUUID(), cardId = randomUUID(), sessionId = randomUUID(), trackId = randomUUID();
    await db.query("insert into sets(id,name,slug,brand,year,sport) values($1,'Test Set','group-test','Test',2025,'Tennis')", [setId]);
    await db.query("insert into cards(id,set_id,player_name,slug,card_name,parallel,serial_number,print_run) values($1,$2,'Test Player','group-card','Gold Autograph','Gold','/50',50)", [cardId, setId]);
    const match = { ...candidate(cardId), setId };
    type Options = { id?: string; owner?: string; session?: string; track?: string; quality?: number; image?: string; matches?: CardMatch[]; nameSource?: string };
    async function ingest(suggestion: CardEvidence, options: Options = {}) {
      const id = options.id || randomUUID(), owner = options.owner || "owner-a", capturedAt = "2026-09-23T10:00:00Z";
      const images = { imageUrl: options.image || `${id}.webp`, thumbnailUrl: `${id}-thumb.webp` };
      const full = { setId, setName: "Test Set", ...suggestion };
      const matches = options.matches ?? [match];
      const frame = buildFrameEvidence({ id, frameQuality: options.quality || 0 }, full, images, capturedAt);
      const payload = { ownerKey: owner, suggestion: full, originalSuggestion: full, originalMatches: matches, matches, detectedText: "", notes: "", nameSource: options.nameSource || "read", evidence: frame.evidence };
      const row = await db.query<{ id: string }>("select ingest_detector_frame($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as id", [
        id, owner, options.session || sessionId, options.track || trackId, images.imageUrl, images.thumbnailUrl, capturedAt, JSON.stringify(payload), null, frame.quality, exactCardIdentity(full, matches),
      ]);
      return { id, canonical: row.rows[0].id, image: images.imageUrl };
    }
    async function read(id: string) {
      return (await db.query<{ id: string; revision: number; status: string; image_url: string; payload: any }>("select * from detector_observations where id=$1", [id])).rows[0];
    }
    const first = await ingest({ playerName: "Test Player", limitation: "/50" }, { quality: 10 });
    const repeats = [];
    for (let n = 0; n < 4; n++) repeats.push(await ingest({ playerName: "Test Player", limitation: "22/50" }, { quality: 20 + n }));
    assert.ok(repeats.every(frame => frame.canonical === first.canonical));
    let group = await read(first.canonical);
    assert.equal(group.payload.group.seenCount, 5);
    assert.equal(group.payload.suggestion.limitation, "22/50");
    assert.equal(group.payload.originalSuggestion.limitation, "/50");
    assert.equal(group.image_url, repeats[3].image);
    assert.equal(group.payload.evidence.serial.imageUrl, repeats[3].image);
    await ingest({ playerName: "Test Player", limitation: "22/50" }, { id: repeats[3].id });
    assert.equal((await read(first.canonical)).payload.group.seenCount, 5, "retry is not another sighting");
    const differentCopy = await ingest({ playerName: "Test Player", limitation: "23/50" });
    assert.notEqual(differentCopy.canonical, first.canonical, "different serials split even inside the same track");
    const differentPlayer = await ingest({ playerName: "Another Player", limitation: "22/50" }, { matches: [] });
    assert.notEqual(differentPlayer.canonical, first.canonical, "conflicting names cannot silently merge");
    const unknown = await ingest({}, { matches: [] });
    assert.notEqual(unknown.canonical, first.canonical, "an unreadable frame cannot choose among conflicting tracked cards");
    const otherOwner = await ingest({ playerName: "Test Player", limitation: "22/50" }, { owner: "owner-b" });
    assert.notEqual(otherOwner.canonical, first.canonical);
    await assert.rejects(ingest({ playerName: "Test Player" }, { id: first.id, owner: "owner-b" }), /unavailable/);
    const rediscovered = await ingest({ playerName: "Test Player", limitation: "22/50" }, { session: randomUUID(), track: randomUUID() });
    assert.equal(rediscovered.canonical, first.canonical, "full identity survives a new capture session");
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => ingest({ playerName: "Test Player", limitation: "22/50" }, { track: randomUUID() })));
    assert.ok(concurrent.every(frame => frame.canonical === first.canonical));
    assert.equal((await read(first.canonical)).payload.group.seenCount, 11);
    // Once selected, later sightings cannot overwrite what the operator is approving.
    await db.query("update detector_observations set selected_card_id=$2 where id=$1", [first.canonical, cardId]);
    group = await read(first.canonical);
    await db.query("select approve_detector_observation($1,$2,'Test Breaker')", [first.canonical, group.revision]);
    const approved = await read(first.canonical);
    await ingest({ playerName: "Test Player", limitation: "22/50", isAutographed: true }, { quality: 100 });
    const after = await read(first.canonical);
    assert.equal(after.status, "approved");
    assert.equal(after.image_url, approved.image_url);
    assert.deepEqual(after.payload.suggestion, approved.payload.suggestion);
    assert.equal(after.revision, approved.revision);
    await db.query("select approve_detector_observation($1,$2,'Test Breaker')", [first.canonical, approved.revision]);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from pull_reports")).rows[0].count, 1);
    const legacy = randomUUID();
    await db.query("insert into detector_observations(id,image_url,thumbnail_url,captured_at,payload) values($1,'legacy.webp','legacy-thumb.webp',now(),$2)", [legacy, JSON.stringify({ ownerKey: "legacy-owner", suggestion: { playerName: "Test Player", limitation: "21/50" }, matches: [match] })]);
    const oldCard = await ingest({ playerName: "Test Player", limitation: "21/50" }, { owner: "legacy-owner" });
    assert.equal(oldCard.canonical, legacy, "a full identity can reuse an existing historical review card");
    assert.equal((await read(legacy)).payload.group.seenCount, 2);

    const proofFirst = await ingest({ playerName: "Test Player", limitation: "20/50" }, { owner: "proof-owner", quality: 20 });
    const betterPhoto = await ingest({ playerName: "Test Player" }, { owner: "proof-owner", quality: 100 });
    const proofGroup = await read(proofFirst.canonical);
    assert.equal(proofGroup.image_url, betterPhoto.image);
    assert.equal(proofGroup.payload.evidence.serial.imageUrl, proofFirst.image, "serial proof keeps its own image when another frame becomes the cover");

    const manualFirst = await ingest({ playerName: "Test Player", limitation: "19/50" }, { owner: "manual-owner", nameSource: "manual" });
    const manualBefore = await read(manualFirst.canonical);
    await ingest({ playerName: "Test Player", limitation: "19/50", isAutographed: true }, { owner: "manual-owner", quality: 100 });
    const manualAfter = await read(manualFirst.canonical);
    assert.deepEqual(manualAfter.payload.suggestion, manualBefore.payload.suggestion);
    assert.equal(manualAfter.image_url, manualBefore.image_url);
    assert.equal(manualAfter.revision, manualBefore.revision);

    // An old duplicate can be explicitly folded into an approved card without a second pull.
    const duplicateLegacy = randomUUID();
    await db.query("insert into detector_observations(id,selected_card_id,image_url,thumbnail_url,captured_at,payload) values($1,$2,'duplicate.webp','duplicate-thumb.webp',now(),$3)", [duplicateLegacy, cardId,
      JSON.stringify({ ownerKey: "owner-a", suggestion: { playerName: "Test Player", limitation: "22/50" }, matches: [match] })]);
    const beforeMerge = await read(first.canonical);
    await db.query("select merge_detector_observations($1,1,$2,$3)", [duplicateLegacy, first.canonical, beforeMerge.revision]);
    const mergedTarget = await read(first.canonical), mergedSource = await read(duplicateLegacy);
    assert.equal(mergedSource.payload.mergedIntoId, first.canonical);
    assert.deepEqual(mergedTarget.payload.suggestion, beforeMerge.payload.suggestion);
    assert.equal(mergedTarget.image_url, beforeMerge.image_url);
    assert.equal(mergedTarget.payload.group.seenCount, beforeMerge.payload.group.seenCount + 1);
    await db.query("select merge_detector_observations($1,1,$2,$3)", [duplicateLegacy, first.canonical, beforeMerge.revision]);
    assert.equal((await read(first.canonical)).payload.group.seenCount, mergedTarget.payload.group.seenCount, "retrying a merge is idempotent");
    await assert.rejects(db.query("select approve_detector_observation($1,$2,'Test Breaker')", [duplicateLegacy, mergedSource.revision]), /Select a catalog card/);
    await assert.rejects(db.query("select merge_detector_observations($1,1,$2,$3)", [differentCopy.canonical, first.canonical, mergedTarget.revision]), /Conflicting/);
    await assert.rejects(db.query("select merge_detector_observations($1,1,$2,$3)", [otherOwner.canonical, first.canonical, mergedTarget.revision]), /different browsers/);

    const pendingA = await ingest({ playerName: "Test Player" }, { owner: "merge-owner", track: randomUUID() });
    const pendingB = await ingest({ playerName: "Test Player", limitation: "18/50" }, { owner: "merge-owner", track: randomUUID() });
    assert.notEqual(pendingA.canonical, pendingB.canonical);
    await db.query("select merge_detector_observations($1,1,$2,1)", [pendingB.canonical, pendingA.canonical]);
    const pendingMerged = await read(pendingA.canonical);
    assert.equal(pendingMerged.payload.suggestion.limitation, "18/50");
    assert.equal(pendingMerged.payload.evidence.serial.imageUrl, pendingB.image);
    assert.equal(pendingMerged.payload.group.seenCount, 2);
    const replay = await ingest({ playerName: "Test Player", limitation: "18/50" }, { id: pendingB.id, owner: "merge-owner" });
    assert.equal(replay.canonical, pendingA.canonical, "persisted frame mapping follows an explicit merge");
    assert.equal((await read(pendingA.canonical)).payload.group.seenCount, 2);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from pull_reports")).rows[0].count, 1);
  } finally { await db.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("exact image ingestion combines repeated and historical screenshots without mixing distinct copies", async () => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("drizzle")).filter(name => /^000[0-356]_.*\.sql$/.test(name)).sort()) await db.exec(await readFile("drizzle/" + file, "utf8"));
    await db.exec("alter table cards add column if not exists print_run integer; alter table cards add column if not exists image_url text");
    for (const file of ["0007_detector_reliability.sql", "0010_detector_card_groups.sql", "0011_detector_exact_images.sql", "0011_detector_exact_images.sql"]) await db.exec(await readFile("drizzle/" + file, "utf8"));
    const setId = randomUUID(), cardId = randomUUID();
    await db.query("insert into sets(id,name,slug,brand,year,sport) values($1,'Test Set','exact-test','Test',2025,'Tennis')", [setId]);
    await db.query("insert into cards(id,set_id,player_name,slug,card_name,parallel,serial_number,print_run) values($1,$2,'Test Player','exact-card','Gold Autograph','Gold','/50',50)", [cardId, setId]);
    const hash = "a".repeat(64);
    async function ingest(options: { id?: string; owner?: string; hash?: string; name?: string; serial?: string; quality?: number; color?: { label: string; support: number; reason: string } } = {}) {
      const id = options.id || randomUUID(), imageHash = options.hash || hash, owner = options.owner || "owner-a";
      const image = `https://r2.example.com/random/${randomUUID()}.webp`;
      const suggestion = { setId, setName: "Test Set", playerName: options.name || "Test Player", limitation: options.serial || "22/50" };
      const payload = { ownerKey: owner, serverImageHash: imageHash, suggestion, originalSuggestion: suggestion, matches: [], detectedText: "", notes: "", nameSource: "read", color: options.color };
      const result = await db.query<{ id: string }>("select ingest_detector_frame_exact($1,$2,$3,$4,$5,$6,now(),$7,null,$8,null,$9) as id", [
        id, owner, randomUUID(), randomUUID(), image, image, JSON.stringify(payload), options.quality || 0, imageHash,
      ]);
      return { id, canonical: result.rows[0].id, image };
    }
    async function read(id: string) { return (await db.query<{ id: string; revision: number; status: string; image_url: string; payload: any }>("select * from detector_observations where id=$1", [id])).rows[0]; }
    const first = await ingest();
    const second = await ingest({ quality: 20 });
    const third = await ingest({ name: "Wrong OCR Name" });
    const fourth = await ingest({ serial: "23/50" });
    assert.ok([second, third, fourth].every(frame => frame.canonical === first.canonical), "same image hash wins over URL, session, track and inconsistent OCR");
    let group = await read(first.canonical);
    assert.equal(group.payload.group.seenCount, 4);
    assert.equal(group.payload.suggestion.playerName, "Test Player");
    assert.equal(group.payload.suggestion.limitation, "22/50");
    assert.equal(group.payload.duplicateConflict.needsReview, true);
    assert.deepEqual([...group.payload.duplicateConflict.fields].sort(), ["name", "serial"]);
    assert.equal((await db.query<{ payload: any }>("select payload from detector_observation_frames where id=$1", [third.id])).rows[0].payload.suggestion.playerName, "Wrong OCR Name", "raw conflicting OCR remains inspectable");
    await ingest({ id: fourth.id, serial: "23/50" });
    assert.equal((await read(first.canonical)).payload.group.seenCount, 4);
    const different = await ingest({ hash: "b".repeat(64), serial: "23/50" });
    assert.notEqual(different.canonical, first.canonical, "different image with a different copy remains distinct");
    const otherOwner = await ingest({ owner: "owner-b" });
    assert.notEqual(otherOwner.canonical, first.canonical);
    await assert.rejects(ingest({ id: first.id, owner: "owner-b" }), /unavailable/);
    await db.query("update detector_observations set selected_card_id=$2 where id=$1", [first.canonical, cardId]);
    await assert.rejects(db.query("select approve_detector_observation($1,$2,'Test')", [first.canonical, group.revision]), /manual review/);
    // Equivalent to a successful manual correction: fields are now protected.
    await db.query("update detector_observations set payload=jsonb_set(payload,'{duplicateConflict,needsReview}','false') || '{\"nameSource\":\"manual\"}'::jsonb where id=$1", [first.canonical]);
    group = await read(first.canonical);
    await db.query("select approve_detector_observation($1,$2,'Test')", [first.canonical, group.revision]);
    const approved = await read(first.canonical);
    await ingest({ name: "Wrong Again", serial: "24/50", quality: 100 });
    const protectedCard = await read(first.canonical);
    assert.equal(protectedCard.status, "approved");
    assert.equal(protectedCard.revision, approved.revision);
    assert.equal(protectedCard.image_url, approved.image_url);
    assert.deepEqual(protectedCard.payload.suggestion, approved.payload.suggestion);
    assert.equal(protectedCard.payload.duplicateConflict.needsReview, false);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer count from pull_reports")).rows[0].count, 1);

    const legacyHash = "c".repeat(64), legacyIds: string[] = [];
    for (let n = 0; n < 4; n++) {
      const id = randomUUID(); legacyIds.push(id);
      const payload = { ownerKey: "legacy-owner", suggestion: { setId, playerName: n === 3 ? "OCR Mistake" : "Test Player", limitation: n === 2 ? "23/50" : "22/50" }, matches: [] };
      await db.query("insert into detector_observations(id,image_url,thumbnail_url,captured_at,payload) values($1,$2,$2,now(),$3)", [id, `https://store.public.blob.vercel-storage.com/detector/${legacyHash}.webp`, JSON.stringify(payload)]);
    }
    const repaired = await ingest({ owner: "legacy-owner", hash: legacyHash });
    assert.ok(legacyIds.includes(repaired.canonical), "reuse an existing historical card");
    assert.equal((await read(repaired.canonical)).payload.group.seenCount, 5);
    const rows = (await db.query<{ id: string; payload: any }>("select id,payload from detector_observations where payload->>'ownerKey'='legacy-owner'")).rows;
    assert.equal(rows.filter(row => !row.payload.mergedIntoId).length, 1);
    assert.equal(rows.filter(row => row.payload.mergedIntoId === repaired.canonical).length, 3);
    assert.equal((await read(repaired.canonical)).payload.duplicateConflict.needsReview, true);
    const again = await ingest({ owner: "legacy-owner", hash: legacyHash });
    assert.equal(again.canonical, repaired.canonical);
    assert.equal((await read(repaired.canonical)).payload.group.seenCount, 6);
    const simultaneous = await Promise.all(Array.from({ length: 5 }, () => ingest({ owner: "concurrent-owner", hash: "d".repeat(64) })));
    assert.equal(new Set(simultaneous.map(frame => frame.canonical)).size, 1);
    assert.equal((await read(simultaneous[0].canonical)).payload.group.seenCount, 5);

    // A group's unresolved evidence must not disappear when a sharper cover wins.
    const clean = await ingest({ owner: "flag-merge", hash: "e".repeat(64), quality: 30 });
    const flagged = await ingest({ owner: "flag-merge", hash: "f".repeat(64), quality: 0 });
    await ingest({ owner: "flag-merge", hash: "f".repeat(64), serial: "23/50" });
    await db.query("select merge_detector_observations($1,$2,$3,$4)", [flagged.canonical, (await read(flagged.canonical)).revision, clean.canonical, (await read(clean.canonical)).revision]);
    const mergedConflict = await read(clean.canonical);
    assert.equal(mergedConflict.image_url, clean.image);
    assert.equal(mergedConflict.payload.duplicateConflict.needsReview, true);
    assert.ok(mergedConflict.payload.duplicateConflict.fields.includes("serial"));
    await db.query("update detector_observations set selected_card_id=$2 where id=$1", [clean.canonical, cardId]);
    await assert.rejects(db.query("select approve_detector_observation($1,$2,'Test')", [clean.canonical, mergedConflict.revision]), /manual review/);

    // The same invariant applies when an incoming image automatically repairs old rows.
    const repairHash = "1".repeat(64), oldCleanId = randomUUID();
    const flaggedRepair = await ingest({ owner: "flag-repair", hash: repairHash });
    await ingest({ owner: "flag-repair", hash: repairHash, serial: "23/50" });
    const oldCleanPayload = { ownerKey: "flag-repair", nameSource: "read", serverImageHash: repairHash, suggestion: { setId, playerName: "Test Player", limitation: "22/50" }, matches: [],
      group: { seenCount: 1, firstSeenAt: "2026-09-20T00:00:00Z", lastSeenAt: "2026-09-20T00:00:00Z", bestFrameId: oldCleanId, bestQuality: 30 } };
    await db.query("insert into detector_observations(id,image_url,thumbnail_url,captured_at,created_at,payload) values($1,'clean-cover.webp','clean-thumb.webp','2026-09-20','2026-09-20',$2)", [oldCleanId, JSON.stringify(oldCleanPayload)]);
    const automaticallyRepaired = await ingest({ owner: "flag-repair", hash: repairHash });
    assert.equal(automaticallyRepaired.canonical, oldCleanId);
    assert.equal((await read(flaggedRepair.canonical)).payload.mergedIntoId, oldCleanId);
    const repairedConflict = await read(oldCleanId);
    assert.equal(repairedConflict.image_url, "clean-cover.webp");
    assert.equal(repairedConflict.payload.duplicateConflict.needsReview, true);
    await db.query("update detector_observations set selected_card_id=$2 where id=$1", [oldCleanId, cardId]);
    await assert.rejects(db.query("select approve_detector_observation($1,$2,'Test')", [oldCleanId, repairedConflict.revision]), /manual review/);

    // New color information keeps its source image without degrading the cover.
    const colorFirst = await ingest({ owner: "color-owner", hash: "2".repeat(64), quality: 30 });
    const colorLater = await ingest({ owner: "color-owner", hash: "2".repeat(64), quality: 2,
      color: { label: "blue", support: .8, reason: "Visible border pixels" } });
    const colored = await read(colorFirst.canonical);
    assert.equal(colored.image_url, colorFirst.image);
    assert.equal(colored.payload.group.bestQuality, 30);
    assert.equal(colored.payload.color.label, "blue");
    assert.equal(colored.payload.evidence.color.imageUrl, colorLater.image);
    assert.equal(colored.payload.evidence.color.frameId, colorLater.id);
    assert.equal(colored.payload.evidence.color.source, "visual");
  } finally { await db.close(); }
});

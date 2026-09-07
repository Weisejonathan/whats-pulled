import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("real PostgreSQL migration: atomic approval, duplicate protection, revisions and reversible withdrawal", async () => {
  const db = new PGlite();
  try {
    // The legacy bid migration assumes a table created outside the checked-in history.
    // It is unrelated to detection; exercise the actual detector tables and migration.
    for (const file of (await readdir("drizzle")).filter(name => name.endsWith(".sql") && !name.startsWith("0004_") && !name.startsWith("0007_")).sort()) await db.exec(await readFile("drizzle/" + file, "utf8"));
    await db.exec("alter table cards add column if not exists print_run integer");
    await db.exec("alter table cards add column if not exists image_url text");
    await db.exec(await readFile("drizzle/0007_detector_reliability.sql", "utf8"));
    const setId = randomUUID(), cardId = randomUUID();
    await db.query("insert into sets(id,name,slug,brand,year,sport) values($1,'Test Set','detector-test','Test',2025,'Tennis')", [setId]);
    await db.query("insert into cards(id,set_id,player_name,slug,card_name,parallel,serial_number,print_run,image_url) values($1,$2,'Test Player','detector-test-gold','Gold Refractor','Gold Refractor','/99',99,'catalog-original.jpg')", [cardId, setId]);
    async function observation(serial: string, selected: string | null = cardId) {
      const id = randomUUID();
      await db.query("insert into detector_observations(id,selected_card_id,image_url,thumbnail_url,captured_at,payload) values($1,$2,'proof.webp','thumb.webp',now(),$3)", [id, selected, JSON.stringify({ suggestion: { limitation: serial } })]);
      return id;
    }
    for (const invalid of ["18/25", "0/99", "100/99", "/99"]) {
      const id = await observation(invalid);
      await assert.rejects(db.query("select approve_detector_observation($1,1,'Test Breaker')", [id]));
    }
    const unselected = await observation("18/99", null);
    await assert.rejects(db.query("select approve_detector_observation($1,1,'Test Breaker')", [unselected]));
    const id = await observation("18/99");
    await assert.rejects(db.query("select approve_detector_observation($1,0,'Test Breaker')", [id]));
    await db.query("select approve_detector_observation($1,1,'Test Breaker')", [id]);
    await db.query("select approve_detector_observation($1,1,'Test Breaker')", [id]);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from pull_reports")).rows[0].count, 1);
    assert.equal((await db.query<{ image_url: string }>("select image_url from cards where id=$1", [cardId])).rows[0].image_url, "catalog-original.jpg");
    const duplicate = await observation("18/99");
    await assert.rejects(db.query("select approve_detector_observation($1,1,'Test Breaker')", [duplicate]));
    const pending = (await db.query<{ status: string }>("select status from detector_observations where id=$1", [duplicate])).rows[0];
    assert.equal(pending.status, "pending");
    await db.query("select retract_detector_observation($1,2)", [id]);
    await db.query("select retract_detector_observation($1,2)", [id]);
    assert.equal((await db.query<{ verification_status: string }>("select verification_status from pull_reports")).rows[0].verification_status, "rejected");
    assert.equal((await db.query<{ status: string }>("select status from cards where id=$1", [cardId])).rows[0].status, "open");
    assert.equal((await db.query<{ image_url: string }>("select image_url from detector_observations where id=$1", [id])).rows[0].image_url, "proof.webp");
    await db.query("select approve_detector_observation($1,1,'Test Breaker')", [duplicate]);
  } finally { await db.close(); }
});

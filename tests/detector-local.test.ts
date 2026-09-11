import test from "node:test";
import assert from "node:assert/strict";
import { readLocalEvidence } from "../lib/detector/local-evidence";
import { LiveOcr, type LiveWorker } from "../lib/detector/live-ocr";

const players = ["Amanda Anisimova", "Flavio Cobolli", "Carlos Alcaraz"];

test("local evidence reads printed full names and individual serials, not autograph claims", () => {
  const result = readLocalEvidence("AMANDA\nANISIMOVA\n1 / 5\nTOPPS CERTIFIED AUTOGRAPH ISSUE", players, 90);
  assert.equal(result.suggestion.playerName, "Amanda Anisimova");
  assert.equal(result.suggestion.limitation, "1/5");
  assert.equal(result.suggestion.isAutographed, null);
  assert.match(result.notes, /signature itself still needs/);
  assert.equal(readLocalEvidence("FLAVIO COBOLLI 37/50", players, 90).suggestion.limitation, "37/50");
});

test("conflicting players, serials and low-quality text remain unknown independently", () => {
  const result = readLocalEvidence("Amanda Anisimova Flavio Cobolli 37/50", players, 90);
  assert.equal(result.suggestion.playerName, "");
  assert.equal(result.suggestion.limitation, "37/50");
  assert.equal(readLocalEvidence("Amanda Anisimova 1/5 2/5", players, 90).suggestion.limitation, "");
  assert.equal(readLocalEvidence("Amanda Anisimova 1/5", players, 30).suggestion.playerName, "");
  for (const invalid of ["0/5", "6/5", "123456/50", "/50", "37/0"]) {
    assert.equal(readLocalEvidence(invalid, players, 90).suggestion.limitation, "", invalid);
  }
  assert.equal(readLocalEvidence("Anisimova", players, 90).suggestion.playerName, "");
  assert.equal(readLocalEvidence("Amanda Anisimova", players, 90).suggestion.isAutographed, null);
});

test("a warmed reader reuses its worker and refuses overlapping frames", async () => {
  let created = 0;
  let resolve!: (value: { data: { text: string; confidence: number } }) => void;
  const reader = new LiveOcr(async () => {
    created++;
    return { recognize: () => new Promise(done => { resolve = done; }), terminate: async () => undefined };
  });
  await Promise.all([reader.warm(), reader.warm()]);
  const first = reader.read("frame");
  await assert.rejects(reader.read("stale frame"), /busy/);
  resolve({ data: { text: "37/50", confidence: 90 } });
  assert.equal((await first).data.text, "37/50");
  assert.equal(created, 1);
});

test("deadline terminates actual work and the next frame gets a fresh reader", async () => {
  let created = 0, terminated = 0;
  const reader = new LiveOcr(async (): Promise<LiveWorker> => {
    created++;
    return {
      recognize: created === 1 ? () => new Promise(() => undefined) : async () => ({ data: { text: "1/5", confidence: 99 } }),
      terminate: async () => { terminated++; },
    };
  }, 20);
  await assert.rejects(reader.read("first"), /time budget/);
  assert.equal(terminated, 1);
  assert.equal((await reader.read("new card")).data.text, "1/5");
  assert.equal(created, 2);
});

test("failed initialization can be retried", async () => {
  let created = 0;
  const reader = new LiveOcr(async () => {
    if (++created === 1) throw new Error("offline");
    return { recognize: async () => ({ data: { text: "ready", confidence: 90 } }), terminate: async () => undefined };
  });
  await assert.rejects(reader.warm(), /offline/);
  assert.equal((await reader.read("frame")).data.text, "ready");
});

test("disposing during initialization rejects immediately and terminates a late factory result", async () => {
  let created!: (worker: LiveWorker) => void, terminated = 0;
  const reader = new LiveOcr(() => new Promise<LiveWorker>(resolve => { created = resolve; }));
  const warming = reader.warm();
  await Promise.resolve();
  reader.dispose();
  await assert.rejects(warming, /stopped/);
  created({ recognize: async () => ({ data: { text: "", confidence: 0 } }), terminate: async () => { terminated++; } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(terminated, 1);
});

test("disposing an active reader rejects the caller even if a worker never responds", async () => {
  let terminated = 0;
  const reader = new LiveOcr(() => ({ recognize: () => new Promise(() => undefined), terminate: async () => { terminated++; } }));
  await reader.warm();
  const reading = reader.read("frame");
  reader.dispose();
  await assert.rejects(reading, /stopped/);
  assert.equal(terminated, 1);
});

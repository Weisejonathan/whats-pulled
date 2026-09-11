import test from "node:test";
import assert from "node:assert/strict";
import { cacheCatalog, cachedCatalog } from "../lib/detector/catalog-cache";

test("public catalogs survive offline reloads and stay isolated by selected set", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const catalog = { sets: [{ id: "11111111-1111-4111-8111-111111111111", name: "Tennis", year: 2025 }], players: ["Amanda Anisimova"] };
  cacheCatalog(catalog, "one", storage);
  assert.deepEqual(cachedCatalog("one", storage), catalog);
  assert.equal(cachedCatalog("two", storage), null);
  const key = [...data.keys()][0];
  data.set(key, JSON.stringify({ ...catalog, savedAt: Date.now() - 8 * 86_400_000 }));
  assert.equal(cachedCatalog("one", storage), null);
});

test("corrupt or blocked catalog storage cannot crash the detector", () => {
  for (const value of ["invalid", "null", JSON.stringify({ savedAt: Date.now(), sets: [null], players: [] }), JSON.stringify({ savedAt: Date.now(), sets: [], players: [1] })]) {
    assert.equal(cachedCatalog("", { getItem: () => value }), null);
  }
  assert.doesNotThrow(() => cacheCatalog({ sets: [], players: [] }, "", { setItem: () => { throw new Error("blocked"); } }));
});

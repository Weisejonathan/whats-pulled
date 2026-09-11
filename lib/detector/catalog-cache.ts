import { isUuid, type DetectorSet } from "./types";

export type CachedCatalog = { sets: DetectorSet[]; players: string[] };
const key = (setId: string) => `whatspulled-catalog-v1:${setId || "sets"}`;

export function cacheCatalog(catalog: CachedCatalog, setId = "", storage?: Pick<Storage, "setItem">) {
  try { (storage ?? window.localStorage).setItem(key(setId), JSON.stringify({ ...catalog, savedAt: Date.now() })); }
  catch { /* Public catalog caching is optional; recovery frames use IndexedDB. */ }
}

export function cachedCatalog(setId = "", storage?: Pick<Storage, "getItem">): CachedCatalog | null {
  try {
    const value = JSON.parse((storage ?? window.localStorage).getItem(key(setId)) ?? "null");
    if (!value || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > 7 * 86_400_000 || value.savedAt > Date.now() + 60_000) return null;
    if (!Array.isArray(value.sets) || !Array.isArray(value.players) || value.sets.length > 1000 || value.players.length > 20_000) return null;
    if (!value.sets.every((set: DetectorSet) => set && isUuid(set.id) && typeof set.name === "string" && set.name.length < 200 && Number.isInteger(set.year))) return null;
    if (!value.players.every((player: unknown) => typeof player === "string" && player.length < 160)) return null;
    return { sets: value.sets, players: value.players };
  } catch { return null; }
}

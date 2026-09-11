import { storeImageDataUrl, storeVideoDataUrl } from "./media";
import { putR2Media, type MediaVisibility } from "./r2";

export function isLegacyMedia(value: unknown, blobHosts: Set<string>): value is string {
  if (typeof value !== "string") return false;
  if (/^data:(image|video)\//.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && blobHosts.has(url.hostname); } catch { return false; }
}

/** Restrict remote migration to explicitly configured, public Vercel Blob hosts. */
export function parseBlobHosts(value = "") {
  const hosts = value.split(",").map((host) => host.trim()).filter(Boolean);
  if (hosts.some((host) => !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(host))) {
    throw new Error("LEGACY_BLOB_HOSTS must contain exact public Vercel Blob hostnames.");
  }
  return new Set(hosts);
}

export async function rewriteMedia(value: unknown, replace: (url: string) => Promise<string>, hosts: Set<string>): Promise<unknown> {
  if (isLegacyMedia(value, hosts)) return replace(value);
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) result.push(await rewriteMedia(item, replace, hosts));
    return result;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, key, { value: await rewriteMedia(item, replace, hosts), enumerable: true });
    }
    return result;
  }
  return value;
}

export async function migrateMediaValue(value: string, visibility: MediaVisibility, hosts: Set<string>) {
  if (value.startsWith("data:image/")) return storeImageDataUrl(value, visibility);
  if (value.startsWith("data:video/")) return storeVideoDataUrl(value);
  if (!isLegacyMedia(value, hosts)) throw new Error("Unapproved migration source.");
  const response = await fetch(value, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error("Legacy media could not be downloaded.");
  const maxBytes = 20 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > maxBytes) throw new Error("Legacy file exceeds migration limit.");
      chunks.push(chunk);
    }
  } finally { await reader.cancel(); }
  const mime = response.headers.get("content-type")?.split(";")[0];
  const extension = ({ "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" } as Record<string, string>)[mime || ""];
  if (!extension || !size) throw new Error("Legacy Blob is not a supported image.");
  // Preserve existing optimized bytes: migrating must not degrade image quality.
  return putR2Media(Buffer.concat(chunks), mime!, extension, visibility);
}

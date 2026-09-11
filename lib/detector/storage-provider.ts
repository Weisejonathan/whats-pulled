const publicR2Keys = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BUCKET", "R2_PUBLIC_URL"] as const;
export class DetectorStorageError extends Error {
  constructor(public readonly code: "storage_unconfigured" | "storage_unavailable" | "invalid_image", message: string, options?: ErrorOptions) { super(message, options); this.name = "DetectorStorageError"; }
}
/** Preserve explicit migration choices; auto-detect only when no provider is selected. */
export function detectorStorageProvider(env: Record<string, string | undefined> = process.env): "r2" | "vercel-blob" {
  const selected = env.MEDIA_STORAGE_PROVIDER?.trim();
  const hasR2 = publicR2Keys.every(key => Boolean(env[key]?.trim()));
  if (selected === "r2" || (!selected && hasR2)) {
    if (!hasR2) throw new DetectorStorageError("storage_unconfigured", "Image storage is not configured completely. Please contact the site administrator; your local capture is retained.");
    return "r2";
  }
  if ((!selected || selected === "vercel-blob") && env.BLOB_READ_WRITE_TOKEN?.trim()) return "vercel-blob";
  throw new DetectorStorageError("storage_unconfigured", "Image storage is not configured. Please contact the site administrator; your local capture is retained.");
}

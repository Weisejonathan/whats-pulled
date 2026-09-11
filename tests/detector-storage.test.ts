import test from "node:test";
import assert from "node:assert/strict";
import { detectorStorageProvider, DetectorStorageError } from "../lib/detector/storage-provider";
const r2 = { R2_ENDPOINT: "https://example.r2.cloudflarestorage.com", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_PUBLIC_BUCKET: "images", R2_PUBLIC_URL: "https://images.example.com" };
test("transferred Blob-only projects keep accepting detector uploads", () => {
  assert.equal(detectorStorageProvider({ BLOB_READ_WRITE_TOKEN: "test" }), "vercel-blob");
  assert.equal(detectorStorageProvider({ ...r2, BLOB_READ_WRITE_TOKEN: "test" }), "r2");
});
test("explicit storage selections are respected and missing configuration is actionable", () => {
  assert.equal(detectorStorageProvider({ ...r2, BLOB_READ_WRITE_TOKEN: "test", MEDIA_STORAGE_PROVIDER: "vercel-blob" }), "vercel-blob");
  for (const env of [{}, { MEDIA_STORAGE_PROVIDER: "r2", BLOB_READ_WRITE_TOKEN: "test" }, { MEDIA_STORAGE_PROVIDER: "typo", ...r2 }]) {
    assert.throws(() => detectorStorageProvider(env), error => error instanceof DetectorStorageError && error.code === "storage_unconfigured");
  }
});

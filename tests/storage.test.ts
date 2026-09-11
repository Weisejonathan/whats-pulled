import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decodeMediaDataUrl, storeImageDataUrl, storeVideoDataUrl } from "../lib/storage/media";
import { privateMediaKey, putR2Media, r2Config, signPrivateMedia } from "../lib/storage/r2";
import { parseBlobHosts, rewriteMedia } from "../lib/storage/migration";

test("direct-upload preparation is repeatable and preserves existing evidence records", async () => {
  const db = new PGlite();
  try {
    await db.exec("create type verification_status as enum ('pending', 'verified', 'rejected')");
    const migration = await readFile("drizzle/0005_direct_upload_verifications.sql", "utf8");
    await db.exec(migration);
    await db.query("insert into direct_upload_verifications(verification_code,video_data_url,card_image_data_url) values($1,$2,$3)", ["WP-TEST", "original-video", "original-image"]);
    await db.exec(migration);
    const rows = await db.query<{ video_data_url: string; card_image_data_url: string }>("select video_data_url,card_image_data_url from direct_upload_verifications");
    assert.deepEqual(rows.rows, [{ video_data_url: "original-video", card_image_data_url: "original-image" }]);
  } finally { await db.close(); }
});

test("media decoding rejects invalid, empty, oversized and mismatched data", () => {
  assert.throws(() => decodeMediaDataUrl("data:image/png;base64,!!!!", "image", 10));
  assert.throws(() => decodeMediaDataUrl("data:image/png;base64,", "image", 10));
  assert.throws(() => decodeMediaDataUrl("data:video/webm;base64,YWJj", "image", 10));
  assert.throws(() => decodeMediaDataUrl("data:image/png;base64,YWJj", "image", 2));
  assert.equal(decodeMediaDataUrl("data:video/webm;codecs=vp9;base64,YWJj", "video", 10).contentType, "video/webm");
});

test("image uploads shrink to WebP, preserve visibility, and propagate storage failures", async () => {
  const png = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#235588" } }).png().toBuffer();
  const value = `data:image/png;base64,${png.toString("base64")}`;
  const stored = await storeImageDataUrl(value, "private", async (bytes, mime, ext, visibility) => {
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 1200);
    assert.equal(metadata.format, "webp");
    assert.equal(mime, "image/webp");
    assert.equal(ext, "webp");
    assert.equal(visibility, "private");
    return "r2-private:evidence/test.webp";
  });
  assert.equal(stored, "r2-private:evidence/test.webp");
  await assert.rejects(storeImageDataUrl(value, "public", async () => { throw new Error("Upload failed"); }), /Upload failed/);
});

test("verification video bytes are preserved and always stored privately", async () => {
  const data = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3]);
  await storeVideoDataUrl(`data:video/webm;base64,${data.toString("base64")}`, async (bytes, mime, extension, visibility) => {
    assert.deepEqual(bytes, data);
    assert.equal(mime, "video/webm");
    assert.equal(extension, "webm");
    assert.equal(visibility, "private");
    return "r2-private:evidence/test.webm";
  });
  await assert.rejects(storeVideoDataUrl("data:video/html;base64,YWJj"), /Unsupported/);
});

test("R2 uploads verify contents, separate buckets and use expiring private links", async (t) => {
  const config = { R2_ENDPOINT: "https://test-account.r2.cloudflarestorage.com", R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret", R2_PUBLIC_BUCKET: "public-images", R2_PRIVATE_BUCKET: "private-evidence", R2_PUBLIC_URL: "https://images.example.com" };
  const previous = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]));
  Object.assign(process.env, config);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let latest: { Bucket?: string; Key?: string; Body?: unknown; Metadata?: Record<string, string>; CacheControl?: string } = {};
  let corrupt = false;
  t.mock.method(S3Client.prototype, "send", async (command: PutObjectCommand | HeadObjectCommand) => {
    if (command instanceof PutObjectCommand) { latest = command.input; return {}; }
    return { ContentLength: corrupt ? 0 : Buffer.byteLength(latest.Body as Buffer), Metadata: latest.Metadata };
  });
  const bytes = Buffer.from("media bytes");
  const publicUrl = await putR2Media(bytes, "image/webp", "webp", "public");
  assert.match(publicUrl, /^https:\/\/images.example.com\/images\/[a-f0-9]{64}\.webp$/);
  assert.equal(latest.Bucket, "public-images");
  assert.equal(publicUrl, await putR2Media(bytes, "image/webp", "webp", "public"));
  const privateRef = await putR2Media(bytes, "video/webm", "webm", "private");
  assert.equal(latest.Bucket, "private-evidence");
  assert.equal(latest.CacheControl, "private, no-store");
  assert.match(privateMediaKey(privateRef), /^evidence\//);
  assert.throws(() => privateMediaKey("r2-private:../secret"));
  const signed = new URL(await signPrivateMedia(privateRef));
  assert.equal(signed.searchParams.get("X-Amz-Expires"), "300");
  assert.ok(signed.pathname.includes("evidence/"));
  corrupt = true;
  await assert.rejects(putR2Media(bytes, "image/webp", "webp", "public"), /verification failed/);
  process.env.R2_PRIVATE_BUCKET = "public-images";
  assert.throws(() => r2Config("private"), /separate/);
});

test("migration rewrites nested media, preserves metadata and is safe to rerun", async () => {
  const hosts = parseBlobHosts("existing.public.blob.vercel-storage.com");
  assert.throws(() => parseBlobHosts("localhost"));
  assert.throws(() => parseBlobHosts("example.com"));
  const source = { id: "keep", payload: [{ image: "data:image/png;base64,YWJj", confidence: .9 }], old: "https://existing.public.blob.vercel-storage.com/a.webp", external: "https://example.com/a.jpg" };
  let writes = 0;
  const replace = async () => { writes++; return "https://images.example.com/images/new.webp"; };
  const migrated = await rewriteMedia(source, replace, hosts);
  assert.equal(writes, 2);
  assert.deepEqual(migrated, { ...source, payload: [{ image: "https://images.example.com/images/new.webp", confidence: .9 }], old: "https://images.example.com/images/new.webp" });
  assert.deepEqual(await rewriteMedia(migrated, replace, hosts), migrated);
  assert.equal(writes, 2);
  assert.equal(source.payload[0].image, "data:image/png;base64,YWJj");
});

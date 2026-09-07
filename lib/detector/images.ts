import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { put } from "@vercel/blob";

export async function storeDetectorImage(dataUrl: unknown) {
  if (typeof dataUrl !== "string" || dataUrl.length > 5_000_000) throw new Error("Image exceeds the upload limit.");
  const match = dataUrl.match(/^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("A PNG, JPEG or WebP image is required.");
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) throw new Error("Detector image storage is not configured.");
  const bytes = Buffer.from(match[1], "base64");
  const image = await sharp(bytes, { limitInputPixels: 25_000_000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 }).toBuffer();
  const hash = createHash("sha256").update(image).digest("hex");
  const thumbnail = await sharp(image).resize({ width: 280, height: 360, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const options = { access: "public" as const, addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp", cacheControlMaxAge: 31536000 };
  const [full, small] = await Promise.all([
    put(`detector/${hash}.webp`, image, options),
    put(`detector/${hash}-thumb.webp`, thumbnail, options),
  ]);
  return { imageUrl: full.url, thumbnailUrl: small.url };
}

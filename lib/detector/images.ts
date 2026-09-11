import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { putR2Media } from "@/lib/storage/r2";

export async function storeDetectorImage(dataUrl: unknown) {
  if (typeof dataUrl !== "string" || dataUrl.length > 5_000_000) throw new Error("Image exceeds the upload limit.");
  const match = dataUrl.match(/^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("A PNG, JPEG or WebP image is required.");
  const bytes = Buffer.from(match[1], "base64");
  const image = await sharp(bytes, { limitInputPixels: 25_000_000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 }).toBuffer();
  const hash = createHash("sha256").update(image).digest("hex");
  const thumbnail = await sharp(image).resize({ width: 280, height: 360, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  // Explicit compatibility switch for the staged rollout; R2 is the default.
  if (process.env.MEDIA_STORAGE_PROVIDER !== "vercel-blob") {
    const [imageUrl, thumbnailUrl] = await Promise.all([
      putR2Media(image, "image/webp", "webp", "public"),
      putR2Media(thumbnail, "image/webp", "webp", "public"),
    ]);
    return { imageUrl, thumbnailUrl };
  }
  const options = { access: "public" as const, addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp", cacheControlMaxAge: 31536000 };
  const [full, small] = await Promise.all([
    put(`detector/${hash}.webp`, image, options),
    put(`detector/${hash}-thumb.webp`, thumbnail, options),
  ]);
  return { imageUrl: full.url, thumbnailUrl: small.url };
}

import sharp from "sharp";
import { putR2Media, type MediaVisibility } from "./r2";

export function decodeMediaDataUrl(value: unknown, kind: "image" | "video", maxBytes: number) {
  if (typeof value !== "string" || value.length > Math.ceil(maxBytes / 3) * 4 + 200) throw new Error("Media exceeds the upload limit.");
  const match = value.match(/^data:((?:image|video)\/[a-z0-9.+-]+)(?:;codecs=[a-z0-9., -]+)?;base64,([A-Za-z0-9+/]*={0,2})$/i);
  if (!match || !match[1].startsWith(`${kind}/`)) throw new Error(`A base64 ${kind} is required.`);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) throw new Error("Invalid or oversized media.");
  return { bytes, contentType: match[1].toLowerCase() };
}

export async function optimizeImage(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 25_000_000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 }).toBuffer();
}

export async function storeImageDataUrl(value: unknown, visibility: MediaVisibility = "public", write = putR2Media) {
  const { bytes, contentType } = decodeMediaDataUrl(value, "image", 4 * 1024 * 1024);
  if (!/^image\/(png|jpe?g|webp)$/.test(contentType)) throw new Error("A PNG, JPEG or WebP image is required.");
  const image = await optimizeImage(bytes);
  return write(image, "image/webp", "webp", visibility);
}

export async function storeVideoDataUrl(value: unknown, write = putR2Media) {
  const { bytes, contentType } = decodeMediaDataUrl(value, "video", 3 * 1024 * 1024);
  const extensions: Record<string, string> = { "video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov", "video/ogg": "ogv" };
  const extension = extensions[contentType];
  if (!extension) throw new Error("Unsupported verification video format.");
  return write(bytes, contentType, extension, "private");
}

export async function externalizeImage(value: string | null) {
  if (!value) return value;
  if (value.startsWith("data:")) return storeImageDataUrl(value);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("An HTTP image URL is required.");
  return value;
}

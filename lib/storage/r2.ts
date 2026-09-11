import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type MediaVisibility = "public" | "private";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Media storage is not configured: ${name} is missing.`);
  return value;
}

export function r2Config(visibility: MediaVisibility) {
  const endpoint = new URL(required("R2_ENDPOINT"));
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error("R2_ENDPOINT must be the HTTPS S3 endpoint from Cloudflare.");
  }
  const bucket = required(visibility === "public" ? "R2_PUBLIC_BUCKET" : "R2_PRIVATE_BUCKET");
  if (process.env.R2_PUBLIC_BUCKET === process.env.R2_PRIVATE_BUCKET) {
    throw new Error("Public images and private evidence must use separate R2 buckets.");
  }
  const publicUrl = visibility === "public" ? new URL(required("R2_PUBLIC_URL")) : null;
  if (publicUrl && (publicUrl.protocol !== "https:" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password)) {
    throw new Error("R2_PUBLIC_URL must be an HTTPS media URL without credentials or query parameters.");
  }
  return { bucket, publicUrl, endpoint: endpoint.origin,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") } };
}

function connection(visibility: MediaVisibility) {
  const config = r2Config(visibility);
  const client = new S3Client({ region: "auto", endpoint: config.endpoint, credentials: config.credentials,
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  return { ...config, client };
}

export function privateMediaKey(reference: string) {
  const match = reference.match(/^r2-private:(evidence\/[a-f0-9]{64}\.[a-z0-9]+)$/);
  if (!match) throw new Error("Invalid private media reference.");
  return match[1];
}

/** Content-addressed keys make retries safe without accumulating duplicate files. */
export async function putR2Media(bytes: Buffer, contentType: string, extension: string, visibility: MediaVisibility) {
  if (!/^[a-z0-9]+$/.test(extension)) throw new Error("Invalid media extension.");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const key = `${visibility === "private" ? "evidence" : "images"}/${hash}.${extension}`;
  const { client, bucket, publicUrl } = connection(visibility);
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
      ContentType: contentType, Metadata: { sha256: hash },
      CacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store" }));
    const stored = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (stored.ContentLength !== bytes.length || stored.Metadata?.sha256 !== hash) {
      throw new Error("Media verification failed; the database reference was not changed.");
    }
    return visibility === "private" ? `r2-private:${key}` : `${publicUrl!.href.replace(/\/$/, "")}/${key}`;
  } finally { client.destroy(); }
}

export async function signPrivateMedia(reference: string) {
  const key = privateMediaKey(reference);
  const { client, bucket } = connection("private");
  try {
    return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
  } finally { client.destroy(); }
}

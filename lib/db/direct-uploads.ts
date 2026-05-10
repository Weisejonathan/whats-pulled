import { directUploadVerifications } from "./schema";
import { getDb } from "./client";

export type DirectUploadVerificationInput = {
  cardImageDataUrl: string;
  cardImageFileName?: string | null;
  cardImageFileSize?: number | null;
  cardImageMimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  notes?: string | null;
  payload?: unknown;
  verificationCode: string;
  videoDataUrl: string;
};

export async function createDirectUploadVerification(input: DirectUploadVerificationInput) {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  if (!input.videoDataUrl.startsWith("data:video/")) {
    throw new Error("videoDataUrl must be a browser video data URL.");
  }

  if (!input.cardImageDataUrl.startsWith("data:image/")) {
    throw new Error("cardImageDataUrl must be a browser image data URL.");
  }

  const [verification] = await db
    .insert(directUploadVerifications)
    .values({
      cardImageDataUrl: input.cardImageDataUrl,
      cardImageFileName: input.cardImageFileName?.trim() || null,
      cardImageFileSize: input.cardImageFileSize ?? null,
      cardImageMimeType: input.cardImageMimeType?.trim() || null,
      fileName: input.fileName?.trim() || null,
      fileSize: input.fileSize ?? null,
      mimeType: input.mimeType?.trim() || null,
      notes: input.notes?.trim() || null,
      payload: input.payload ?? null,
      updatedAt: new Date(),
      verificationCode: input.verificationCode.trim().toUpperCase(),
      videoDataUrl: input.videoDataUrl,
    })
    .returning({
      createdAt: directUploadVerifications.createdAt,
      cardImageFileName: directUploadVerifications.cardImageFileName,
      cardImageFileSize: directUploadVerifications.cardImageFileSize,
      cardImageMimeType: directUploadVerifications.cardImageMimeType,
      fileName: directUploadVerifications.fileName,
      fileSize: directUploadVerifications.fileSize,
      id: directUploadVerifications.id,
      mimeType: directUploadVerifications.mimeType,
      status: directUploadVerifications.status,
      verificationCode: directUploadVerifications.verificationCode,
    });

  return verification;
}

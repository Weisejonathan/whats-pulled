import { NextResponse } from "next/server";
import { createDirectUploadVerification } from "@/lib/db/direct-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const maxVideoBytes = 24 * 1024 * 1024;
const maxImageBytes = 8 * 1024 * 1024;

const readText = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const toDataUrl = async (file: File, fallbackMimeType: string) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || fallbackMimeType};base64,${buffer.toString("base64")}`;
};

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Multipart form data expected." }, { status: 400 });
  }

  const verificationCode = readText(formData, "verificationCode");
  const cardImage = formData.get("cardImage");
  const video = formData.get("video");

  if (!verificationCode) {
    return NextResponse.json({ error: "verificationCode is required." }, { status: 400 });
  }

  if (!(video instanceof File)) {
    return NextResponse.json({ error: "video file is required." }, { status: 400 });
  }

  if (!(cardImage instanceof File)) {
    return NextResponse.json({ error: "cardImage file is required." }, { status: 400 });
  }

  if (!video.type.startsWith("video/")) {
    return NextResponse.json({ error: "Only video uploads are supported." }, { status: 400 });
  }

  if (!cardImage.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported for cardImage." }, { status: 400 });
  }

  if (video.size > maxVideoBytes) {
    return NextResponse.json({ error: "Video is too large. Keep the verification under 24 MB." }, { status: 413 });
  }

  if (cardImage.size > maxImageBytes) {
    return NextResponse.json({ error: "Card image is too large. Keep it under 8 MB." }, { status: 413 });
  }

  try {
    const uploaded = await createDirectUploadVerification({
      cardImageDataUrl: await toDataUrl(cardImage, "image/jpeg"),
      cardImageFileName: cardImage.name,
      cardImageFileSize: cardImage.size,
      cardImageMimeType: cardImage.type,
      fileName: video.name,
      fileSize: video.size,
      mimeType: video.type,
      notes: readText(formData, "notes"),
      payload: {
        cardDetails: readText(formData, "cardDetails"),
        durationMs: Number(readText(formData, "durationMs")) || null,
        userAgent: request.headers.get("user-agent"),
      },
      verificationCode,
      videoDataUrl: await toDataUrl(video, "video/webm"),
    });

    return NextResponse.json({ ok: true, uploaded }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

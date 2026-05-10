import { NextResponse } from "next/server";
import { createDirectUploadVerification } from "@/lib/db/direct-uploads";
import { searchCardMatches } from "@/lib/db/live-breaks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const maxVideoBytes = 3 * 1024 * 1024;
const maxImageBytes = 1 * 1024 * 1024;

const readText = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const toDataUrl = async (file: File, fallbackMimeType: string) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || fallbackMimeType};base64,${buffer.toString("base64")}`;
};

const identifyCard = async (request: Request, imageDataUrl: string, detectedText: string | null) => {
  try {
    const visionResponse = await fetch(new URL("/api/detector/vision", request.url), {
      body: JSON.stringify({
        detectedText,
        imageDataUrl,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!visionResponse.ok) {
      return {
        error: `Card Detection failed: ${visionResponse.status}`,
        matches: [],
      };
    }

    const detection = (await visionResponse.json().catch(() => null)) as
      | {
          confidence?: number;
          detectedText?: string;
          notes?: string;
          suggestion?: {
            cardName?: string;
            cardNumber?: string;
            isAutographed?: boolean;
            limitation?: string;
            playerName?: string;
            setName?: string;
          };
        }
      | null;
    const suggestion = detection?.suggestion ?? {};
    const matches = await searchCardMatches({
      cardName: suggestion.cardName ?? null,
      cardNumber: suggestion.cardNumber ?? null,
      detectedText: [detection?.detectedText, detectedText].filter(Boolean).join("\n"),
      limitation: suggestion.limitation ?? null,
      playerName: suggestion.playerName ?? null,
      setName: suggestion.setName ?? null,
    });

    return {
      confidence: detection?.confidence ?? 0,
      detectedText: detection?.detectedText ?? "",
      matches,
      notes: detection?.notes ?? "",
      suggestion,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Card Detection could not identify the upload.",
      matches: [],
    };
  }
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
    return NextResponse.json({ error: "Video is too large. Keep the verification under 3 MB." }, { status: 413 });
  }

  if (cardImage.size > maxImageBytes) {
    return NextResponse.json({ error: "Card image is too large. Keep it under 1 MB." }, { status: 413 });
  }

  try {
    const cardImageDataUrl = await toDataUrl(cardImage, "image/jpeg");
    const cardDetails = readText(formData, "cardDetails");
    const identification = await identifyCard(request, cardImageDataUrl, cardDetails);
    const uploaded = await createDirectUploadVerification({
      cardImageDataUrl,
      cardImageFileName: cardImage.name,
      cardImageFileSize: cardImage.size,
      cardImageMimeType: cardImage.type,
      fileName: video.name,
      fileSize: video.size,
      mimeType: video.type,
      notes: readText(formData, "notes"),
      payload: {
        cardDetails,
        durationMs: Number(readText(formData, "durationMs")) || null,
        identification,
        userAgent: request.headers.get("user-agent"),
      },
      verificationCode,
      videoDataUrl: await toDataUrl(video, "video/webm"),
    });

    return NextResponse.json({ identification, ok: true, uploaded }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

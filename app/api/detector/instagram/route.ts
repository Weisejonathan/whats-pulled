import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/auth";
import { POST as detectVision } from "@/app/api/detector/vision/route";
import sharp from "sharp";
import { searchCardMatches } from "@/lib/db/live-breaks";
import { recordToolEvent } from "@/lib/db/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type VisionDetectionResult = {
  confidence?: number;
  detectedText?: string;
  error?: string;
  model?: string;
  notes?: string;
  suggestion?: {
    cardName?: string;
    cardNumber?: string;
    isAutographed?: boolean | null;
    limitation?: string;
    playerName?: string;
    setName?: string;
  };
  unavailable?: boolean;
};

const readText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readUrlList = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim());
  }

  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const toHttpUrl = (value: string | null) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const isInstagramUrl = (url: URL) =>
  /(^|\.)instagram\.com$/i.test(url.hostname) ||
  /(^|\.)cdninstagram\.com$/i.test(url.hostname) ||
  /(^|\.)fbcdn\.net$/i.test(url.hostname);

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const extractMediaUrlsFromHtml = (html: string) => {
  const mediaUrls = new Set<string>();
  const metaPattern = /<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image|og:video|twitter:player:stream)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  const reverseMetaPattern = /<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image|og:video|twitter:player:stream)["'][^>]*>/gi;
  const imagePattern = /https?:\\?\/\\?\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s]*)?/gi;

  for (const pattern of [metaPattern, reverseMetaPattern]) {
    let match = pattern.exec(html);

    while (match) {
      mediaUrls.add(decodeHtml(match[1].replace(/\\\//g, "/")));
      match = pattern.exec(html);
    }
  }

  let match = imagePattern.exec(html);

  while (match) {
    mediaUrls.add(decodeHtml(match[0].replace(/\\\//g, "/")));
    match = imagePattern.exec(html);
  }

  return Array.from(mediaUrls);
};

const fetchPageMediaUrls = async (url: URL) => {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return [];
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    return [];
  }

  return extractMediaUrlsFromHtml(await response.text());
};

const fetchImageDataUrl = async (url: URL) => {
  const response = await fetch(url, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Could not fetch media: ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

  if (!/^image\/(?:png|jpe?g|webp)$/i.test(contentType)) {
    throw new Error("Media URL did not return a supported image.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength > 8_000_000) {
    throw new Error("Media image is too large.");
  }

  const optimized = await sharp(buffer, { limitInputPixels: 25_000_000 }).rotate()
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${optimized.toString("base64")}`;
};

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON payload expected." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const instagramUrl = toHttpUrl(readText(body, "instagramUrl"));
  const directMediaUrls = readUrlList(body, "mediaUrls").map(toHttpUrl).filter((url): url is URL => Boolean(url));
  const detectedText = readText(body, "detectedText");

  if (!instagramUrl && !directMediaUrls.length) {
    return NextResponse.json({ error: "instagramUrl or mediaUrls is required." }, { status: 400 });
  }

  if (instagramUrl && !isInstagramUrl(instagramUrl)) {
    return NextResponse.json({ error: "Only Instagram URLs are accepted in instagramUrl." }, { status: 400 });
  }

  const extractedUrls = instagramUrl ? await fetchPageMediaUrls(instagramUrl) : [];
  const mediaUrls = Array.from(
    new Set([...directMediaUrls.map(String), ...extractedUrls]),
  )
    .map(toHttpUrl)
    .filter((url): url is URL => Boolean(url))
    .filter((url) => directMediaUrls.some((directUrl) => String(directUrl) === String(url)) || isInstagramUrl(url))
    .slice(0, 2); // Bound provider time and the response size; additional media can be submitted separately.

  if (!mediaUrls.length) {
    return NextResponse.json({
      detections: [],
      error:
        "No public media image could be extracted. Paste direct post image URLs, screenshots, or use Meta's official Instagram APIs for account media.",
      sourceUrl: instagramUrl?.toString() ?? null,
    });
  }

  const detections = [];

  for (const mediaUrl of mediaUrls) {
    try {
      const imageDataUrl = await fetchImageDataUrl(mediaUrl);
      const sourceText = [
        detectedText,
        `Instagram source: ${instagramUrl?.toString() ?? mediaUrl.toString()}`,
        mediaUrl.pathname.split("/").pop() ?? "",
        mediaUrl.toString(),
      ]
        .filter(Boolean)
        .join("\n");
      const visionResponse = await detectVision(new Request(new URL("/api/detector/vision", request.url), {
        body: JSON.stringify({
          detectedText: sourceText,
          imageDataUrl,
          setName: readText(body, "setName"),
          setId: readText(body, "setId"),
        }),
        headers: {
          "content-type": "application/json",
          "x-wp-session-id": request.headers.get("x-wp-session-id") ?? "",
        },
        method: "POST",
      }));

      if (!visionResponse.ok) {
        detections.push({
          error: `Vision detection failed: ${visionResponse.status}`,
          mediaUrl: mediaUrl.toString(),
        });
        continue;
      }

      const detection = (await visionResponse.json()) as VisionDetectionResult;
      const suggestion = {
        cardName: detection.suggestion?.cardName ?? "",
        cardNumber: detection.suggestion?.cardNumber ?? "",
        detectedText: [detection.detectedText, sourceText].filter(Boolean).join("\n"),
        isAutographed: detection.suggestion?.isAutographed ?? null,
        limitation: detection.suggestion?.limitation ?? "",
        playerName: detection.suggestion?.playerName ?? "",
        setName: detection.suggestion?.setName ?? "",
        sourceUrl: mediaUrl.toString(),
      };
      const enrichedDetection = {
        ...detection,
        detectedText: [detection.detectedText, sourceText].filter(Boolean).join("\n"),
        suggestion,
      };
      detections.push({
        ...enrichedDetection,
        matches: await searchCardMatches(enrichedDetection.suggestion),
        imageDataUrl,
        mediaUrl: mediaUrl.toString(),
      });
    } catch (error) {
      detections.push({
        error: error instanceof Error ? error.message : "Media analysis failed.",
        mediaUrl: mediaUrl.toString(),
      });
    }
  }

  await recordToolEvent({
    tool: "instagram-import",
    sessionId: request.headers.get("x-wp-session-id"),
    inputUnits: mediaUrls.length,
    metadata: { analyzedMedia: mediaUrls.length, successfulDetections: detections.filter((item) => !("error" in item)).length },
  });

  return NextResponse.json({
    detections,
    sourceUrl: instagramUrl?.toString() ?? null,
  });
}

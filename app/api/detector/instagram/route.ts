import { NextResponse } from "next/server";
import { applyLimitationParallelRule } from "@/lib/card-parallels";

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
    isAutographed?: boolean;
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

  return `data:${contentType};base64,${buffer.toString("base64")}`;
};

const matchCards = async (requestUrl: string, detection: VisionDetectionResult) => {
  const suggestion = detection.suggestion ?? {};
  const response = await fetch(new URL("/api/cards/match", requestUrl), {
    body: JSON.stringify({
      cardName: suggestion.cardName ?? "",
      cardNumber: suggestion.cardNumber ?? "",
      detectedText: detection.detectedText ?? "",
      limitation: suggestion.limitation ?? "",
      playerName: suggestion.playerName ?? "",
      setName: suggestion.setName ?? "",
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json().catch(() => null)) as { matches?: unknown[] } | null;
  return Array.isArray(payload?.matches) ? payload.matches : [];
};

export async function POST(request: Request) {
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
    .slice(0, 8);

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
      const visionResponse = await fetch(new URL("/api/detector/vision", request.url), {
        body: JSON.stringify({
          detectedText: sourceText,
          imageDataUrl,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!visionResponse.ok) {
        detections.push({
          error: `Vision detection failed: ${visionResponse.status}`,
          mediaUrl: mediaUrl.toString(),
        });
        continue;
      }

      const detection = (await visionResponse.json()) as VisionDetectionResult;
      const suggestion = applyLimitationParallelRule({
        cardName: detection.suggestion?.cardName ?? "",
        cardNumber: detection.suggestion?.cardNumber ?? "",
        detectedText: [detection.detectedText, sourceText].filter(Boolean).join("\n"),
        isAutographed: Boolean(detection.suggestion?.isAutographed),
        limitation: detection.suggestion?.limitation ?? "",
        playerName: detection.suggestion?.playerName ?? "",
        setName: detection.suggestion?.setName ?? "",
        sourceUrl: mediaUrl.toString(),
      });
      const enrichedDetection = {
        ...detection,
        detectedText: [detection.detectedText, sourceText].filter(Boolean).join("\n"),
        suggestion,
      };
      detections.push({
        ...enrichedDetection,
        matches: await matchCards(request.url, enrichedDetection),
        mediaUrl: mediaUrl.toString(),
      });
    } catch (error) {
      detections.push({
        error: error instanceof Error ? error.message : "Media analysis failed.",
        mediaUrl: mediaUrl.toString(),
      });
    }
  }

  return NextResponse.json({
    detections,
    sourceUrl: instagramUrl?.toString() ?? null,
  });
}

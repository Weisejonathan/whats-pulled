"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StreamDetectionState = "idle" | "ready" | "capturing" | "analyzing" | "matched" | "error";
type StreamAspectMode = "16:9" | "9:16";

type CardMatch = {
  cardId: string;
  cardName: string;
  cardNumber: number | null;
  cardUrl: string;
  imageUrl: string | null;
  playerName: string;
  score: number;
  serialNumber: string;
  setName: string;
};

type DetectorSuggestion = {
  cardName?: string;
  cardNumber?: string;
  isAutographed?: boolean;
  limitation?: string;
  playerName?: string;
  setName?: string;
};

type StreamDetection = {
  approvedPullId?: string;
  cardImageDataUrl?: string;
  id: string;
  capturedAt: string;
  confidence: number;
  detectedText: string;
  matches: CardMatch[];
  notes: string;
  pulledBy?: string;
  suggestion: DetectorSuggestion;
  status?: "pending" | "approved";
  thumbnailDataUrl: string;
};

type EditDraft = {
  cardName: string;
  limitation: string;
  playerName: string;
  setName: string;
};

const storageKey = "whats-pulled-stream-detections";
const pulledByStorageKey = "whats-pulled-stream-pulled-by";
const overlayKeyStorageKey = "whats-pulled-stream-overlay-key";
const aspectModeStorageKey = "whats-pulled-stream-aspect-mode";
const maxDetections = 25;
const minimumListConfidence = 0.9;

const extractYoutubeId = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const directMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/);
  if (directMatch) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] ?? "";
    }

    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/") || url.pathname.startsWith("/embed/")) {
      return url.pathname.split("/").filter(Boolean)[1] ?? "";
    }

    return url.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
};

const fileToCompressedDataUrl = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Frame could not be prepared."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Frame image could not be loaded."));
    };
    image.src = url;
  });

const imageDataUrlToThumbnail = async (imageDataUrl: string) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const maxSide = 260;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Thumbnail could not be prepared."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.58));
    };

    image.onerror = () => reject(new Error("Thumbnail image could not be loaded."));
    image.src = imageDataUrl;
  });

const imageDataUrlToAspectFrame = async (imageDataUrl: string, aspectMode: StreamAspectMode) =>
  new Promise<string>((resolve, reject) => {
    if (aspectMode === "16:9") {
      resolve(imageDataUrl);
      return;
    }

    const image = new Image();

    image.onload = () => {
      const targetAspect = aspectMode === "9:16" ? 9 / 16 : 16 / 9;
      const imageAspect = image.width / image.height;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = image.width;
      let sourceHeight = image.height;

      if (imageAspect > targetAspect) {
        sourceWidth = Math.round(image.height * targetAspect);
        sourceX = Math.round((image.width - sourceWidth) / 2);
      } else if (imageAspect < targetAspect) {
        sourceHeight = Math.round(image.width / targetAspect);
        sourceY = Math.round((image.height - sourceHeight) / 2);
      }

      const outputCanvas = document.createElement("canvas");
      const maxHeight = aspectMode === "9:16" ? 1280 : 720;
      outputCanvas.height = Math.min(maxHeight, sourceHeight);
      outputCanvas.width = Math.round(outputCanvas.height * targetAspect);
      const outputContext = outputCanvas.getContext("2d");

      if (!outputContext) {
        reject(new Error("Stream aspect frame could not be prepared."));
        return;
      }

      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = "high";
      outputContext.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height,
      );
      resolve(outputCanvas.toDataURL("image/jpeg", 0.78));
    };

    image.onerror = () => reject(new Error("Stream frame could not be reformatted."));
    image.src = imageDataUrl;
  });

const imageDataUrlToCardCrop = async (imageDataUrl: string) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const aspect = 9 / 16;
      const sampleWidth = 180;
      const sampleScale = sampleWidth / image.width;
      const sampleHeight = Math.max(1, Math.round(image.height * sampleScale));
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

      if (!sampleContext) {
        reject(new Error("Card crop could not be prepared."));
        return;
      }

      sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;

      const scoreWindow = (x: number, y: number, width: number, height: number) => {
        const step = 3;
        let score = 0;
        let count = 0;

        for (let py = Math.max(1, y); py < Math.min(sampleHeight - 1, y + height); py += step) {
          for (let px = Math.max(1, x); px < Math.min(sampleWidth - 1, x + width); px += step) {
            const index = (py * sampleWidth + px) * 4;
            const left = (py * sampleWidth + px - 1) * 4;
            const right = (py * sampleWidth + px + 1) * 4;
            const up = ((py - 1) * sampleWidth + px) * 4;
            const down = ((py + 1) * sampleWidth + px) * 4;
            const r = pixels[index] ?? 0;
            const g = pixels[index + 1] ?? 0;
            const b = pixels[index + 2] ?? 0;
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);
            const horizontalEdge =
              Math.abs((pixels[right] ?? 0) - (pixels[left] ?? 0)) +
              Math.abs((pixels[right + 1] ?? 0) - (pixels[left + 1] ?? 0)) +
              Math.abs((pixels[right + 2] ?? 0) - (pixels[left + 2] ?? 0));
            const verticalEdge =
              Math.abs((pixels[down] ?? 0) - (pixels[up] ?? 0)) +
              Math.abs((pixels[down + 1] ?? 0) - (pixels[up + 1] ?? 0)) +
              Math.abs((pixels[down + 2] ?? 0) - (pixels[up + 2] ?? 0));

            score += horizontalEdge + verticalEdge + saturation * 1.6;
            count += 1;
          }
        }

        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const centerPenalty =
          Math.abs(centerX / sampleWidth - 0.5) * 120 +
          Math.abs(centerY / sampleHeight - 0.42) * 80;

        return count ? score / count - centerPenalty : -Infinity;
      };

      let best = {
        height: sampleHeight * 0.82,
        score: -Infinity,
        width: sampleHeight * 0.82 * aspect,
        x: sampleWidth * 0.5 - (sampleHeight * 0.82 * aspect) / 2,
        y: sampleHeight * 0.42 - (sampleHeight * 0.82) / 2,
      };

      for (const heightRatio of [0.54, 0.66, 0.78, 0.9]) {
        const height = sampleHeight * heightRatio;
        const width = height * aspect;

        if (width > sampleWidth * 0.82) {
          continue;
        }

        for (const centerYRatio of [0.3, 0.38, 0.46, 0.54, 0.62]) {
          for (const centerXRatio of [0.32, 0.4, 0.5, 0.6, 0.68]) {
            const x = centerXRatio * sampleWidth - width / 2;
            const y = centerYRatio * sampleHeight - height / 2;

            if (x < 0 || y < 0 || x + width > sampleWidth || y + height > sampleHeight) {
              continue;
            }

            const score = scoreWindow(Math.round(x), Math.round(y), Math.round(width), Math.round(height));

            if (score > best.score) {
              best = { height, score, width, x, y };
            }
          }
        }
      }

      const sourceX = Math.max(0, Math.round(best.x / sampleScale));
      const sourceY = Math.max(0, Math.round(best.y / sampleScale));
      const sourceWidth = Math.min(image.width - sourceX, Math.round(best.width / sampleScale));
      const sourceHeight = Math.min(image.height - sourceY, Math.round(best.height / sampleScale));
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = 720;
      outputCanvas.height = 1280;
      const outputContext = outputCanvas.getContext("2d");

      if (!outputContext) {
        reject(new Error("Card crop could not be rendered."));
        return;
      }

      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = "high";
      outputContext.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height,
      );
      resolve(outputCanvas.toDataURL("image/jpeg", 0.74));
    };

    image.onerror = () => reject(new Error("Card crop image could not be loaded."));
    image.src = imageDataUrl;
  });

const detectionKey = (detection: Pick<StreamDetection, "matches" | "suggestion">) => {
  const match = detection.matches[0];
  return [
    match?.cardId,
    match?.playerName || detection.suggestion.playerName,
    match?.cardName || detection.suggestion.cardName,
    detection.suggestion.limitation || match?.serialNumber,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
};

export function StreamDetectorClient() {
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const analyzingRef = useRef(false);
  const lastSignatureRef = useRef("");
  const postedOverlayKeysRef = useRef<Set<string>>(new Set());
  const [detections, setDetections] = useState<StreamDetection[]>([]);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft>({
    cardName: "",
    limitation: "",
    playerName: "",
    setName: "",
  });
  const [framePreview, setFramePreview] = useState("");
  const [isLiveCaptureActive, setIsLiveCaptureActive] = useState(false);
  const [message, setMessage] = useState("Add a YouTube stream and analyze frames from the break.");
  const [state, setState] = useState<StreamDetectionState>("idle");
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const [aspectMode, setAspectMode] = useState<StreamAspectMode>("16:9");
  const [overlayKey, setOverlayKey] = useState("");
  const [streamPulledBy, setStreamPulledBy] = useState("");
  const [streamUrl, setStreamUrl] = useState("");

  const youtubeId = useMemo(() => extractYoutubeId(streamUrl), [streamUrl]);
  const embedUrl = youtubeId ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1` : "";

  useEffect(() => {
    const storedAspectMode = window.localStorage.getItem(aspectModeStorageKey);
    setAspectMode(storedAspectMode === "9:16" ? "9:16" : "16:9");
    setOverlayKey(window.localStorage.getItem(overlayKeyStorageKey) ?? "");
    setStreamPulledBy(window.localStorage.getItem(pulledByStorageKey) ?? "");
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return;
    }

    if (stored.length > 1_000_000) {
      window.localStorage.removeItem(storageKey);
      setMessage("Old stream list was too large and has been cleared for stability.");
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Array<StreamDetection & { frameDataUrl?: string }>;
      if (Array.isArray(parsed)) {
        setDetections(
          parsed
            .map(({ cardImageDataUrl: _cardImageDataUrl, frameDataUrl: _frameDataUrl, ...detection }) => detection)
            .filter((detection) => detection.thumbnailDataUrl && detection.confidence >= minimumListConfidence)
            .slice(0, maxDetections),
        );
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(pulledByStorageKey, streamPulledBy);
  }, [streamPulledBy]);

  useEffect(() => {
    window.localStorage.setItem(overlayKeyStorageKey, overlayKey);
  }, [overlayKey]);

  useEffect(() => {
    window.localStorage.setItem(aspectModeStorageKey, aspectMode);
  }, [aspectMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(
          detections
            .slice(0, maxDetections)
            .map(({ cardImageDataUrl: _cardImageDataUrl, detectedText: _detectedText, notes: _notes, ...detection }) => detection),
        ),
      );
    } catch {
      window.localStorage.removeItem(storageKey);
      setMessage("Stream list was too large for browser storage. Keeping the current session only.");
    }
  }, [detections]);

  useEffect(
    () => () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      captureStream?.getTracks().forEach((track) => track.stop());
    },
    [captureStream],
  );

  const analyzeImageDataUrl = async (imageDataUrl: string, options?: { automatic?: boolean }) => {
    if (analyzingRef.current) {
      return;
    }

    analyzingRef.current = true;
    setState("analyzing");
    setMessage(options?.automatic ? "Live stream frame detected. Reading card." : "Analyzing stream frame with Card Detection.");

    try {
      const detectionFrameDataUrl = await imageDataUrlToAspectFrame(imageDataUrl, aspectMode);
      setFramePreview(detectionFrameDataUrl);

      const visionResponse = await fetch("/api/detector/vision", {
        body: JSON.stringify({
          detectedText: "",
          imageDataUrl: detectionFrameDataUrl,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      const visionResult = (await visionResponse.json().catch(() => null)) as
        | {
            confidence?: number;
            detectedText?: string;
            error?: string;
            notes?: string;
            suggestion?: DetectorSuggestion;
          }
        | null;

      if (!visionResponse.ok) {
        throw new Error(visionResult?.error ?? `Card Detection failed: ${visionResponse.status}`);
      }

      const suggestion = visionResult?.suggestion ?? {};
      const matchResponse = await fetch("/api/cards/match", {
        body: JSON.stringify({
          cardName: suggestion.cardName ?? "",
          cardNumber: suggestion.cardNumber ?? "",
          detectedText: visionResult?.detectedText ?? "",
          limitation: suggestion.limitation ?? "",
          playerName: suggestion.playerName ?? "",
          setName: suggestion.setName ?? "",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const matchResult = (await matchResponse.json().catch(() => null)) as { matches?: CardMatch[] } | null;
      const matches = Array.isArray(matchResult?.matches) ? matchResult.matches : [];
      const cardImageDataUrl = await imageDataUrlToCardCrop(detectionFrameDataUrl);
      const thumbnailDataUrl = await imageDataUrlToThumbnail(cardImageDataUrl);

      const detection: StreamDetection = {
        cardImageDataUrl,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        capturedAt: new Date().toISOString(),
        confidence: Math.min(1, Math.max(0, Number(visionResult?.confidence) || 0)),
        detectedText: visionResult?.detectedText ?? "",
        matches,
        notes: visionResult?.notes ?? "",
        suggestion,
        thumbnailDataUrl,
      };

      if (detection.confidence < minimumListConfidence) {
        setState(options?.automatic ? "capturing" : "matched");
        setMessage(`Skipped ${Math.round(detection.confidence * 100)}% confidence. Only 90%+ cards are added.`);
        return;
      }

      await postDetectionToOverlay(detection);

      setDetections((current) => {
        const nextKey = detectionKey(detection);
        const currentKey = current[0] ? detectionKey(current[0]) : "";

        if (nextKey && nextKey === currentKey) {
          return current;
        }

        return [detection, ...current].slice(0, maxDetections);
      });
      setState(options?.automatic ? "capturing" : "matched");
      setMessage(
        overlayKey.trim()
          ? matches.length
            ? "90%+ card detected, added, and posted to overlay."
            : "90%+ frame added and posted to overlay. No database match yet."
          : matches.length
            ? "90%+ card detected and added."
            : "90%+ frame added. No database match yet.",
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Frame could not be analyzed.");
    } finally {
      analyzingRef.current = false;
    }
  };

  const analyzeFrame = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const imageDataUrl = await fileToCompressedDataUrl(file);
      await analyzeImageDataUrl(imageDataUrl);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Frame could not be prepared.");
    }
  };

  const createCaptureFrame = () => {
    const video = captureVideoRef.current;

    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.76);
  };

  const frameSignature = (imageDataUrl: string) => {
    const step = Math.max(1, Math.floor(imageDataUrl.length / 24));
    let signature = "";
    for (let index = 0; index < imageDataUrl.length; index += step) {
      signature += imageDataUrl[index];
    }
    return signature;
  };

  const sampleLiveFrame = async () => {
    const imageDataUrl = createCaptureFrame();

    if (!imageDataUrl) {
      setMessage("Waiting for the captured stream video to become readable.");
      return;
    }

    const signature = frameSignature(imageDataUrl);
    if (signature === lastSignatureRef.current) {
      setMessage("Live capture is running. Waiting for a new card frame.");
      return;
    }

    lastSignatureRef.current = signature;
    await analyzeImageDataUrl(imageDataUrl, { automatic: true });
  };

  const postDetectionToOverlay = async (detection: StreamDetection) => {
    const key = overlayKey.trim();

    if (!key) {
      return;
    }

    const match = detection.matches[0];
    const playerName = match?.playerName || detection.suggestion.playerName;
    const setName = match?.setName || detection.suggestion.setName;

    if (!playerName || !setName) {
      return;
    }

    const signature = detectionKey(detection);
    if (signature && postedOverlayKeysRef.current.has(signature)) {
      return;
    }

    const response = await fetch(`/api/obs/recognitions/${key}`, {
      body: JSON.stringify({
        cardId: match?.cardId,
        cardName: match?.cardName || detection.suggestion.cardName,
        cardNumber: match?.cardNumber ?? detection.suggestion.cardNumber,
        confidence: Number(detection.confidence.toFixed(4)),
        frameImageUrl: detection.cardImageDataUrl ?? detection.thumbnailDataUrl,
        isAutographed: detection.suggestion.isAutographed,
        limitation: detection.suggestion.limitation || match?.serialNumber,
        playerName,
        setName,
        source: "stream-detector-auto",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error ?? `Overlay post failed: ${response.status}`);
    }

    if (signature) {
      postedOverlayKeysRef.current.add(signature);
    }
  };

  const stopLiveCapture = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    captureStream?.getTracks().forEach((track) => track.stop());
    setCaptureStream(null);
    setIsLiveCaptureActive(false);
    setState(streamUrl.trim() ? "ready" : "idle");
    setMessage("Live detection stopped.");
  };

  const startLiveCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          frameRate: { ideal: 8, max: 15 },
          height: { ideal: 1080 },
          width: { ideal: 1920 },
        },
      });

      setCaptureStream(stream);
      setIsLiveCaptureActive(true);
      setState("capturing");
      setMessage("Live detection is running. Keep the YouTube stream visible in the captured tab/window.");

      const [track] = stream.getVideoTracks();
      if (track) {
        track.onended = stopLiveCapture;
      }

      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream;
        await captureVideoRef.current.play();
      }

      intervalRef.current = window.setInterval(() => {
        void sampleLiveFrame();
      }, 6500);
      window.setTimeout(() => void sampleLiveFrame(), 1200);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Screen capture could not be started.");
    }
  };

  const exportDetections = () => {
    const payload = JSON.stringify(
      detections.map(({ thumbnailDataUrl: _thumbnailDataUrl, ...detection }) => detection),
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `stream-detections-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearDetections = () => {
    setDetections([]);
    setEditingId("");
    setFramePreview("");
    setMessage("Stream detection list cleared.");
  };

  const approveDetection = async (detection: StreamDetection) => {
    const match = detection.matches[0];
    const pulledBy = streamPulledBy.trim();

    if (!match?.cardId) {
      setMessage("This stream entry needs a database card match before it can be approved.");
      return;
    }

    if (!pulledBy) {
      setMessage("Enter Pulled by for this stream before approving cards.");
      return;
    }

    const limitation = detection.suggestion.limitation || match.serialNumber;
    setMessage(`Approving ${match.playerName} as pulled by ${pulledBy}.`);

    const response = await fetch("/api/stream-detector/approve", {
      body: JSON.stringify({
        cardId: match.cardId,
        cardImageDataUrl: detection.cardImageDataUrl ?? detection.thumbnailDataUrl,
        limitation,
        pulledBy,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; pull?: { id?: string } }
      | null;

    if (!response.ok) {
      setMessage(result?.error ?? `Could not approve stream pull: ${response.status}`);
      return;
    }

    setDetections((current) =>
      current.map((currentDetection) => (
        currentDetection.id === detection.id
          ? {
              ...currentDetection,
              approvedPullId: result?.pull?.id,
              pulledBy,
              status: "approved",
            }
          : currentDetection
      )),
    );
    setMessage("Stream card approved and written to the card database.");
  };

  const deleteDetection = (id: string) => {
    setDetections((current) => current.filter((detection) => detection.id !== id));
    if (editingId === id) {
      setEditingId("");
    }
    setMessage("Stream card removed from the list.");
  };

  const startEditing = (detection: StreamDetection) => {
    const match = detection.matches[0];
    setEditingId(detection.id);
    setEditDraft({
      cardName: match?.cardName || detection.suggestion.cardName || "",
      limitation: detection.suggestion.limitation || match?.serialNumber || "",
      playerName: match?.playerName || detection.suggestion.playerName || "",
      setName: match?.setName || detection.suggestion.setName || "",
    });
  };

  const saveEditing = (id: string) => {
    setDetections((current) =>
      current.map((detection) => (
        detection.id === id
          ? {
              ...detection,
              suggestion: {
                ...detection.suggestion,
                cardName: editDraft.cardName.trim(),
                limitation: editDraft.limitation.trim(),
                playerName: editDraft.playerName.trim(),
                setName: editDraft.setName.trim(),
              },
            }
          : detection
      )),
    );
    setEditingId("");
    setMessage("Stream card edited locally. Approve it to write the pull to the database.");
  };

  return (
    <section className="stream-detector-shell">
      <div className="stream-detector-main">
        <div className="direct-uploader-hero">
          <p className="eyebrow">Stream Detector</p>
          <h1>YouTube Card Recognition</h1>
          <span className={`detector-state ${state}`}>{state}</span>
        </div>

        <label className="stream-url-field">
          YouTube stream URL
          <input
            value={streamUrl}
            onChange={(event) => {
              setStreamUrl(event.target.value);
              setState(event.target.value.trim() ? "ready" : "idle");
            }}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>

        <label className="stream-url-field">
          Pulled by for this stream
          <input
            value={streamPulledBy}
            onChange={(event) => setStreamPulledBy(event.target.value)}
            placeholder="Breaker, streamer, or collector name"
          />
        </label>

        <label className="stream-url-field">
          Overlay key for auto trigger
          <input
            value={overlayKey}
            onChange={(event) => setOverlayKey(event.target.value)}
            placeholder="Paste key from OBS Studio"
          />
        </label>

        <div className="stream-aspect-toggle" aria-label="Stream frame format">
          <span>Detection frame</span>
          <button
            className={aspectMode === "16:9" ? "active" : ""}
            type="button"
            onClick={() => setAspectMode("16:9")}
          >
            16:9 Stream
          </button>
          <button
            className={aspectMode === "9:16" ? "active" : ""}
            type="button"
            onClick={() => setAspectMode("9:16")}
          >
            9:16 Vertical
          </button>
        </div>

        <div className={`stream-video-frame ${aspectMode === "9:16" ? "vertical" : ""}`}>
          {embedUrl ? (
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              src={embedUrl}
              title="YouTube stream preview"
            />
          ) : (
            <div className="direct-camera-placeholder">YouTube stream preview</div>
          )}
        </div>

        <div className="direct-uploader-status">
          <strong>{message}</strong>
          <span>
            {detections.length} cards in list · {isLiveCaptureActive ? "live on" : "live off"} · overlay{" "}
            {overlayKey.trim() ? "armed" : "off"} · {aspectMode} detection
          </span>
        </div>

        <video className={`stream-capture-preview ${aspectMode === "9:16" ? "vertical" : ""}`} ref={captureVideoRef} muted playsInline />

        <div className="stream-frame-actions">
          {isLiveCaptureActive ? (
            <button type="button" onClick={stopLiveCapture}>
              Stop Live Detection
            </button>
          ) : (
            <button type="button" onClick={startLiveCapture}>
              Start Live Detection
            </button>
          )}
          <label className="stream-frame-upload">
            Analyze stream frame
            <input accept="image/*" type="file" onChange={(event) => analyzeFrame(event.target.files?.[0] ?? null)} />
          </label>
          <button className="secondary-button" type="button" disabled={!detections.length} onClick={exportDetections}>
            Export List
          </button>
          <button className="secondary-button" type="button" disabled={!detections.length} onClick={clearDetections}>
            Clear List
          </button>
        </div>

        {framePreview ? <img className="stream-frame-preview" src={framePreview} alt="Latest analyzed stream frame" /> : null}
      </div>

      <aside className="stream-detection-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recognized cards</p>
            <h2>Stream List</h2>
          </div>
        </div>

        {detections.length ? (
          <div className="stream-detection-items">
            {detections.map((detection) => {
              const match = detection.matches[0];
              const playerName = match?.playerName || detection.suggestion.playerName || "Unknown card";
              const isEditing = editingId === detection.id;
              const detail = [
                match?.setName || detection.suggestion.setName,
                match?.cardName || detection.suggestion.cardName,
                detection.suggestion.limitation || match?.serialNumber,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <article className={`stream-detection-card ${detection.status === "approved" ? "approved" : ""}`} key={detection.id}>
                  <img src={detection.cardImageDataUrl ?? detection.thumbnailDataUrl} alt={`${playerName} card crop`} />
                  <div>
                    <span>
                      {new Date(detection.capturedAt).toLocaleTimeString("de-DE")} · {detection.status === "approved" ? "approved" : "pending"}
                    </span>
                    {isEditing ? (
                      <div className="stream-edit-form">
                        <input
                          value={editDraft.playerName}
                          onChange={(event) => setEditDraft((current) => ({ ...current, playerName: event.target.value }))}
                          placeholder="Player"
                        />
                        <input
                          value={editDraft.setName}
                          onChange={(event) => setEditDraft((current) => ({ ...current, setName: event.target.value }))}
                          placeholder="Set"
                        />
                        <input
                          value={editDraft.cardName}
                          onChange={(event) => setEditDraft((current) => ({ ...current, cardName: event.target.value }))}
                          placeholder="Parallel/Card"
                        />
                        <input
                          value={editDraft.limitation}
                          onChange={(event) => setEditDraft((current) => ({ ...current, limitation: event.target.value }))}
                          placeholder="Numbering"
                        />
                      </div>
                    ) : (
                      <>
                        <strong>{playerName}</strong>
                        <small>{detail || "No card details yet"}</small>
                        <small>Pulled by: {detection.pulledBy || streamPulledBy || "Not set"}</small>
                        <small>Autograph: {detection.suggestion.isAutographed ? "Yes" : "No"}</small>
                        <em>{Math.round(detection.confidence * 100)}% confidence · {detection.matches.length} matches</em>
                        <em>{detection.cardImageDataUrl ? `${aspectMode} frame · 9:16 card crop ready` : "Legacy thumbnail only"}</em>
                      </>
                    )}
                    <div className="stream-detection-actions">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => saveEditing(detection.id)}>
                            Save
                          </button>
                          <button className="secondary-button" type="button" onClick={() => setEditingId("")}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={detection.status === "approved"}
                            onClick={() => void approveDetection(detection)}
                          >
                            {detection.status === "approved" ? "Approved" : "Approve"}
                          </button>
                          <button className="secondary-button" type="button" onClick={() => startEditing(detection)}>
                            Edit
                          </button>
                        </>
                      )}
                      <button className="secondary-button danger-button" type="button" onClick={() => deleteDetection(detection.id)}>
                        Delete
                      </button>
                      {match ? <a href={match.cardUrl}>Open card</a> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">No cards yet</p>
            <h2>No stream detections</h2>
            <p>Analyzed cards from this stream will be collected here locally.</p>
          </div>
        )}
      </aside>
    </section>
  );
}

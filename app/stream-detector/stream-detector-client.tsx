"use client";

import { useEffect, useMemo, useState } from "react";

type StreamDetectionState = "idle" | "ready" | "analyzing" | "matched" | "error";

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
  id: string;
  capturedAt: string;
  confidence: number;
  detectedText: string;
  frameDataUrl: string;
  matches: CardMatch[];
  notes: string;
  suggestion: DetectorSuggestion;
};

const storageKey = "whats-pulled-stream-detections";

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

export function StreamDetectorClient() {
  const [detections, setDetections] = useState<StreamDetection[]>([]);
  const [framePreview, setFramePreview] = useState("");
  const [message, setMessage] = useState("Add a YouTube stream and analyze frames from the break.");
  const [state, setState] = useState<StreamDetectionState>("idle");
  const [streamUrl, setStreamUrl] = useState("");

  const youtubeId = useMemo(() => extractYoutubeId(streamUrl), [streamUrl]);
  const embedUrl = youtubeId ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1` : "";

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as StreamDetection[];
      if (Array.isArray(parsed)) {
        setDetections(parsed);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(detections.slice(0, 60)));
  }, [detections]);

  const analyzeFrame = async (file: File | null) => {
    if (!file) {
      return;
    }

    setState("analyzing");
    setMessage("Analyzing stream frame with Card Detection.");

    try {
      const imageDataUrl = await fileToCompressedDataUrl(file);
      setFramePreview(imageDataUrl);

      const visionResponse = await fetch("/api/detector/vision", {
        body: JSON.stringify({
          detectedText: "",
          imageDataUrl,
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

      const detection: StreamDetection = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        capturedAt: new Date().toISOString(),
        confidence: Math.min(1, Math.max(0, Number(visionResult?.confidence) || 0)),
        detectedText: visionResult?.detectedText ?? "",
        frameDataUrl: imageDataUrl,
        matches,
        notes: visionResult?.notes ?? "",
        suggestion,
      };

      setDetections((current) => [detection, ...current].slice(0, 60));
      setState("matched");
      setMessage(matches.length ? "Frame matched and added to the list." : "Frame added. No database match yet.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Frame could not be analyzed.");
    }
  };

  const exportDetections = () => {
    const payload = JSON.stringify(
      detections.map(({ frameDataUrl: _frameDataUrl, ...detection }) => detection),
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
    setFramePreview("");
    setMessage("Stream detection list cleared.");
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

        <div className="stream-video-frame">
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
          <span>{detections.length} cards in list</span>
        </div>

        <div className="stream-frame-actions">
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
              const detail = [
                match?.setName || detection.suggestion.setName,
                match?.cardName || detection.suggestion.cardName,
                detection.suggestion.limitation || match?.serialNumber,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <article className="stream-detection-card" key={detection.id}>
                  <img src={detection.frameDataUrl} alt={`${playerName} stream frame`} />
                  <div>
                    <span>{new Date(detection.capturedAt).toLocaleTimeString("de-DE")}</span>
                    <strong>{playerName}</strong>
                    <small>{detail || "No card details yet"}</small>
                    <em>{Math.round(detection.confidence * 100)}% confidence · {detection.matches.length} matches</em>
                    {match ? <a href={match.cardUrl}>Open card</a> : null}
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

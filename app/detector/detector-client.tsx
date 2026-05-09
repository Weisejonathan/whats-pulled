"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyLimitationParallelRule } from "@/lib/card-parallels";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type DetectorState = "idle" | "camera-ready" | "scanning" | "posted" | "error";

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

const emptyPayload = {
  playerName: "",
  setName: "",
  cardName: "",
  cardNumber: "",
  limitation: "",
  isAutographed: false,
};

export function DetectorClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const [apiUrl, setApiUrl] = useState("http://localhost:3000");
  const [overlayKey, setOverlayKey] = useState("");
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<DetectorState>("idle");
  const [confidence, setConfidence] = useState(0);
  const [autoSend, setAutoSend] = useState(false);
  const [message, setMessage] = useState("Choose OBS Virtual Camera and start scanning.");
  const [payload, setPayload] = useState(emptyPayload);
  const [matches, setMatches] = useState<CardMatch[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [ocrSnapshot, setOcrSnapshot] = useState("");
  const [detectedText, setDetectedText] = useState("");
  const [textSuggestion, setTextSuggestion] = useState<typeof emptyPayload>(emptyPayload);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [liveSuggest, setLiveSuggest] = useState(true);
  const [notes, setNotes] = useState("");
  const [sampleCount, setSampleCount] = useState(0);
  const [streamStats, setStreamStats] = useState({
    fps: 0,
    height: 0,
    width: 0,
  });
  const frameCountRef = useRef(0);
  const lastStatsAtRef = useRef(Date.now());
  const lastLiveOcrAtRef = useRef(0);
  const ocrBusyRef = useRef(false);

  const canPost = useMemo(
    () => Boolean(overlayKey.trim() && payload.playerName.trim() && payload.setName.trim()),
    [overlayKey, payload.playerName, payload.setName],
  );

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((items) => {
        const cameraDevices = items
          .filter((item) => item.kind === "videoinput")
          .map((item, index) => ({
            deviceId: item.deviceId,
            label: item.label || `Camera ${index + 1}`,
          }));
        setDevices(cameraDevices);
        setSelectedDeviceId((current) => current || cameraDevices[0]?.deviceId || "");
      })
      .catch(() => setMessage("Camera permissions are needed for local detection."));
  }, []);

  useEffect(() => {
    return () => {
      stopScanning();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  useEffect(() => {
    ocrBusyRef.current = ocrBusy;
  }, [ocrBusy]);

  const updatePayload = (key: keyof typeof emptyPayload, value: string | boolean) => {
    setPayload((current) => ({
      ...current,
      [key]: value,
    }));
    setSelectedCardId("");
  };

  const deriveSuggestionFromText = (text: string) => {
    const lines = text
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const joined = lines.join(" ");
    const cleanLines = lines
      .map((line) => line.replace(/[^a-zA-Z0-9/# .'-]/g, "").trim())
      .filter((line) => line.length >= 3);
    const isNameToken = (value: string) =>
      /^[A-Z][A-Z.'-]{2,}$/.test(value) &&
      !/^(ATP|WTA|RC|AUTO|TOPPS|PANINI|MONACO|CHROME|REFRACTOR|ORANGE|RED|BLUE|GREEN|GOLD)$/.test(value);
    const adjacentPlayerLine =
      cleanLines
        .map((line) => line.split(/\s+/).filter(Boolean))
        .find((words, index, groups) => {
          const nextWords = groups[index + 1] ?? [];
          return words.length === 1 && nextWords.length === 1 && isNameToken(words[0]) && isNameToken(nextWords[0]);
        })
        ?.join(" ") ?? "";
    const adjacentPlayerLineIndex = cleanLines.findIndex((line, index) => {
      const words = line.split(/\s+/).filter(Boolean);
      const nextWords = cleanLines[index + 1]?.split(/\s+/).filter(Boolean) ?? [];
      return words.length === 1 && nextWords.length === 1 && isNameToken(words[0]) && isNameToken(nextWords[0]);
    });
    const stackedPlayerLine =
      adjacentPlayerLineIndex >= 0
        ? `${cleanLines[adjacentPlayerLineIndex]} ${cleanLines[adjacentPlayerLineIndex + 1]}`
        : "";
    const likelyPlayerLine =
      cleanLines.find((line) => {
        const words = line.split(/\s+/).filter(Boolean);
        const uppercaseWords = words.filter(isNameToken);
        return uppercaseWords.length >= 2 && line.length <= 34;
      }) ?? "";
    const setLine =
      lines.find((line) => /topps|panini|chrome|prizm|select|optic|bowman|upper deck/i.test(line)) ??
      "";
    const cardLine =
      lines.find((line) => /superfractor|refractor|parallel|auto|autograph|signature|rookie|variation/i.test(line)) ??
      "";
    const playerLine =
      lines.find(
        (line) =>
          !/topps|panini|chrome|refractor|parallel|auto|autograph|signature|#|\/\d+/i.test(line) &&
          /[a-zA-Z]{3,}\s+[a-zA-Z]{3,}/.test(line),
      ) ?? "";
    const serialText = joined
      .replace(/[Il]/g, "1")
      .replace(/[Oo]/g, "0")
      .replace(/\s+/g, " ");
    const limitationMatch =
      serialText.match(/\b(0?\d{1,4})\s*[/|\\]\s*(0?\d{1,4})\b/) ??
      serialText.match(/\b(0?\d{1,4})\s*(?:of|0f)\s*(0?\d{1,4})\b/i);
    const compactSerialMatch = serialText.match(
      /\b(0?[1-9]\d{0,3})(?:\s*[/|\\]\s*|\s*)(888|500|399|299|250|199|150|125|99|75|50|49|25|10|5|1)\b/,
    );
    const cardNumberMatch = joined.match(/(?:#|no\.?\s*)\s*([A-Z]{0,4}\d{1,4}[A-Z]?)/i);
    const normalizeSerialPart = (value: string) => {
      const trimmed = value.replace(/^0+(?=\d)/, "");
      return trimmed || "0";
    };
    const limitation =
      limitationMatch
        ? `${normalizeSerialPart(limitationMatch[1])}/${normalizeSerialPart(limitationMatch[2])}`
        : compactSerialMatch
          ? `${normalizeSerialPart(compactSerialMatch[1])}/${normalizeSerialPart(compactSerialMatch[2])}`
          : "";

    return applyLimitationParallelRule({
      playerName: likelyPlayerLine || stackedPlayerLine || adjacentPlayerLine || playerLine || lines[0] || "",
      setName: setLine,
      cardName: cardLine,
      cardNumber: cardNumberMatch?.[1] ?? "",
      limitation,
      isAutographed: /auto|autograph|signature/i.test(joined),
    });
  };

  const startCamera = async () => {
    stopScanning();
    stream?.getTracks().forEach((track) => track.stop());

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          height: { ideal: 1080 },
          width: { ideal: 1920 },
        },
      });

      setStream(nextStream);
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        await videoRef.current.play();
      }

      setState("camera-ready");
      setMessage("Camera is ready. Start scanning when the card is in frame.");
    } catch {
      setState("error");
      setMessage("Could not open the selected camera.");
    }
  };

  const analyzeFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      return 0;
    }

    const width = 240;
    const height = 160;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return 0;
    }

    frameCountRef.current += 1;
    const now = Date.now();
    if (now - lastStatsAtRef.current > 1000) {
      setStreamStats({
        fps: Math.round((frameCountRef.current * 1000) / (now - lastStatsAtRef.current)),
        height: video.videoHeight,
        width: video.videoWidth,
      });
      frameCountRef.current = 0;
      lastStatsAtRef.current = now;
    }

    context.drawImage(video, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let contrast = 0;
    let brightPixels = 0;

    for (let index = 0; index < data.length; index += 16) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = (red + green + blue) / 3;
      if (luminance > 120) {
        brightPixels += 1;
      }
      contrast += Math.abs(red - green) + Math.abs(green - blue) + Math.abs(blue - red);
    }

    const samples = data.length / 16;
    const brightnessScore = Math.min(1, brightPixels / samples / 0.55);
    const contrastScore = Math.min(1, contrast / samples / 80);
    return Math.min(0.99, brightnessScore * 0.42 + contrastScore * 0.58);
  };

  const enhanceForOcr = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });

    if (!canvas || !context) {
      return "";
    }

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;

    for (let index = 0; index < data.length; index += 4) {
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const boosted = luminance > 142 ? 255 : luminance < 92 ? 0 : Math.min(255, luminance * 1.45);
      data[index] = boosted;
      data[index + 1] = boosted;
      data[index + 2] = boosted;
    }

    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const createOcrCrop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      return "";
    }

    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;
    const cropWidth = Math.round(videoWidth * 0.58);
    const cropHeight = Math.round(videoHeight * 0.92);
    const cropX = Math.round((videoWidth - cropWidth) / 2);
    const cropY = Math.round((videoHeight - cropHeight) / 2);
    const outputWidth = 1200;
    const outputHeight = Math.round((cropHeight / cropWidth) * outputWidth);
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return "";
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
    const fullCardImage = context.getImageData(0, 0, outputWidth, outputHeight);

    const compose = document.createElement("canvas");
    compose.width = 1600;
    compose.height = 2100;
    const composeContext = compose.getContext("2d", { willReadFrequently: true });

    if (!composeContext) {
      return enhanceForOcr();
    }

    composeContext.fillStyle = "white";
    composeContext.fillRect(0, 0, compose.width, compose.height);
    composeContext.imageSmoothingEnabled = true;
    composeContext.imageSmoothingQuality = "high";

    context.putImageData(fullCardImage, 0, 0);
    composeContext.drawImage(
      canvas,
      0,
      0,
      outputWidth,
      outputHeight,
      0,
      0,
      820,
      Math.round((outputHeight / outputWidth) * 820),
    );

    const lowerBandY = Math.round(outputHeight * 0.66);
    const lowerBandHeight = Math.round(outputHeight * 0.3);
    composeContext.drawImage(canvas, 0, lowerBandY, outputWidth, lowerBandHeight, 40, 1020, 1520, 430);

    const nameplateY = Math.round(outputHeight * 0.74);
    const nameplateHeight = Math.round(outputHeight * 0.18);
    composeContext.drawImage(
      canvas,
      0,
      nameplateY,
      Math.round(outputWidth * 0.76),
      nameplateHeight,
      40,
      1500,
      1520,
      420,
    );

    const compositeImage = composeContext.getImageData(0, 0, compose.width, compose.height);
    const data = compositeImage.data;

    for (let index = 0; index < data.length; index += 4) {
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const boosted = luminance > 150 ? 255 : luminance < 82 ? 0 : Math.min(255, luminance * 1.7);
      data[index] = boosted;
      data[index + 1] = boosted;
      data[index + 2] = boosted;
    }

    composeContext.putImageData(compositeImage, 0, 0);
    return compose.toDataURL("image/png");
  };

  const fetchMatchesForSuggestion = async (nextPayload: typeof emptyPayload, text: string) => {
    const response = await fetch("/api/cards/match", {
      body: JSON.stringify({
        ...nextPayload,
        detectedText: text,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { matches: CardMatch[] };
    setMatches(data.matches);
    setSelectedCardId(data.matches[0]?.cardId ?? "");
  };

  const runTextDetection = async (imageDataUrl?: string, options?: { live?: boolean }) => {
    const canvas = canvasRef.current;

    if (!canvas && !imageDataUrl) {
      return "";
    }

    setOcrBusy(true);
    ocrBusyRef.current = true;

    try {
      const { recognize } = await import("tesseract.js");
      const source = imageDataUrl || createOcrCrop() || canvas;
      if (!source) {
        return "";
      }
      const result = await recognize(source, "eng", {
        logger: () => undefined,
      });
      const text = result.data.text.trim();
      const suggestion = deriveSuggestionFromText(text);
      const nextPayload = {
        ...payload,
        playerName: payload.playerName || suggestion.playerName,
        setName: payload.setName || suggestion.setName,
        cardName: payload.cardName || suggestion.cardName,
        cardNumber: payload.cardNumber || suggestion.cardNumber,
        limitation: payload.limitation || suggestion.limitation,
        isAutographed: payload.isAutographed || suggestion.isAutographed,
      };
      setDetectedText(text);
      setTextSuggestion(suggestion);
      setPayload(nextPayload);
      if (text || nextPayload.playerName || nextPayload.setName) {
        await fetchMatchesForSuggestion(nextPayload, text);
      }
      setMessage(
        text
          ? options?.live
            ? "Live suggestion updated from the OBS frame."
            : "OCR finished. Review the suggestion and Neon matches."
          : "OCR finished, but no readable text was found.",
      );
      return text;
    } catch {
      const fallback = [
        payload.playerName,
        payload.setName,
        payload.cardName,
        payload.cardNumber,
        payload.limitation,
        payload.isAutographed ? "Auto" : "",
      ]
        .filter(Boolean)
        .join("\n");
      setDetectedText(fallback);
      setTextSuggestion(deriveSuggestionFromText(fallback));
      setMessage(
        imageDataUrl
          ? "Frame captured. OCR could not read text, so I built a suggestion from the current labels."
          : "OCR could not read text from this frame.",
      );
      return fallback;
    } finally {
      setOcrBusy(false);
      ocrBusyRef.current = false;
    }
  };

  const captureSnapshot = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      setMessage("No active video frame to capture.");
      return;
    }

    const width = Math.min(1280, video.videoWidth || 1280);
    const height = Math.round(width / ((video.videoWidth || 16) / (video.videoHeight || 9)));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const ocrImageDataUrl = createOcrCrop();
    setSnapshot(imageDataUrl);
    setOcrSnapshot(ocrImageDataUrl);
    await runTextDetection(ocrImageDataUrl || imageDataUrl);
  };

  const saveTrainingSample = async () => {
    if (!snapshot) {
      setMessage("Capture a frame first.");
      return;
    }

    const response = await fetch("/api/detector/training-samples", {
      body: JSON.stringify({
        ...payload,
        cardId: selectedCardId || undefined,
        detectedText,
        imageDataUrl: snapshot,
        notes,
        overlayKey,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      setState("error");
      setMessage(`Training sample failed: ${response.status}`);
      return;
    }

    setSampleCount((current) => current + 1);
    setMessage("Training sample saved to Neon.");
  };

  const searchMatches = async () => {
    const response = await fetch("/api/cards/match", {
      body: JSON.stringify({
        ...payload,
        detectedText,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      setState("error");
      setMessage("Could not search Neon card matches.");
      return;
    }

    const data = (await response.json()) as { matches: CardMatch[] };
    setMatches(data.matches);
    setSelectedCardId(data.matches[0]?.cardId ?? "");
    if (!data.matches.length) {
      setTextSuggestion((current) =>
        current.playerName || current.setName || current.cardName ? current : deriveSuggestionFromText(detectedText),
      );
    }
    setMessage(
      data.matches.length
        ? "Review the best Neon match before sending."
        : "No Neon match found. Use the text suggestion or label manually.",
    );
  };

  const selectMatch = (match: CardMatch) => {
    setSelectedCardId(match.cardId);
    setPayload((current) => ({
      ...current,
      cardName: match.cardName,
      cardNumber: match.cardNumber ? String(match.cardNumber) : current.cardNumber,
      playerName: match.playerName,
      setName: match.setName,
    }));
  };

  const useTextSuggestion = () => {
    setPayload((current) => ({
      ...current,
      playerName: textSuggestion.playerName || current.playerName,
      setName: textSuggestion.setName || current.setName,
      cardName: textSuggestion.cardName || current.cardName,
      cardNumber: textSuggestion.cardNumber || current.cardNumber,
      limitation: textSuggestion.limitation || current.limitation,
      isAutographed: current.isAutographed || textSuggestion.isAutographed,
    }));
    setSelectedCardId("");
    setMessage("Text suggestion applied. You can now match Neon or save a training sample.");
  };

  const postRecognition = async (detectedConfidence = confidence) => {
    if (!canPost) {
      setMessage("Overlay key, player and set are required before posting.");
      return;
    }

    const endpoint = `${apiUrl.replace(/\/$/, "")}/api/obs/recognitions/${overlayKey.trim()}`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        ...payload,
        cardId: selectedCardId || undefined,
        confidence: Number(detectedConfidence.toFixed(4)),
        source: "detector-application",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      setState("error");
      setMessage(`Post failed: ${response.status}`);
      return;
    }

    lastSentRef.current = Date.now();
    setState("posted");
    setMessage("Recognition posted to the live overlay.");
  };

  const startScanning = () => {
    if (!stream) {
      setMessage("Start the camera first.");
      return;
    }

    stopScanning();
    setState("scanning");
    setMessage("Scanning frames from the selected video source.");
    intervalRef.current = window.setInterval(() => {
      const score = analyzeFrame();
      setConfidence(score);

      if (liveSuggest && score > 0.48 && !ocrBusyRef.current && Date.now() - lastLiveOcrAtRef.current > 6500) {
        const ocrImageDataUrl = createOcrCrop();
        if (ocrImageDataUrl) {
          setOcrSnapshot(ocrImageDataUrl);
          lastLiveOcrAtRef.current = Date.now();
          runTextDetection(ocrImageDataUrl, { live: true }).catch(() => {
            setMessage("Live suggestion could not read this frame.");
          });
        }
      }

      if (autoSend && score > 0.72 && Date.now() - lastSentRef.current > 4500) {
        postRecognition(score).catch(() => {
          setState("error");
          setMessage("Could not post recognition.");
        });
      }
    }, 650);
  };

  const stopScanning = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <section className="detector-app-shell">
      <div className="detector-preview-panel">
        <div className="detector-toolbar">
          <div>
            <p className="eyebrow">Local detector</p>
            <h1>OBS Card Detection App</h1>
          </div>
          <span className={`detector-state ${state}`}>{state}</span>
        </div>

        <div className="detector-video-frame">
          <video ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="detector-reticle" aria-hidden="true" />
        </div>

        <div className="detector-meter" aria-label="Detection confidence">
          <span style={{ width: `${Math.round(confidence * 100)}%` }} />
        </div>
        <div className="detector-status-row">
          <strong>{Math.round(confidence * 100)}% confidence</strong>
          <span>{message}</span>
        </div>
        <div className="detector-capture-strip">
          <button className="secondary-button" type="button" onClick={captureSnapshot}>
            Capture Frame
          </button>
          <button className="secondary-button" type="button" disabled={ocrBusy} onClick={() => runTextDetection(ocrSnapshot || snapshot)}>
            {ocrBusy ? "Reading..." : "Detect Text"}
          </button>
          <button type="button" onClick={searchMatches}>
            Match Neon
          </button>
        </div>
        <div className="detector-stream-stats" aria-label="OBS stream diagnostics">
          <div>
            <span>Resolution</span>
            <strong>
              {streamStats.width || "-"} x {streamStats.height || "-"}
            </strong>
          </div>
          <div>
            <span>FPS</span>
            <strong>{streamStats.fps || "-"}</strong>
          </div>
          <div>
            <span>Samples</span>
            <strong>{sampleCount}</strong>
          </div>
        </div>
      </div>

      <aside className="detector-control-panel">
        <label>
          Camera source
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Overlay key
          <input
            value={overlayKey}
            onChange={(event) => setOverlayKey(event.target.value)}
            placeholder="from /studio"
          />
        </label>

        <label>
          API URL
          <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
        </label>

        <div className="detector-actions">
          <button type="button" onClick={startCamera}>
            Start Camera
          </button>
          <button className="secondary-button" type="button" onClick={startScanning}>
            Scan
          </button>
        </div>

        <div className="detector-form-grid">
          <label>
            Player
            <input
              value={payload.playerName}
              onChange={(event) => updatePayload("playerName", event.target.value)}
              placeholder="Novak Djokovic"
            />
          </label>
          <label>
            Set
            <input
              value={payload.setName}
              onChange={(event) => updatePayload("setName", event.target.value)}
              placeholder="Topps Chrome Tennis 2025"
            />
          </label>
          <label>
            Card
            <input
              value={payload.cardName}
              onChange={(event) => updatePayload("cardName", event.target.value)}
              placeholder="Superfractor"
            />
          </label>
          <label>
            Number
            <input
              value={payload.cardNumber}
              onChange={(event) => updatePayload("cardNumber", event.target.value)}
              placeholder="1"
            />
          </label>
          <label>
            Limitierung
            <input
              value={payload.limitation}
              onChange={(event) => updatePayload("limitation", event.target.value)}
              placeholder="1/1"
            />
          </label>
          <label className="detector-toggle">
            <input
              checked={payload.isAutographed}
              type="checkbox"
              onChange={(event) => updatePayload("isAutographed", event.target.checked)}
            />
            Autograph
          </label>
        </div>

        <div className="detector-text-panel">
          <div>
            <span>Text detection</span>
            <textarea
              value={detectedText}
              onChange={(event) => {
                const text = event.target.value;
                setDetectedText(text);
                setTextSuggestion(deriveSuggestionFromText(text));
              }}
              placeholder="Detected text from the OBS frame appears here."
            />
          </div>
          <div className="detector-suggestion-card">
            <span>Suggested label</span>
            <strong>{textSuggestion.playerName || payload.playerName || "Unknown player"}</strong>
            <small>{textSuggestion.setName || payload.setName || "Unknown set"}</small>
            <em>
              {[textSuggestion.cardName || payload.cardName, textSuggestion.limitation || payload.limitation]
                .filter(Boolean)
                .join(" · ") || "No card details yet"}
            </em>
            <b className="detector-serial-pill">
              {textSuggestion.limitation || payload.limitation || "No serial detected"}
            </b>
            <button className="secondary-button" type="button" onClick={useTextSuggestion}>
              Use Suggestion
            </button>
          </div>
        </div>

        <div className="detector-actions">
          <button className="secondary-button" type="button" onClick={searchMatches}>
            Match Neon
          </button>
          <button type="button" disabled={!canPost} onClick={() => postRecognition()}>
            Send To Overlay
          </button>
        </div>

        {matches.length ? (
          <div className="detector-match-list" aria-label="Neon card matches">
            {matches.map((match) => (
              <button
                className={match.cardId === selectedCardId ? "selected" : ""}
                key={match.cardId}
                type="button"
                onClick={() => selectMatch(match)}
              >
                <span className="detector-match-thumb">
                  {match.imageUrl ? (
                    <img src={match.imageUrl} alt={`${match.playerName} ${match.cardName}`} />
                  ) : (
                    <b>{match.serialNumber}</b>
                  )}
                </span>
                <span>
                  <strong>{match.playerName}</strong>
                  <small>{match.setName}</small>
                  <em>
                    {match.cardName} · {Math.round(match.score * 100)}%
                  </em>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="detector-training-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Training mode</p>
              <h2>Label OBS Frames</h2>
            </div>
          </div>
          {snapshot ? (
            <img className="detector-snapshot" src={snapshot} alt="Captured training frame" />
          ) : (
            <div className="detector-snapshot empty">No frame captured</div>
          )}
          {ocrSnapshot ? (
            <img className="detector-snapshot ocr" src={ocrSnapshot} alt="OCR crop preview" />
          ) : null}
          <label>
            Training notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="lighting, angle, glare, sleeve, auto visible..."
            />
          </label>
          <div className="detector-actions">
            <button className="secondary-button" type="button" onClick={captureSnapshot}>
              Capture Frame
            </button>
            <button className="secondary-button" type="button" disabled={ocrBusy} onClick={() => runTextDetection(ocrSnapshot || snapshot)}>
              {ocrBusy ? "Reading..." : "Detect Text"}
            </button>
            <button type="button" onClick={saveTrainingSample}>
              Save Sample
            </button>
          </div>
        </div>

        <label className="detector-toggle">
          <input checked={liveSuggest} type="checkbox" onChange={(event) => setLiveSuggest(event.target.checked)} />
          Live suggestions while scanning
        </label>

        <label className="detector-toggle">
          <input checked={autoSend} type="checkbox" onChange={(event) => setAutoSend(event.target.checked)} />
          Auto-send when confidence is high
        </label>
      </aside>
    </section>
  );
}

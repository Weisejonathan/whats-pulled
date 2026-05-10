"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UploadState = "idle" | "camera-ready" | "recording" | "recorded" | "uploading" | "uploaded" | "error";

type UploadIdentification = {
  matches?: Array<{
    cardName: string;
    cardUrl: string;
    playerName: string;
    score: number;
    serialNumber: string;
    setName: string;
  }>;
  suggestion?: {
    cardName?: string;
    limitation?: string;
    playerName?: string;
    setName?: string;
  };
};

const generateVerificationCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = (length: number) =>
    Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  return `WP-${segment(3)}-${segment(3)}`;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function DirectUploaderClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const [cameraMessage, setCameraMessage] = useState("Generate a code, write it on paper, then open the back camera.");
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreviewUrl, setCardImagePreviewUrl] = useState("");
  const [cardDetails, setCardDetails] = useState("");
  const [identification, setIdentification] = useState<UploadIdentification | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [notes, setNotes] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [uploadId, setUploadId] = useState("");
  const [verificationCode, setVerificationCode] = useState(generateVerificationCode);

  const canRecord = Boolean(stream) && state !== "recording" && state !== "uploading";
  const canUpload = Boolean(recordedBlob) && state !== "recording" && state !== "uploading";
  const recordedSize = recordedBlob?.size ?? 0;

  const supportedMimeType = useMemo(() => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return "";
    }

    for (const mimeType of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    return "";
  }, []);

  useEffect(
    () => () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (cardImagePreviewUrl) {
        URL.revokeObjectURL(cardImagePreviewUrl);
      }
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
      }
    },
    [cardImagePreviewUrl, previewUrl, stream],
  );

  const resetCode = () => {
    setVerificationCode(generateVerificationCode());
    setState((current) => (current === "uploaded" ? "idle" : current));
    setIdentification(null);
    setUploadId("");
  };

  const startCamera = async () => {
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: "environment" },
          height: { ideal: 1280 },
          width: { ideal: 720 },
        },
      });

      setStream(nextStream);
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        await videoRef.current.play();
      }
      setState("camera-ready");
      setCameraMessage("Back camera is open. Show the handwritten code clearly before the card.");
    } catch (error) {
      setState("error");
      setCameraMessage(error instanceof Error ? error.message : "Camera could not be opened.");
    }
  };

  const startRecording = () => {
    if (!stream) {
      setCameraMessage("Open the camera first.");
      return;
    }

    chunksRef.current = [];
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    const recorder = new MediaRecorder(stream, {
      ...(supportedMimeType ? { mimeType: supportedMimeType } : {}),
      videoBitsPerSecond: 700_000,
    });
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || supportedMimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setDurationMs(Date.now() - startedAtRef.current);
      setPreviewUrl(url);
      setRecordedBlob(blob);
      setState("recorded");
      setCameraMessage("Recording ready. Add a card image, then upload the verification.");
    };

    recorder.start(1000);
    setState("recording");
    setCameraMessage("Recording. Keep the code, card front, serial number and surface visible. It stops after 20 seconds.");
    stopTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
        recorderRef.current = null;
      }
    }, 20_000);
  };

  const stopRecording = () => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const compressCardImage = async (file: File) =>
    new Promise<File>((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        const maxSide = 1000;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Could not prepare card image."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not compress card image."));
              return;
            }

            resolve(new File([blob], `${verificationCode.toLowerCase()}-card.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.7,
        );
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Card image could not be loaded."));
      };
      image.src = url;
    });

  const chooseCardImage = async (file: File | null) => {
    if (cardImagePreviewUrl) {
      URL.revokeObjectURL(cardImagePreviewUrl);
    }

    if (!file) {
      setCardImageFile(null);
      setCardImagePreviewUrl("");
      return;
    }

    try {
      const compressed = await compressCardImage(file);
      setCardImageFile(compressed);
      setCardImagePreviewUrl(URL.createObjectURL(compressed));
      setCameraMessage(`Card image ready (${formatBytes(compressed.size)}). Upload the verification when the video also looks good.`);
    } catch (error) {
      setCardImageFile(null);
      setCardImagePreviewUrl("");
      setCameraMessage(error instanceof Error ? error.message : "Card image could not be prepared.");
    }
  };

  const uploadRecording = async () => {
    if (!recordedBlob) {
      setCameraMessage("Record a verification video first.");
      return;
    }

    if (!cardImageFile) {
      setCameraMessage("Add the card image first. The upload needs both video and image.");
      return;
    }

    const formData = new FormData();
    const extension = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    formData.set("verificationCode", verificationCode);
    formData.set("cardDetails", cardDetails);
    formData.set("durationMs", String(durationMs));
    formData.set("notes", notes);
    formData.set("video", recordedBlob, `${verificationCode.toLowerCase()}.${extension}`);
    formData.set("cardImage", cardImageFile, `${verificationCode.toLowerCase()}-card.${cardImageFile.name.split(".").pop() ?? "jpg"}`);

    setState("uploading");
    setIdentification(null);
    setCameraMessage("Uploading proof and identifying the card with Card Detection.");

    const response = await fetch("/api/direct-uploader", {
      body: formData,
      method: "POST",
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; identification?: UploadIdentification; uploaded?: { id?: string } }
      | null;

    if (!response.ok) {
      setState("error");
      setCameraMessage(result?.error ?? `Upload failed: ${response.status}`);
      return;
    }

    setUploadId(result?.uploaded?.id ?? "");
    setIdentification(result?.identification ?? null);
    setState("uploaded");
    setCameraMessage(
      result?.identification?.matches?.length
        ? "Verification uploaded. Card Detection matched the uploaded card image."
        : "Verification uploaded. Admin can review the proof; Card Detection found no database match yet.",
    );
  };

  return (
    <section className="direct-uploader-shell">
      <div className="direct-uploader-main">
        <div className="direct-uploader-hero">
          <p className="eyebrow">Own Direct Uploader</p>
          <h1>Live Verification Upload</h1>
          <span className={`detector-state ${state}`}>{state}</span>
        </div>

        <div className="verification-code-panel">
          <span>Write this code on paper</span>
          <strong>{verificationCode}</strong>
          <button className="secondary-button" type="button" onClick={resetCode}>
            New Code
          </button>
        </div>

        <div className="direct-camera-frame">
          <video ref={videoRef} muted playsInline />
          {!stream ? <div className="direct-camera-placeholder">Back camera preview</div> : null}
          <div className="direct-code-badge">{verificationCode}</div>
        </div>

        <div className="direct-uploader-status">
          <strong>{cameraMessage}</strong>
          <span>{recordedBlob ? `${formatBytes(recordedSize)} · ${(durationMs / 1000).toFixed(1)}s` : "No video recorded yet"}</span>
        </div>

        {previewUrl ? (
          <video className="direct-video-preview" src={previewUrl} controls playsInline />
        ) : null}

        {cardImagePreviewUrl ? (
          <img className="direct-card-image-preview" src={cardImagePreviewUrl} alt="Uploaded card proof preview" />
        ) : null}

        {identification ? (
          <div className="direct-identification-panel">
            <span>Card Detection Result</span>
            <strong>{identification.suggestion?.playerName || identification.matches?.[0]?.playerName || "Unknown card"}</strong>
            <p>
              {[
                identification.suggestion?.setName || identification.matches?.[0]?.setName,
                identification.suggestion?.cardName || identification.matches?.[0]?.cardName,
                identification.suggestion?.limitation || identification.matches?.[0]?.serialNumber,
              ]
                .filter(Boolean)
                .join(" · ") || "No database match yet"}
            </p>
          </div>
        ) : null}
      </div>

      <aside className="direct-uploader-controls">
        <label>
          Card details
          <input
            value={cardDetails}
            onChange={(event) => setCardDetails(event.target.value)}
            placeholder="Player, parallel, serial number..."
          />
        </label>
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Condition, sleeve, lighting, ownership context..."
          />
        </label>
        <label>
          Card image after verification
          <input
            accept="image/*"
            capture="environment"
            type="file"
            onChange={(event) => chooseCardImage(event.target.files?.[0] ?? null)}
          />
        </label>

        <div className="direct-uploader-actions">
          <button type="button" onClick={startCamera}>
            Open Back Camera
          </button>
          <button className="secondary-button" type="button" disabled={!canRecord} onClick={startRecording}>
            Start Recording
          </button>
          <button className="secondary-button" type="button" disabled={state !== "recording"} onClick={stopRecording}>
            Stop
          </button>
          <button type="button" disabled={!canUpload} onClick={uploadRecording}>
            Upload Proof
          </button>
        </div>

        <div className="direct-uploader-checklist">
          <span>Verification shot list</span>
          <b>1. Show handwritten code</b>
          <b>2. Show card front</b>
          <b>3. Show serial number / limitierung</b>
          <b>4. Tilt once for foil and surface</b>
          <b>5. Upload a clean card image</b>
        </div>

        {uploadId ? (
          <div className="direct-upload-success">
            <span>Upload ID</span>
            <strong>{uploadId}</strong>
          </div>
        ) : null}
      </aside>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UploadState = "idle" | "camera-ready" | "recording" | "recorded" | "uploading" | "uploaded" | "error";

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
  const [cameraMessage, setCameraMessage] = useState("Generate a code, write it on paper, then open the back camera.");
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreviewUrl, setCardImagePreviewUrl] = useState("");
  const [cardDetails, setCardDetails] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [notes, setNotes] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [uploadId, setUploadId] = useState("");
  const [verificationCode, setVerificationCode] = useState(generateVerificationCode);

  const canRecord = Boolean(stream) && state !== "recording" && state !== "uploading";
  const canUpload = Boolean(recordedBlob) && Boolean(cardImageFile) && state !== "recording" && state !== "uploading";
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
    },
    [cardImagePreviewUrl, previewUrl, stream],
  );

  const resetCode = () => {
    setVerificationCode(generateVerificationCode());
    setState((current) => (current === "uploaded" ? "idle" : current));
    setUploadId("");
  };

  const startCamera = async () => {
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: "environment" },
          height: { ideal: 1920 },
          width: { ideal: 1080 },
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

    const recorder = new MediaRecorder(stream, supportedMimeType ? { mimeType: supportedMimeType } : undefined);
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
      setCameraMessage("Recording ready. Review it, then upload the verification.");
    };

    recorder.start(1000);
    setState("recording");
    setCameraMessage("Recording. Keep the code, card front, serial number and surface visible.");
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const chooseCardImage = (file: File | null) => {
    if (cardImagePreviewUrl) {
      URL.revokeObjectURL(cardImagePreviewUrl);
    }

    if (!file) {
      setCardImageFile(null);
      setCardImagePreviewUrl("");
      return;
    }

    setCardImageFile(file);
    setCardImagePreviewUrl(URL.createObjectURL(file));
    setCameraMessage("Card image ready. Upload the verification when the video also looks good.");
  };

  const uploadRecording = async () => {
    if (!recordedBlob) {
      setCameraMessage("Record a verification video first.");
      return;
    }

    if (!cardImageFile) {
      setCameraMessage("Upload a card image before submitting the verification.");
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
    setCameraMessage("Uploading verification video and card image.");

    const response = await fetch("/api/direct-uploader", {
      body: formData,
      method: "POST",
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; uploaded?: { id?: string } }
      | null;

    if (!response.ok) {
      setState("error");
      setCameraMessage(result?.error ?? `Upload failed: ${response.status}`);
      return;
    }

    setUploadId(result?.uploaded?.id ?? "");
    setState("uploaded");
    setCameraMessage("Verification uploaded. Admin can review the video and card image together.");
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

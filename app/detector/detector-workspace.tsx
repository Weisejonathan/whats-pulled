"use client";

import { useEffect, useRef, useState } from "react";
import { imageFileCanvas, inspectFrame, prepareCapture } from "@/lib/detector/capture";
import { UploadRetry } from "@/lib/detector/upload-retry";
import { DetectorGuide } from "./detector-guide";
import { FieldProof } from "./field-proof";
import { CardSessionTracker } from "@/lib/detector/card-session";
import { AutomaticReviewQueue } from "@/lib/detector/automatic-review";
import { pendingCardGroups, refreshReviewCards, upsertReviewCard } from "@/lib/detector/review-state";
import { cacheCatalog, cachedCatalog } from "@/lib/detector/catalog-cache";
import { liveOcr } from "@/lib/detector/live-ocr";
import { readLocalEvidence, readVisionEvidence, chooseFrameReading, needsAiReview, type LocalReading } from "@/lib/detector/local-evidence";
import { StableFrameTracker } from "@/lib/detector/frame-tracker";
import { loadPendingFrames, removePendingFrame, savePendingFrame, type PendingObservation } from "@/lib/detector/outbox";
import { parallelColorHints } from "@/lib/detector/visual-evidence";
import { normalizeLabel, parseSerial, type CardEvidence } from "@/lib/detector/matching";
import type { DetectorObservation, DetectorSet } from "@/lib/detector/types";

async function jsonRequest<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store", signal: AbortSignal.timeout(8000) } : {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(35_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed. Please retry.");
  return result as T;
}

function youtubeEmbed(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? url.pathname.slice(1) : ["youtube.com", "m.youtube.com"].includes(host)
      ? url.searchParams.get("v") || url.pathname.match(/^\/(?:live|shorts|embed)\/([^/]+)/)?.[1] : "";
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}

export function DetectorWorkspace({ mode: initialMode }: { mode: "camera" | "screen" }) {
  const [mode, setMode] = useState(initialMode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const mediaRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tracker = useRef(new StableFrameTracker<HTMLCanvasElement>());
  const cardSession = useRef(new CardSessionTracker());
  const captureSessionId = useRef("");
  const trackObservations = useRef(new Map<string, string>());
  const lastReadComplete = useRef(false);
  const automaticReviews = useRef(new AutomaticReviewQueue());
  const reviewAliases = useRef(new Map<string, string>());
  const analyzing = useRef(false);
  const aiBusy = useRef(false);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { revision: number; suggestion: CardEvidence; notes: string }>>({});
  const [readerReady, setReaderReady] = useState(false);
  const [automaticAi, setAutomaticAi] = useState(true);
  const [scanStatus, setScanStatus] = useState("Start capture to read a card.");
  const uploadRetry = useRef(new UploadRetry());
  const outboxRef = useRef<PendingObservation[]>([]);
  const recoveredIds = useRef(new Set<string>());
  const [liveFrameId, setLiveFrameId] = useState("");
  const [liveReading, setLiveReading] = useState<LocalReading | null>(null);
  const busyIds = useRef(new Set<string>());
  const mounted = useRef(true);
  const [sets, setSets] = useState<DetectorSet[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [printRuns, setPrintRuns] = useState<number[]>([]);
  const [setId, setSetId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [overlayKey, setOverlayKey] = useState("");
  const [pulledBy, setPulledBy] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [running, setRunning] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("Select the set and year, then start capture or upload a frame.");
  const [observations, setObservations] = useState<DetectorObservation[]>([]);
  const observationsRef = useRef<DetectorObservation[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [outbox, setOutbox] = useState<PendingObservation[]>([]);
  const [preview, setPreview] = useState("");
  const [filter, setFilter] = useState("pending");
  const [hasLegacy, setHasLegacy] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<CardEvidence>({});
  const [busy, setBusy] = useState<string[]>([]);
  const [focus, setFocus] = useState({ x: 25, y: 10, width: 50, height: 80 });
  const config = useRef({ setId, sets, players, printRuns, sourceUrl, overlayKey, focus, automaticAi, outboxCount: outbox.length });
  const videoEmbed = mode === "screen" ? youtubeEmbed(sourceUrl) : null;
  useEffect(() => { config.current = { setId, sets, players, printRuns, sourceUrl, overlayKey, focus, automaticAi, outboxCount: outbox.length }; }, [setId, sets, players, printRuns, sourceUrl, overlayKey, focus, automaticAi, outbox.length]);

  useEffect(() => { observationsRef.current = observations; }, [observations]);
  const upsert = (observation: DetectorObservation) => setObservations(current => upsertReviewCard(current, observation, reviewAliases.current));
  async function refresh() {
    const atRequest = new Map(observationsRef.current.map(item => [item.id, item.revision]));
    const result = await jsonRequest<{ observations: DetectorObservation[]; isAdmin: boolean; merged?: Array<{ id: string; mergedIntoId: string }> }>("/api/detector/observations");
    if (mounted.current) {
      for (const alias of result.merged ?? []) reviewAliases.current.set(alias.id, alias.mergedIntoId);
      setObservations(current => refreshReviewCards(current, result.observations, atRequest, reviewAliases.current));
      setIsAdmin(result.isAdmin); setQueueReady(true);
    }
  }
  async function synchronize(frame: PendingObservation) {
    if (busyIds.current.has(frame.id)) return;
    uploadRetry.current.start(frame.id, Date.now());
    busyIds.current.add(frame.id); setBusy([...busyIds.current]);
    try {
      const result = await jsonRequest<{ observation: DetectorObservation }>("/api/detector/observations", frame);
      upsert(result.observation);
      if (typeof frame.trackId === "string") trackObservations.current.set(frame.trackId, result.observation.id);
      setLiveFrameId(current => current === frame.id ? result.observation.id : current);
      await removePendingFrame(frame.id);
      uploadRetry.current.done(frame.id); recoveredIds.current.delete(frame.id);
      outboxRef.current = outboxRef.current.filter(item => item.id !== frame.id);
      setOutbox(current => current.filter(item => item.id !== frame.id));
      setMessage(result.observation.status === "approved" ? "This card is already approved. The additional proof was saved." : (result.observation.payload.group?.seenCount ?? 1) > 1 ? "Additional view added to the same card. Review one combined suggestion below." : "Saved. Check the suggestion below and approve the correct card.");
      return result.observation;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Your frame is retained for retry."); }
    finally { busyIds.current.delete(frame.id); setBusy([...busyIds.current]); }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      captureSessionId.current = sessionStorage.getItem("detector-capture-session") || crypto.randomUUID();
      sessionStorage.setItem("detector-capture-session", captureSessionId.current);
    } catch { captureSessionId.current = crypto.randomUUID(); }
    // Download once while the operator chooses the source and checklist.
    void liveOcr.warm().catch(() => undefined);
    try { setHasLegacy(Boolean(window.localStorage.getItem("whats-pulled-stream-detections"))); } catch { /* Recovery storage may be disabled. */ }
    const cached = cachedCatalog();
    if (cached) { setSets(cached.sets); setPlayers(cached.players); }
    void jsonRequest<{ sets: DetectorSet[]; players: string[]; printRuns?: number[] }>("/api/detector/catalog")
      .then(data => { cacheCatalog(data); if (mounted.current) { setSets(data.sets); setPlayers(data.players); } })
      .catch(error => setMessage(error.message));
    void refresh().catch(() => setMessage("The server review queue is unavailable. Local captures will be retained for retry."));
    void loadPendingFrames().then(frames => {
      if (mounted.current) { frames.forEach(frame => recoveredIds.current.add(frame.id)); setOutbox(current => [...current, ...frames.filter(frame => !current.some(item => item.id === frame.id))]); setQueueReady(true); }
    }).catch(() => { if (mounted.current) { setQueueReady(true); setMessage("Browser recovery storage is unavailable. Keep this tab open until uploads finish."); } });
    void navigator.mediaDevices?.enumerateDevices().then(items => setDevices(items.filter(item => item.kind === "videoinput"))).catch(() => undefined);
    return () => { mounted.current = false; liveOcr.dispose(); if (timerRef.current) clearInterval(timerRef.current); mediaRef.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  const synchronizeRef = useRef(synchronize);
  useEffect(() => { synchronizeRef.current = synchronize; outboxRef.current = outbox; });
  useEffect(() => {
    if (!queueReady) return;
    const retry = () => {
      if (!navigator.onLine || analyzing.current || busyIds.current.size) return;
      const frame = outboxRef.current.find(item => (item.model || recoveredIds.current.has(item.id)) && uploadRetry.current.ready(item.id, Date.now()));
      if (frame) void synchronizeRef.current(frame);
    };
    const online = () => { uploadRetry.current.online(); retry(); };
    const timer = setInterval(retry, 2000);
    window.addEventListener("online", online);
    return () => { clearInterval(timer); window.removeEventListener("online", online); };
  }, [queueReady]);
  useEffect(() => {
    const reload = () => { void refresh().catch(() => undefined); };
    window.addEventListener("detector-queue-updated", reload);
    return () => window.removeEventListener("detector-queue-updated", reload);
  }, []);
  useEffect(() => {
    if (!setId) return;
    tracker.current.reset(); cardSession.current.reset(tracker.current.presentationId());
    let cancelled = false;
    setReaderReady(false);
    const cached = cachedCatalog(setId);
    setPlayers(cached?.players ?? []);
    setPrintRuns(cached?.printRuns ?? []);
    const catalog = jsonRequest<{ sets: DetectorSet[]; players: string[]; printRuns?: number[] }>("/api/detector/catalog?setId=" + encodeURIComponent(setId))
      .then(data => { cacheCatalog(data, setId); if (!cancelled) { setPlayers(data.players); setPrintRuns(data.printRuns ?? []); } })
      .catch(() => { if (!cancelled) setMessage(cached ? "Using the cached checklist while the server is unavailable." : "The checklist could not load; names will need review."); });
    const warm = liveOcr.warm().catch(() => { if (!cancelled) setMessage("Local reader could not load. AI review and manual review remain available."); });
    void Promise.all([warm, cached ? Promise.resolve() : catalog]).then(() => { if (!cancelled) setReaderReady(true); });
    return () => { cancelled = true; };
  }, [setId]);

  async function analyze(source: HTMLCanvasElement, alternative?: HTMLCanvasElement) {
    if (!queueReady || !readerReady) { setMessage("The local reader and review queue are still loading."); return false; }
    // Live frames never wait behind old recognition requests.
    if (analyzing.current) return false;
    const settings = config.current;
    if (settings.outboxCount >= 8) { setMessage("Recognition paused: eight frames await upload. The live preview stays on. Retry uploads to resume automatically."); return false; }
    const selectedSet = settings.sets.find(item => item.id === settings.setId);
    if (!selectedSet) { setMessage("Select the set and year first."); return false; }
    analyzing.current = true; lastReadComplete.current = false; setWorking(true);
    const started = performance.now();
    const capturedAt = new Date().toISOString();
    const frameSample = inspectFrame(source);
    const presentation = tracker.current.presentationId();
    try {
      const { ocrCanvas, ...capture } = prepareCapture(source, false, false);
      setPreview(capture.imageDataUrl);
      setLiveReading(null); setScanStatus("Reading the card…");
      setMessage("Reading the card locally…");
      const frame: PendingObservation = {
        id: crypto.randomUUID(), capturedAt, imageDataUrl: capture.imageDataUrl,
        sessionId: captureSessionId.current || (captureSessionId.current = crypto.randomUUID()), frameQuality: frameSample.quality,
        suggestion: { setId: selectedSet.id, setName: selectedSet.name },
        sourceUrl: settings.sourceUrl, overlayKey: settings.overlayKey,
        notes: "Recognition has not completed; review manually if interrupted.",
      };
      setLiveFrameId(frame.id);
      setOutbox(current => [frame, ...current]);
      const retained = savePendingFrame(frame).catch(() => setMessage("Local recovery storage is full. Keep this tab open until upload finishes."));
      let reading: LocalReading;
      try {
        const readSample = async (canvas: HTMLCanvasElement, budget: number) => {
          const result = await liveOcr.read(canvas, { players: settings.players, printRuns: settings.printRuns }, budget);
          const reading = result.data.vision ? readVisionEvidence(result.data.vision, settings.players, { printRuns: settings.printRuns })
            : readLocalEvidence(result.data.text, settings.players, result.data.confidence);
          const pixels = result.data.vision?.cardImage;
          let cardCanvas = canvas;
          if (pixels) {
            cardCanvas = Object.assign(document.createElement("canvas"), { width: pixels.width, height: pixels.height });
            cardCanvas.getContext("2d")!.putImageData(pixels, 0, 0);
          }
          return { reading, cardCanvas, rectified: Boolean(result.data.vision?.quad) };
        };
        let selected = await readSample(ocrCanvas, 1700 - (performance.now() - started));
        if (alternative && (!selected.reading.suggestion.playerName || !selected.reading.suggestion.limitation)
          && performance.now() - started < 1050) {
          try {
            const second = await readSample(alternative, 1700 - (performance.now() - started));
            const choice = chooseFrameReading(selected.reading, second.reading);
            selected = { ...(choice.index ? second : selected), reading: choice.reading };
            if (choice.index) frame.imageDataUrl = alternative.toDataURL("image/jpeg", .9);
          } catch {
            selected.reading.notes += " A second frame could not finish within the live budget.";
            if (mounted.current) {
              setReaderReady(false);
              void liveOcr.warm().then(() => { if (mounted.current) setReaderReady(true); }).catch(() => { if (mounted.current) setReaderReady(true); });
            }
          }
        }
        reading = selected.reading;
        const prepared = prepareCapture(selected.cardCanvas, false, false);
        capture.imageDataUrl = prepared.imageDataUrl; capture.detailImageDataUrl = prepared.detailImageDataUrl;
        capture.rectified = selected.rectified;
        // Persist precisely the pixels used for this result, including the
        // selected frame and any perspective correction.
        frame.imageDataUrl = capture.imageDataUrl;
        if (mounted.current) setPreview(capture.imageDataUrl);
      } catch (error) {
        reading = readLocalEvidence("", settings.players, 0);
        reading.notes = error instanceof Error ? error.message : "Local reading failed. Review this frame manually or with AI.";
        // A timed-out worker is replaced before the next capture is accepted.
        if (mounted.current) {
          setReaderReady(false);
          void liveOcr.warm().then(() => { if (mounted.current) setReaderReady(true); }).catch(() => { if (mounted.current) setReaderReady(true); });
        }
      }
      reading.suggestion = { ...reading.suggestion, setId: selectedSet.id, setName: selectedSet.name };
      const decision = cardSession.current.observe({ reading, now: Date.now(), pixels: frameSample.pixels, visualFingerprint: reading.visualFingerprint, presentation, quality: frameSample.quality });
      frame.trackId = decision.trackId;
      lastReadComplete.current = decision.complete;
      reading.durationMs = Math.round(performance.now() - started);
      Object.assign(frame, reading);
      if (mounted.current) { setLiveReading(reading); setScanStatus(decision.complete ? "Name and serial read. Check the combined suggestion below." : "Looking for a clearer name or serial. Further views improve the same card."); }
      await retained;
      if (!decision.shouldPersist) {
        setLiveFrameId(trackObservations.current.get(decision.trackId) || "");
        await removePendingFrame(frame.id);
        setOutbox(current => current.filter(item => item.id !== frame.id));
        return true;
      }
      await savePendingFrame(frame).catch(() => undefined);
      if (mounted.current) {
        setOutbox(current => current.map(item => item.id === frame.id ? { ...frame } : item));
        // Storage/network latency must not hold the local recognition lock.
        // Save local evidence immediately. AI is a separate, revision-bound suggestion.
        void synchronize(frame).then(saved => {
          if (saved && mounted.current && settings.automaticAi && needsAiReview(reading)) automaticReviews.current.schedule(saved, Date.now());
        });
      }
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Frame preparation failed."); return false; }
    finally { analyzing.current = false; if (mounted.current) setWorking(false); }
  }

  async function reviewWithAi(item: DetectorObservation, imageSource = item.imageUrl) {
    if (aiBusy.current || busyIds.current.has(item.id)) return;
    aiBusy.current = true; setAiWorking(true);
    setMessage("AI is reviewing the selected frame. Live local recognition continues.");
    try {
      const response = await fetch(imageSource, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("The proof image could not be loaded.");
      const source = await imageFileCanvas(new File([await response.blob()], "card.webp"));
      const { ocrCanvas: _, ...capture } = prepareCapture(source, false);
      const result = await jsonRequest<{ suggestion: CardEvidence; notes: string }>("/api/detector/vision", {
        ...capture, setId: item.payload.suggestion.setId, detectedText: item.payload.detectedText,
      });
      if (!mounted.current) return;
      setAiSuggestions(current => ({ ...current, [item.id]: { revision: item.revision, ...result } }));
      setMessage("AI suggestion ready. Choose Use AI suggestion on that card to review it. " + result.notes);
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "AI review failed; local results are retained."); }
    finally {
      aiBusy.current = false;
      if (mounted.current) setAiWorking(false);
    }
  }
  useEffect(() => {
    automaticReviews.current.reconcile(observations, Date.now());
    if (!automaticAi) return;
    const timer = setInterval(() => {
      if (!mounted.current || aiBusy.current) return;
      const item = automaticReviews.current.take(Date.now());
      if (item && !reviewAliases.current.has(item.id)) void reviewWithAi(item, item.imageUrl);
    }, 400);
    return () => clearInterval(timer);
  }, [automaticAi, observations]);
  const analyzeRef = useRef(analyze);
  useEffect(() => { analyzeRef.current = analyze; });

  function captureSource() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const box = config.current.focus;
    const sx = video.videoWidth * box.x / 100, sy = video.videoHeight * box.y / 100;
    const sw = video.videoWidth * Math.min(box.width, 100 - box.x) / 100;
    const sh = video.videoHeight * Math.min(box.height, 100 - box.y) / 100;
    const scale = Math.min(1, 1400 / Math.max(sw, sh));
    const result = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) });
    result.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, result.width, result.height);
    return result;
  }
  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    mediaRef.current?.getTracks().forEach(track => { track.onended = null; track.stop(); }); mediaRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    tracker.current.reset(); cardSession.current.reset(tracker.current.presentationId()); setRunning(false); setScanStatus("Capture stopped. The last reading is retained.");
  }
  async function start() {
    if (startingRef.current) return;
    if (!queueReady) { setMessage("The browser review queue is still loading. Please wait or press Refresh."); return; }
    if (!setId || !readerReady) { setMessage("Select a set and wait for the local reader to load."); return; }
    startingRef.current = true; setStarting(true);
    try {
      stop();
      const media = mode === "screen" ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
        : await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      mediaRef.current = media;
      media.getVideoTracks()[0].onended = () => {
        if (mediaRef.current !== media) return;
        stop(); setMessage("The video source ended sharing. Start capture to reconnect; saved frames are retained.");
      };
      if (videoRef.current) { videoRef.current.srcObject = media; await videoRef.current.play(); }
      if (!mounted.current || mediaRef.current !== media) return;
      setRunning(true); setScanStatus("Waiting for video frames…"); setMessage("Capture is running. Place one card inside the focus area and hold it steady briefly.");
      timerRef.current = setInterval(() => {
        // Backpressure pauses recognition, never the preview or screen-sharing permission.
        const source = captureSource(); if (!source) { setScanStatus("Waiting for video frames. Check that the shared tab is playing."); return; }
        const sample = inspectFrame(source);
        const uploadsPaused = config.current.outboxCount >= 8;
        const candidate = tracker.current.push(sample, Date.now(), !analyzing.current && !uploadsPaused);
        if (uploadsPaused) { setScanStatus("Uploads are being retried. Recognition resumes when space is available."); return; }
        if (analyzing.current) return;
        if (!candidate) { setScanStatus(!sample.usable ? "Image is too dark, blurred or reflective. Adjust the focus area or use Capture now." : tracker.current.status()); return; }
        void analyzeRef.current(candidate.value, tracker.current.alternative()?.value).then(success => tracker.current.complete(candidate, success, Date.now(), lastReadComplete.current));
      }, 80);
    } catch (error) { stop(); setMessage(error instanceof DOMException && error.name === "InvalidStateError" ? "Bring this tab to the foreground, then click Start capture and choose your video tab." : error instanceof Error ? error.message : "Capture could not be started."); }
    finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }
  async function approve(item: DetectorObservation) {
    const candidate = item.payload.matches.find(match => match.cardId === item.selectedCardId)
      ?? (item.payload.matches.length === 1 ? item.payload.matches[0] : null);
    if (!candidate || !pulledBy.trim() || busyIds.current.has(item.id)) return;
    busyIds.current.add(item.id); setBusy([...busyIds.current]);
    try {
      // Clicking Approve is the explicit catalog selection; the server still checks
      // ownership, revision, serial, conflicts and duplicate pulls on both requests.
      let current = item;
      if (!current.selectedCardId) {
        current = (await jsonRequest<{ observation: DetectorObservation }>(`/api/detector/observations/${item.id}`,
          { action: "select", cardId: candidate.cardId, revision: item.revision }, "PATCH")).observation;
        upsert(current);
      }
      const result = await jsonRequest<{ observation: DetectorObservation }>(`/api/detector/observations/${item.id}`,
        { action: "approve", pulledBy, revision: current.revision }, "PATCH");
      upsert(result.observation); setMessage("Approved — pull saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Approval failed. Please review the card."); }
    finally { busyIds.current.delete(item.id); setBusy([...busyIds.current]); }
  }

  async function action(observation: DetectorObservation, body: Record<string, unknown>) {
    if (busyIds.current.has(observation.id)) return;
    busyIds.current.add(observation.id); setBusy([...busyIds.current]);
    try {
      const result = await jsonRequest<{ observation: DetectorObservation }>("/api/detector/observations/" + observation.id, { ...body, revision: observation.revision }, "PATCH");
      if (body.action === "merge") {
        reviewAliases.current.set(observation.id, result.observation.id);
        setLiveFrameId(current => current === observation.id ? result.observation.id : current);
      }
      upsert(result.observation); setEditingId("");
      setMessage(result.observation.overlayError || (body.action === "approve" ? "Pull approved and saved." : "Review queue updated."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed."); await refresh().catch(() => undefined); }
    finally { busyIds.current.delete(observation.id); setBusy([...busyIds.current]); }
  }
  function exportResults() {
    const blob = new Blob([JSON.stringify(observations, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "whatspulled-detector-review.json"; a.click(); URL.revokeObjectURL(url);
  }
  async function importLegacy() {
    try {
      const saved = JSON.parse(window.localStorage.getItem("whats-pulled-stream-detections") || "[]") as Array<Record<string, unknown>>;
      const ids = JSON.parse(window.localStorage.getItem("detector-legacy-import-ids") || "{}") as Record<string, string>;
      if (!Array.isArray(saved)) throw new Error("Legacy list is unreadable; it has not been changed.");
      for (const entry of saved.slice(0, 25)) {
        if (entry.status === "approved" || entry.approvedPullId) continue;
        const suggestion = entry.suggestion as CardEvidence | undefined;
        const set = sets.find(candidate => candidate.name === suggestion?.setName);
        const imageDataUrl = entry.cardImageDataUrl || entry.thumbnailDataUrl;
        if (!set || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) continue;
        const oldId = String(entry.id);
        ids[oldId] ||= crypto.randomUUID();
        window.localStorage.setItem("detector-legacy-import-ids", JSON.stringify(ids));
        const frame: PendingObservation = { id: ids[oldId], capturedAt: String(entry.capturedAt), imageDataUrl, suggestion: { ...suggestion, setId: set.id }, notes: "Imported from the legacy device list. Check identity and image quality before confirming." };
        await savePendingFrame(frame);
        setOutbox(current => [frame, ...current.filter(item => item.id !== frame.id)]);
        await synchronize(frame);
      }
      setHasLegacy(false);
      setMessage("Eligible unapproved legacy frames were imported for review. Existing approved pulls and the original device list were left unchanged.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Legacy import could not finish. The original list is unchanged."); }
  }

  const liveObservation = observations.find(item => item.id === liveFrameId);
  const liveAi = liveObservation && aiSuggestions[liveFrameId]?.revision === liveObservation.revision ? aiSuggestions[liveFrameId] : undefined;
  const displayedEvidence = liveAi?.suggestion ?? liveObservation?.payload.suggestion ?? liveReading?.suggestion;
  const displayedColor = liveObservation?.payload.color ?? liveReading?.color;
  const pendingGroups = pendingCardGroups(outbox);

  return <section className="detector-review-workspace detector-v2">
    <header className="section-heading"><div><p className="eyebrow">WHATS PULLED / DETECTOR 03</p><h1>Show a card. Make it count.</h1><p>Choose your source. Review the suggestion. Approve the pull.</p></div><span className="detector-version">One card · one approval</span></header>
    <section className="detector-setup" aria-label="Capture settings">
      <div className="detector-source-switch" role="group" aria-label="Video source">
        <button aria-pressed={mode === "camera"} disabled={starting} onClick={() => { if (mode !== "camera") { stop(); setMode("camera"); } }}>Webcam</button>
        <button aria-pressed={mode === "screen"} disabled={starting} onClick={() => { if (mode !== "screen") { stop(); setMode("screen"); } }}>Stream / screen</button>
      </div>
      <div className="detector-primary-fields">
        <label>Set and year<select value={setId} disabled={running || working || starting} onChange={event => setSetId(event.target.value)}><option value="">Select a catalog set</option>{sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
        <label>Pulled by<input value={pulledBy} onChange={event => setPulledBy(event.target.value)} placeholder="Breaker or collector" /></label>
        {mode === "camera" && <label>Camera<select value={deviceId} disabled={running || starting} onChange={event => setDeviceId(event.target.value)}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
      </div>
    </section>
    <section className="detector-live-panel" aria-label="Live preview">
      <div className="detector-live-bar"><span className={running ? "detector-live-dot active" : "detector-live-dot"} /><strong>{running ? outbox.length >= 8 ? "Live · recognition paused" : working ? "Live · reading card" : "Live · ready for next card" : starting ? "Connecting…" : "Preview"}</strong><span>{liveReading ? `${liveReading.durationMs} ms · last reading` : "Local recognition"}</span></div>
      <div className="detector-video-stage"><video ref={videoRef} muted playsInline />{!running && <div className="detector-capture-placeholder"><strong>{mode === "camera" ? "Your table. Your cards." : "Bring your stream into view."}</strong><span>{mode === "camera" ? "Connect a webcam or OBS Virtual Camera to get started." : "Start capture and choose the tab or window playing your stream."}</span></div>}<div className="detector-focus-outline" hidden={!running} style={{ left: `${focus.x}%`, top: `${focus.y}%`, width: `${Math.min(focus.width, 100 - focus.x)}%`, height: `${Math.min(focus.height, 100 - focus.y)}%` }}>Keep one card here</div></div>
      <div className="stream-frame-actions">
        <button disabled={starting || (!running && (!queueReady || !setId || !readerReady || working))} onClick={() => running ? stop() : void start()}>{starting ? "Connecting…" : running ? "Stop capture" : "Start capture"}</button>
        <button className="secondary-button" disabled={!running || working} onClick={() => { tracker.current.reset(); cardSession.current.reset(tracker.current.presentationId()); setLiveReading(null); setLiveFrameId(""); setScanStatus("Ready for a different card."); }}>Different card</button>
        <button className="secondary-button" disabled={!running || working || outbox.length >= 8} onClick={() => { const frame = captureSource(); if (frame) void analyze(frame); }}>Capture now</button>
        <label className="stream-frame-upload">Upload frame<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!queueReady || !setId || !readerReady || working || outbox.length >= 8} onChange={event => { const file = event.target.files?.[0]; if (file) void imageFileCanvas(file).then(analyze).catch(error => setMessage(error.message)); event.target.value = ""; }} /></label>
      </div>
      <p className="detector-readiness" role="status">{!setId ? "Select your set to start." : !readerReady ? "Preparing the reader…" : running ? "Keep the name and serial visible. New cards are captured automatically." : "Ready — start capture or upload a photo."}</p>
      {running && outbox.length >= 8 && <p role="status">Recognition paused — eight frames await upload. Your live preview remains active. Retry uploads below; recognition resumes automatically.</p>}
    </section>
    <section className="detector-instant detector-reading" aria-label="Latest local recognition" aria-live="polite">
      {liveReading && preview && <img src={preview} alt="Latest captured card" />}
      <div><small>{liveAi ? "AI suggestion — review required" : working ? "Reading now" : liveReading ? "Latest detected card" : "Detected fields"}</small>
        <p className="detector-scan-status">{liveAi ? "Compare this AI suggestion with the proof before using it." : running || liveReading ? scanStatus : "Start capture and select the video tab. Detected fields will appear here."}</p>
        <h2>{displayedEvidence?.playerName || (liveReading ? "Full name unreadable" : working ? "Reading name…" : "Waiting for a card")}</h2>
        {!liveAi && liveReading?.fields?.name === "catalog" && <p className="detector-review-note">Surname read; full name supplied by the checklist. Check the printed first name.</p>}
        <dl className="detector-fields">
          <div><dt>Full name</dt><dd>{displayedEvidence?.playerName || "Not read yet"}</dd></div>
          <div><dt>Serial / numbering</dt><dd>{displayedEvidence?.limitation || "Not readable / not visible"}</dd></div>
          <div><dt>Checklist number</dt><dd>{displayedEvidence?.cardNumber || "Not readable / not visible"}</dd></div>
          <div><dt>Autograph</dt><dd>{displayedEvidence?.isAutographed === true ? "yes" : displayedEvidence?.isAutographed === false ? "no" : "needs visual review"}</dd></div>
          <div><dt>Color hint</dt><dd>{displayedColor && displayedColor.label !== "unknown" ? displayedColor.label : "Not established"}</dd></div>
        </dl>
        {liveObservation?.payload.group && <p className="detector-group-count">{liveObservation.payload.group.seenCount} views · one card</p>}
        {displayedColor && <p className="detector-review-note">{displayedColor.reason}</p>}
        {liveAi && <p className="detector-review-note">{liveAi.notes}</p>}
        {liveReading && <><p>Local OCR · Serial: {liveReading.suggestion.limitation || "unreadable"} · {liveReading.durationMs} ms · preliminary result</p><details><summary>Reading details</summary><p>{liveReading.notes}</p><pre className="detector-ocr-text">{liveReading.detectedText || "No readable text in this frame."}</pre></details></>}
      </div>
    </section>
    <details className="detector-options"><summary>Settings & help</summary>
      <div className="detector-review-settings">
        <label>Source / video URL<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://www.youtube.com/watch?..." /><small>Optional evidence link; start capture to share the video.</small></label>
        <label>Overlay key (optional)<input value={overlayKey} onChange={event => setOverlayKey(event.target.value)} placeholder="From OBS Studio" /></label>
      </div>
      <label className="detector-ai-option"><input type="checkbox" checked={automaticAi} onChange={event => setAutomaticAi(event.target.checked)} /> Use AI for uncertain readings (suggestions arrive separately)</label>
      <details><summary>Adjust focus area</summary><div className="detector-review-settings">{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key}<input type="range" min={key === "x" || key === "y" ? 0 : 10} max={key === "x" || key === "y" ? 85 : 100} value={focus[key]} onChange={event => { tracker.current.reset(); cardSession.current.reset(tracker.current.presentationId()); setFocus(current => ({ ...current, [key]: Number(event.target.value) })); }} /></label>)}</div></details>
      <DetectorGuide mode={mode} />
      <p>{isAdmin ? "Admin access: all review entries are visible." : "Your review queue belongs to this browser. Keep its cookies and local storage."}</p>
      {videoEmbed && <details><summary>YouTube preview</summary><iframe src={videoEmbed} title="YouTube source preview" allow="encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} /></details>}
      {hasLegacy && <button className="secondary-button" disabled={!queueReady || !sets.length || working} onClick={() => void importLegacy()}>Import unapproved frames from the old device list</button>}
      <button className="secondary-button" onClick={exportResults}>Export results</button>
    </details>
    <p className="detector-review-message" role="status" aria-live="polite">{message}</p>
    {aiWorking && <p role="status">AI review is running for one frame. Local suggestions are already available.</p>}
    {pendingGroups.length > 0 && <section className="detector-outbox"><h2>Waiting to sync ({pendingGroups.length})</h2><p>Additional views stay together. Uploads retry automatically; your local proof is retained.</p>{pendingGroups.map(group => <div key={group.id}><img src={group.latest.imageDataUrl} alt="Unsynced card frame" /><span>{group.frames.length} views · {new Date(group.latest.capturedAt).toLocaleString()}</span><button disabled={group.frames.some(frame => busy.includes(frame.id)) || working} onClick={() => { void (async () => { for (const frame of group.frames) await synchronize(frame); })(); }}>Retry upload</button></div>)}</section>}
    <header className="section-heading"><h2>Suggestions <small>{observations.filter(item => item.status === "pending").length}</small></h2><div className="stream-frame-actions"><select aria-label="Filter review queue" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">Needs review</option><option value="approved">Approved</option><option value="rejected">Rejected / withdrawn</option><option value="all">All</option></select><button className="secondary-button" onClick={() => void refresh().catch(error => setMessage(error.message))}>Refresh</button></div></header>
    <p className="detector-queue-help">Check the name, full serial and autograph. Approve the matching card; correct any missing details first.</p>
    <datalist id="detector-players">{players.map(player => <option key={player} value={player} />)}</datalist>
    <div className="detector-review-items">{observations.filter(item => filter === "all" || item.status === filter).map(item => {
      const evidence = item.payload.suggestion;
      const colorHints = parallelColorHints(item.payload.color, evidence.setId || "", item.payload.matches);
      const mergeChoices = observations.filter(other => {
        if (other.id === item.id || !["pending", "approved"].includes(other.status)) return false;
        const candidate = other.payload.suggestion;
        for (const field of ["setId", "playerName", "cardName", "cardNumber"] as const) {
          if (evidence[field] && candidate[field] && normalizeLabel(evidence[field]) !== normalizeLabel(candidate[field])) return false;
        }
        const left = parseSerial(evidence.limitation), right = parseSerial(candidate.limitation);
        return !(left && right && (left.total !== right.total || left.copy !== null && right.copy !== null && left.copy !== right.copy));
      });
      const selected = item.payload.matches.find(match => match.cardId === item.selectedCardId) ?? (item.payload.matches.length === 1 ? item.payload.matches[0] : undefined);
      const serial = parseSerial(evidence.limitation);
      const canApprove = Boolean(selected && serial && (serial.copy !== null || serial.total === 1) && pulledBy.trim());
      const isEditing = editingId === item.id;
      const ai = aiSuggestions[item.id]?.revision === item.revision ? aiSuggestions[item.id] : undefined;
      return <article className="detector-review-item" key={item.id}>
        <div className="detector-proof-pair"><figure><a href={item.imageUrl} target="_blank" rel="noreferrer"><img src={item.thumbnailUrl} alt="Captured proof image" loading="lazy" /></a><figcaption>Captured card — click for full size</figcaption></figure>{selected?.imageUrl && <figure><img src={selected.imageUrl} alt="Selected catalog reference" loading="lazy" /><figcaption>Catalog reference</figcaption></figure>}</div>
        <div><small>{new Date(item.capturedAt).toLocaleString()} · {item.status}</small><h3>{evidence.playerName || "Player unreadable"}</h3><p>{evidence.setName} · {evidence.cardName || "Variant unknown"} · {evidence.limitation || "Serial unknown"}</p>
          {item.payload.group && <p className="detector-group-count">{item.payload.group.seenCount} views · one card · one approval</p>}
          {item.payload.color && item.payload.color.label !== "unknown" && <p>Color hint: <strong>{item.payload.color.label}</strong> · {item.payload.color.reason}</p>}
          {colorHints.length > 0 && <p className="detector-review-note">Possible parallels by color: {colorHints.join(" · ")}. Check the pattern before selecting.</p>}
          {item.payload.evidence && <div className="detector-field-proofs"><FieldProof label="Name" evidence={item.payload.evidence.name} /><FieldProof label="Serial" evidence={item.payload.evidence.serial} /></div>}
          {item.payload.nameSource === "catalog" && <p className="detector-review-note">Surname read; full name supplied by the checklist. Check the printed first name.</p>}
          {ai && <aside className="detector-ai-result" aria-label="AI suggestion"><strong>AI suggestion — review required</strong><p>{ai.suggestion.playerName || "Full name unreadable"} · {ai.suggestion.limitation || "Serial unknown"} · Autograph: {ai.suggestion.isAutographed === true ? "yes" : ai.suggestion.isAutographed === false ? "no" : "needs visual review"}</p><p>{ai.notes}</p></aside>}
          {item.payload.notes && <details><summary>Recognition details</summary><p className="detector-review-note">{item.payload.notes}</p></details>}
          {isEditing ? <div className="detector-review-settings">
            <label>Player<input list="detector-players" value={draft.playerName || ""} onChange={event => setDraft(current => ({ ...current, playerName: event.target.value }))} /></label>
            <label>Set<select value={draft.setId || ""} onChange={event => { const set = sets.find(candidate => candidate.id === event.target.value); setDraft(current => ({ ...current, setId: set?.id, setName: set?.name })); }}><option value="">Select set</option>{sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
            <label>Variant<input value={draft.cardName || ""} onChange={event => setDraft(current => ({ ...current, cardName: event.target.value }))} /></label>
            <label>Checklist number<input value={draft.cardNumber ?? ""} onChange={event => setDraft(current => ({ ...current, cardNumber: event.target.value }))} /></label>
            <label>Full serial (copy / print run)<input value={draft.limitation || ""} placeholder="18/25" onChange={event => setDraft(current => ({ ...current, limitation: event.target.value }))} /></label>
            <label>Autograph<select value={draft.isAutographed === true ? "yes" : draft.isAutographed === false ? "no" : "unknown"} onChange={event => setDraft(current => ({ ...current, isAutographed: event.target.value === "unknown" ? null : event.target.value === "yes" }))}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div> : <p>Checklist #{evidence.cardNumber || "unknown"} · Autograph: {evidence.isAutographed === null || evidence.isAutographed === undefined ? "unknown" : evidence.isAutographed ? "yes" : "no"}</p>}
          {item.status === "pending" && !isEditing && item.payload.matches.length !== 1 && <fieldset className="detector-candidates"><legend>Select the catalog card you have checked</legend>{item.payload.matches.length ? item.payload.matches.map(match => <label key={match.cardId}><input type="radio" name={item.id} checked={item.selectedCardId === match.cardId} disabled={busy.includes(item.id)} onChange={() => void action(item, { action: "select", cardId: match.cardId })} /><span>{match.playerName} · {match.parallel || match.cardName} · {match.serialNumber}<small>{match.cardName} · Checklist #{match.cardNumber ?? "unknown"}</small><small>Supported: {match.evidence.join(", ") || "none"}. Still unread: {match.missing.join(", ") || "none"}.</small></span></label>) : <p>No compatible catalog card. Correct the unreadable details and search again.</p>}</fieldset>}
          {item.status === "pending" && !isEditing && selected && <p className="detector-approval-target">Approve as: <strong>{selected.playerName} · {selected.parallel || selected.cardName} · {selected.serialNumber}</strong></p>}
          {item.status === "pending" && !isEditing && !canApprove && <p className="detector-review-note">{!pulledBy.trim() ? "Enter Pulled by above to approve." : !serial || (serial.copy === null && serial.total !== 1) ? "Enter the full serial in Correct details before approving." : "Select a matching catalog card before approving."}</p>}
          {item.status === "pending" && mergeChoices.length > 0 && <details className="detector-merge"><summary>Combine duplicate</summary><p>Use this only for another view of the same physical card. Both proof histories are retained.</p><label>Existing card<select value={mergeTargets[item.id] || ""} onChange={event => setMergeTargets(current => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose the matching entry</option>{mergeChoices.map(other => <option key={other.id} value={other.id}>{other.payload.suggestion.playerName || "Unreadable name"} · {other.payload.suggestion.limitation || "Serial unknown"} · {new Date(other.capturedAt).toLocaleTimeString()} · {other.status}</option>)}</select></label><button className="secondary-button" disabled={busy.includes(item.id) || !mergeChoices.some(other => other.id === mergeTargets[item.id])} onClick={() => { const target = mergeChoices.find(other => other.id === mergeTargets[item.id]); if (target) void action(item, { action: "merge", targetId: target.id, targetRevision: target.revision }); }}>Combine into one card</button></details>}
          <div className="stream-detection-actions">
            {item.status === "pending" && (isEditing ? <><button disabled={busy.includes(item.id)} onClick={() => void action(item, { action: "edit", suggestion: draft })}>Save and rematch</button><button className="secondary-button" onClick={() => setEditingId("")}>Cancel</button></> : <><button disabled={busy.includes(item.id) || !canApprove} onClick={() => void approve(item)}>Approve</button><button className="secondary-button" disabled={aiWorking || busy.includes(item.id)} onClick={() => {
              const cached = aiSuggestions[item.id];
              if (cached?.revision === item.revision) { setDraft(cached.suggestion); setEditingId(item.id); setMessage(cached.notes || "Check the AI suggestion before saving."); }
              else void reviewWithAi(item);
            }}>{aiSuggestions[item.id]?.revision === item.revision ? "Use AI suggestion" : "AI review"}</button><button className="secondary-button" disabled={busy.includes(item.id)} onClick={() => { setDraft({ ...evidence }); setEditingId(item.id); }}>Correct details</button></>)}
            {item.status !== "rejected" && <button className="secondary-button" disabled={busy.includes(item.id)} onClick={() => { if (item.status !== "approved" || window.confirm("Withdraw this approved pull? Its proof and review history will be retained.")) void action(item, { action: "reject" }); }}>{item.status === "approved" ? "Withdraw pull" : "Reject"}</button>}
            {item.overlayError && <button className="secondary-button" disabled={busy.includes(item.id)} onClick={() => void action(item, { action: "retry-overlay" })}>Retry overlay</button>}
            {selected && <a href={selected.cardUrl}>Open catalog card</a>}
          </div>{item.overlayError && <p role="alert">{item.overlayError}</p>}
        </div>
      </article>;
    })}</div>
    {!observations.some(item => filter === "all" || item.status === filter) && <p className="empty-state">No entries in this view. Captured cards will appear here for review.</p>}
  </section>;
}

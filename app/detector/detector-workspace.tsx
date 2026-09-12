"use client";

import { useEffect, useRef, useState } from "react";
import { imageFileCanvas, inspectFrame, prepareCapture } from "@/lib/detector/capture";
import { DetectorGuide } from "./detector-guide";
import { cacheCatalog, cachedCatalog } from "@/lib/detector/catalog-cache";
import { liveOcr } from "@/lib/detector/live-ocr";
import { readLocalEvidence, readVisionEvidence, chooseFrameReading, needsAiReview, mergeAiReading, type LocalReading } from "@/lib/detector/local-evidence";
import { StableFrameTracker } from "@/lib/detector/frame-tracker";
import { loadPendingFrames, removePendingFrame, savePendingFrame, type PendingObservation } from "@/lib/detector/outbox";
import type { CardEvidence } from "@/lib/detector/matching";
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

export function DetectorWorkspace({ mode }: { mode: "camera" | "screen" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const mediaRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tracker = useRef(new StableFrameTracker<HTMLCanvasElement>());
  const analyzing = useRef(false);
  const aiBusy = useRef(false);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { revision: number; suggestion: CardEvidence; notes: string }>>({});
  const [readerReady, setReaderReady] = useState(false);
  const [automaticAi, setAutomaticAi] = useState(true);
  const latestFrameId = useRef("");
  const [liveReading, setLiveReading] = useState<LocalReading | null>(null);
  const busyIds = useRef(new Set<string>());
  const mounted = useRef(true);
  const [sets, setSets] = useState<DetectorSet[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
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
  const [queueReady, setQueueReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [outbox, setOutbox] = useState<PendingObservation[]>([]);
  const [preview, setPreview] = useState("");
  const [filter, setFilter] = useState("pending");
  const [hasLegacy, setHasLegacy] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<CardEvidence>({});
  const [busy, setBusy] = useState<string[]>([]);
  const [focus, setFocus] = useState({ x: 25, y: 10, width: 50, height: 80 });
  const config = useRef({ setId, sets, players, sourceUrl, overlayKey, focus, automaticAi, outboxCount: outbox.length });
  const videoEmbed = mode === "screen" ? youtubeEmbed(sourceUrl) : null;
  useEffect(() => { config.current = { setId, sets, players, sourceUrl, overlayKey, focus, automaticAi, outboxCount: outbox.length }; }, [setId, sets, players, sourceUrl, overlayKey, focus, automaticAi, outbox.length]);

  const upsert = (observation: DetectorObservation) => setObservations(current =>
    [observation, ...current.filter(item => item.id !== observation.id)].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)));
  async function refresh() {
    const result = await jsonRequest<{ observations: DetectorObservation[]; isAdmin: boolean }>("/api/detector/observations");
    if (mounted.current) { setObservations(result.observations); setIsAdmin(result.isAdmin); setQueueReady(true); }
  }
  async function synchronize(frame: PendingObservation) {
    if (busyIds.current.has(frame.id)) return;
    busyIds.current.add(frame.id); setBusy([...busyIds.current]);
    try {
      const result = await jsonRequest<{ observation: DetectorObservation }>("/api/detector/observations", frame);
      upsert(result.observation);
      await removePendingFrame(frame.id);
      setOutbox(current => current.filter(item => item.id !== frame.id));
      setMessage("Frame saved to the review queue. Select the correct catalog card before approving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Your frame is retained for retry."); }
    finally { busyIds.current.delete(frame.id); setBusy([...busyIds.current]); }
  }
  useEffect(() => {
    mounted.current = true;
    try { setHasLegacy(Boolean(window.localStorage.getItem("whats-pulled-stream-detections"))); } catch { /* Recovery storage may be disabled. */ }
    const cached = cachedCatalog();
    if (cached) { setSets(cached.sets); setPlayers(cached.players); }
    void jsonRequest<{ sets: DetectorSet[]; players: string[] }>("/api/detector/catalog")
      .then(data => { cacheCatalog(data); if (mounted.current) { setSets(data.sets); setPlayers(data.players); } })
      .catch(error => setMessage(error.message));
    void refresh().catch(() => setMessage("The server review queue is unavailable. Local captures will be retained for retry."));
    void loadPendingFrames().then(frames => {
      if (mounted.current) { setOutbox(current => [...current, ...frames.filter(frame => !current.some(item => item.id === frame.id))]); setQueueReady(true); }
    }).catch(() => { if (mounted.current) { setQueueReady(true); setMessage("Browser recovery storage is unavailable. Keep this tab open until uploads finish."); } });
    void navigator.mediaDevices?.enumerateDevices().then(items => setDevices(items.filter(item => item.kind === "videoinput"))).catch(() => undefined);
    return () => { mounted.current = false; liveOcr.dispose(); if (timerRef.current) clearInterval(timerRef.current); mediaRef.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    const reload = () => { void refresh().catch(() => undefined); };
    window.addEventListener("detector-queue-updated", reload);
    return () => window.removeEventListener("detector-queue-updated", reload);
  }, []);
  useEffect(() => {
    if (!setId) return;
    let cancelled = false;
    setReaderReady(false);
    const cached = cachedCatalog(setId);
    setPlayers(cached?.players ?? []);
    const catalog = jsonRequest<{ sets: DetectorSet[]; players: string[] }>("/api/detector/catalog?setId=" + encodeURIComponent(setId))
      .then(data => { cacheCatalog(data, setId); if (!cancelled) setPlayers(data.players); })
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
    analyzing.current = true; setWorking(true);
    const started = performance.now();
    const capturedAt = new Date().toISOString();
    try {
      const { ocrCanvas, ...capture } = prepareCapture(source, false);
      setPreview(capture.imageDataUrl);
      setLiveReading(null);
      setMessage("Reading the card locally…");
      const frame: PendingObservation = {
        id: crypto.randomUUID(), capturedAt, imageDataUrl: capture.imageDataUrl,
        suggestion: { setId: selectedSet.id, setName: selectedSet.name },
        sourceUrl: settings.sourceUrl, overlayKey: settings.overlayKey,
        notes: "Recognition has not completed; review manually if interrupted.",
      };
      latestFrameId.current = frame.id;
      setOutbox(current => [frame, ...current]);
      const retained = savePendingFrame(frame).catch(() => setMessage("Local recovery storage is full. Keep this tab open until upload finishes."));
      let reading: LocalReading;
      try {
        const readSample = async (canvas: HTMLCanvasElement, budget: number) => {
          const result = await liveOcr.read(canvas, { players: settings.players }, budget);
          const reading = result.data.vision ? readVisionEvidence(result.data.vision, settings.players)
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
        const prepared = prepareCapture(selected.cardCanvas, false);
        capture.imageDataUrl = prepared.imageDataUrl; capture.detailImageDataUrl = prepared.detailImageDataUrl;
        capture.rectified = selected.rectified;
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
      reading.durationMs = Math.round(performance.now() - started);
      Object.assign(frame, reading);
      if (mounted.current) setLiveReading(reading);
      await retained;
      await savePendingFrame(frame).catch(() => undefined);
      if (mounted.current) {
        setOutbox(current => current.map(item => item.id === frame.id ? { ...frame } : item));
        // Storage/network latency must not hold the local recognition lock.
        if (settings.automaticAi && needsAiReview(reading) && !aiBusy.current) {
          void enrichFrame(frame, capture);
        } else {
          void synchronize(frame);
        }
      }
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Frame preparation failed."); return false; }
    finally { analyzing.current = false; if (mounted.current) setWorking(false); }
  }

  async function enrichFrame(frame: PendingObservation, capture: { imageDataUrl: string; detailImageDataUrl: string }) {
    // One optional provider call, no cloud backlog. Other cards keep their local results.
    aiBusy.current = true; setAiWorking(true);
    busyIds.current.add(frame.id); setBusy([...busyIds.current]);
    try {
      const result = await jsonRequest<LocalReading>("/api/detector/vision", {
        ...capture, setId: (frame.suggestion as CardEvidence).setId, detectedText: frame.detectedText,
      });
      const merged = mergeAiReading(frame as unknown as LocalReading, result);
      Object.assign(frame, merged);
      if (mounted.current && latestFrameId.current === frame.id) setLiveReading(merged);
    } catch (error) {
      frame.notes = String(frame.notes ?? "") + " AI review: " + (error instanceof Error ? error.message : "unavailable");
    } finally {
      await savePendingFrame(frame).catch(() => undefined);
      busyIds.current.delete(frame.id);
      aiBusy.current = false;
      if (mounted.current) {
        setAiWorking(false); setBusy([...busyIds.current]);
        setOutbox(current => current.map(item => item.id === frame.id ? { ...frame } : item));
        void synchronize(frame);
      }
    }
  }

  async function reviewWithAi(item: DetectorObservation) {
    if (aiBusy.current || busyIds.current.has(item.id)) return;
    aiBusy.current = true; setAiWorking(true);
    busyIds.current.add(item.id); setBusy([...busyIds.current]);
    setMessage("AI is reviewing the selected frame. Live local recognition continues.");
    try {
      const response = await fetch(item.imageUrl, { signal: AbortSignal.timeout(10_000) });
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
      aiBusy.current = false; busyIds.current.delete(item.id);
      if (mounted.current) { setAiWorking(false); setBusy([...busyIds.current]); }
    }
  }
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
    tracker.current.reset(); setRunning(false);
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
      setRunning(true); setMessage("Capture is running. Place one card inside the focus area and hold it steady briefly.");
      timerRef.current = setInterval(() => {
        // Backpressure pauses recognition, never the preview or screen-sharing permission.
        if (analyzing.current || config.current.outboxCount >= 8) return;
        const source = captureSource(); if (!source) return;
        const candidate = tracker.current.push(inspectFrame(source), Date.now());
        if (!candidate) return;
        void analyzeRef.current(candidate.value, tracker.current.alternative()?.value).then(success => tracker.current.complete(candidate, success, Date.now()));
      }, 120);
    } catch (error) { stop(); setMessage(error instanceof Error ? error.message : "Capture could not be started."); }
    finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }
  async function action(observation: DetectorObservation, body: Record<string, unknown>) {
    if (busyIds.current.has(observation.id)) return;
    busyIds.current.add(observation.id); setBusy([...busyIds.current]);
    try {
      const result = await jsonRequest<{ observation: DetectorObservation }>("/api/detector/observations/" + observation.id, { ...body, revision: observation.revision }, "PATCH");
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

  return <section className="detector-review-workspace">
    <header className="section-heading"><div><p className="eyebrow">{mode === "screen" ? "Stream" : "Camera / OBS"} detector</p><h1>Live card detector</h1></div><a href={mode === "screen" ? "/detector" : "/stream-detector"}>{mode === "screen" ? "Switch to camera" : "Switch to screen capture"}</a></header>
    <DetectorGuide mode={mode} />
    <section className="detector-setup" aria-labelledby="detector-setup-heading">
    <h2 id="detector-setup-heading">Capture settings</h2>
    <div className="detector-review-settings">
      <label>Set and year<select value={setId} disabled={running || working} onChange={event => setSetId(event.target.value)}><option value="">Select a catalog set</option>{sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select><small>Required before capture. Match the set printed on your card.</small></label>
      <label>Pulled by<input value={pulledBy} onChange={event => setPulledBy(event.target.value)} placeholder="Breaker or collector" /><small>Required to confirm a pull; you can fill this in later.</small></label>
      <label>Source / video URL<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://www.youtube.com/watch?..." /><small>Optional link saved as evidence. Choose the video separately when starting capture.</small></label>
      <label>Overlay key (optional)<input value={overlayKey} onChange={event => setOverlayKey(event.target.value)} placeholder="From OBS Studio" /><small>Optional. Sends confirmed pulls to your OBS session.</small></label>
      {mode === "camera" && <label>Camera<select value={deviceId} disabled={running} onChange={event => setDeviceId(event.target.value)}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
    </div>
    <label className="detector-ai-option"><input type="checkbox" checked={automaticAi} onChange={event => setAutomaticAi(event.target.checked)} /> Use AI for uncertain readings (slower; local capture continues)</label>
    </section>
    <p className="detector-readiness" role="status">{!setId ? "Select a set to prepare the reader." : !readerReady ? "Loading reader…" : working ? "Reading the current card…" : running ? "Live capture active" : "Reader ready — start capture or upload a photo."}</p>
    {setId && !readerReady && <p role="status">Preparing local recognition models. The first download may take a moment; later starts use the browser cache.</p>}
    {running && outbox.length >= 8 && <p role="status">Recognition paused — eight frames await upload. Your live preview remains active. Retry uploads below; recognition resumes automatically.</p>}
    {aiWorking && <p role="status">AI review is running for one frame. Other cards are read locally.</p>}
    <p className="detector-review-message" role="status" aria-live="polite">{message}</p>
    <p>{isAdmin ? "Admin access: all review entries are visible." : "No login required. Your review queue belongs to this browser; keep its cookies to retain access."}</p>
    {videoEmbed && <details><summary>YouTube preview</summary><iframe src={videoEmbed} title="YouTube source preview" allow="encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} /></details>}
    {hasLegacy && <button className="secondary-button" disabled={!queueReady || !sets.length || working} onClick={() => void importLegacy()}>Import unapproved frames from the old device list</button>}
    <div className="detector-review-capture">
      <div><div className="detector-video-stage"><video ref={videoRef} muted playsInline />{!running && <div className="detector-capture-placeholder"><strong>Your live image appears here</strong><span>Start capture to choose a source, or use Upload frame for a single photo.</span></div>}<div className="detector-focus-outline" hidden={!running} style={{ left: `${focus.x}%`, top: `${focus.y}%`, width: `${Math.min(focus.width, 100 - focus.x)}%`, height: `${Math.min(focus.height, 100 - focus.y)}%` }}>Focus area</div></div>
      <details><summary>Adjust focus area</summary><div className="detector-review-settings">{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key}<input type="range" min={key === "x" || key === "y" ? 0 : 10} max={key === "x" || key === "y" ? 85 : 100} value={focus[key]} onChange={event => { tracker.current.reset(); setFocus(current => ({ ...current, [key]: Number(event.target.value) })); }} /></label>)}</div></details></div>
      {preview ? <figure><img src={preview} alt="Card image used for recognition" /><figcaption>Actual recognition image</figcaption></figure> : <aside className="detector-preview-empty"><h3>Recognition preview</h3><p>Your captured card and its reading will appear here. Keep the entire card visible, including its bottom edge.</p><p>Nothing is published until you confirm it in the review queue.</p></aside>}
    </div>
    <div className="stream-frame-actions">
      <button disabled={starting || (!running && (!queueReady || !setId || !readerReady || working))} onClick={() => running ? stop() : void start()}>{starting ? "Connecting…" : running ? "Stop capture" : "Start capture"}</button>
      <button className="secondary-button" disabled={!running || working || outbox.length >= 8} onClick={() => { const frame = captureSource(); if (frame) void analyze(frame); }}>Capture now</button>
      <label className="stream-frame-upload">Upload frame<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!queueReady || !setId || !readerReady || working} onChange={event => { const file = event.target.files?.[0]; if (file) void imageFileCanvas(file).then(analyze).catch(error => setMessage(error.message)); event.target.value = ""; }} /></label>
    </div>
    {liveReading && <section aria-label="Latest local recognition" aria-live="polite">
      <h2>{liveReading.suggestion.playerName || "Full name unreadable"}</h2>
      <p>Serial: {liveReading.suggestion.limitation || "unreadable"} · Autograph: {liveReading.suggestion.isAutographed === true ? "yes" : liveReading.suggestion.isAutographed === false ? "no" : "needs visual review"}</p>
      <p>{liveReading.model.startsWith("local-") ? "Local reading" : "AI review"}: {liveReading.durationMs} ms · preliminary result</p>
      <p>{liveReading.notes}</p>
    </section>}
    {outbox.length > 0 && <section className="detector-outbox"><h2>Waiting to sync ({outbox.length})</h2><p>These frames are retained on this device. They are not published pulls.</p>{outbox.map(frame => <div key={frame.id}><img src={frame.imageDataUrl} alt="Unsynced card frame" /><span>{new Date(frame.capturedAt).toLocaleString()}</span><button disabled={busy.includes(frame.id) || working} onClick={() => void synchronize(frame)}>Retry upload</button></div>)}</section>}
    <header className="section-heading"><h2>Review queue</h2><div className="stream-frame-actions"><select aria-label="Filter review queue" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">Needs review</option><option value="approved">Approved</option><option value="rejected">Rejected / withdrawn</option><option value="all">All</option></select><button className="secondary-button" onClick={() => void refresh().catch(error => setMessage(error.message))}>Refresh</button><button className="secondary-button" onClick={exportResults}>Export</button></div></header>
    <p className="detector-queue-help">Check the captured proof against the catalog image. Use Correct details for missing names, serials or variants. Confirm pull becomes available after selecting a catalog match and entering Pulled by.</p>
    <datalist id="detector-players">{players.map(player => <option key={player} value={player} />)}</datalist>
    <div className="detector-review-items">{observations.filter(item => filter === "all" || item.status === filter).map(item => {
      const evidence = item.payload.suggestion;
      const selected = item.payload.matches.find(match => match.cardId === item.selectedCardId);
      const isEditing = editingId === item.id;
      return <article className="detector-review-item" key={item.id}>
        <div className="detector-proof-pair"><figure><a href={item.imageUrl} target="_blank" rel="noreferrer"><img src={item.thumbnailUrl} alt="Captured proof image" loading="lazy" /></a><figcaption>Captured card — click for full size</figcaption></figure>{selected?.imageUrl && <figure><img src={selected.imageUrl} alt="Selected catalog reference" loading="lazy" /><figcaption>Catalog reference</figcaption></figure>}</div>
        <div><small>{new Date(item.capturedAt).toLocaleString()} · {item.status}</small><h3>{evidence.playerName || "Player unreadable"}</h3><p>{evidence.setName} · {evidence.cardName || "Variant unknown"} · {evidence.limitation || "Serial unknown"}</p>
          {item.payload.notes && <p className="detector-review-note">{item.payload.notes}</p>}
          {isEditing ? <div className="detector-review-settings">
            <label>Player<input list="detector-players" value={draft.playerName || ""} onChange={event => setDraft(current => ({ ...current, playerName: event.target.value }))} /></label>
            <label>Set<select value={draft.setId || ""} onChange={event => { const set = sets.find(candidate => candidate.id === event.target.value); setDraft(current => ({ ...current, setId: set?.id, setName: set?.name })); }}><option value="">Select set</option>{sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
            <label>Variant<input value={draft.cardName || ""} onChange={event => setDraft(current => ({ ...current, cardName: event.target.value }))} /></label>
            <label>Checklist number<input value={draft.cardNumber ?? ""} onChange={event => setDraft(current => ({ ...current, cardNumber: event.target.value }))} /></label>
            <label>Full serial (copy / print run)<input value={draft.limitation || ""} placeholder="18/25" onChange={event => setDraft(current => ({ ...current, limitation: event.target.value }))} /></label>
            <label>Autograph<select value={draft.isAutographed === true ? "yes" : draft.isAutographed === false ? "no" : "unknown"} onChange={event => setDraft(current => ({ ...current, isAutographed: event.target.value === "unknown" ? null : event.target.value === "yes" }))}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div> : <p>Checklist #{evidence.cardNumber || "unknown"} · Autograph: {evidence.isAutographed === null || evidence.isAutographed === undefined ? "unknown" : evidence.isAutographed ? "yes" : "no"}</p>}
          {item.status === "pending" && !isEditing && <fieldset className="detector-candidates"><legend>Select the catalog card you have checked</legend>{item.payload.matches.length ? item.payload.matches.map(match => <label key={match.cardId}><input type="radio" name={item.id} checked={item.selectedCardId === match.cardId} disabled={busy.includes(item.id)} onChange={() => void action(item, { action: "select", cardId: match.cardId })} /><span>{match.playerName} · {match.parallel || match.cardName} · {match.serialNumber}<small>{match.cardName} · Checklist #{match.cardNumber ?? "unknown"}</small><small>Supported: {match.evidence.join(", ") || "none"}. Still unread: {match.missing.join(", ") || "none"}.</small></span></label>) : <p>No compatible catalog card. Correct the unreadable details and search again.</p>}</fieldset>}
          <div className="stream-detection-actions">
            {item.status === "pending" && (isEditing ? <><button disabled={busy.includes(item.id)} onClick={() => void action(item, { action: "edit", suggestion: draft })}>Save and rematch</button><button className="secondary-button" onClick={() => setEditingId("")}>Cancel</button></> : <><button disabled={busy.includes(item.id) || !selected || !pulledBy.trim()} onClick={() => void action(item, { action: "approve", pulledBy })}>Confirm pull</button><button className="secondary-button" disabled={aiWorking || busy.includes(item.id)} onClick={() => {
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

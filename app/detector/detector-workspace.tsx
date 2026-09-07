"use client";

import { useEffect, useRef, useState } from "react";
import { imageFileCanvas, inspectFrame, prepareCapture } from "@/lib/detector/capture";
import { StableFrameTracker } from "@/lib/detector/frame-tracker";
import { loadPendingFrames, removePendingFrame, savePendingFrame, type PendingObservation } from "@/lib/detector/outbox";
import type { CardEvidence } from "@/lib/detector/matching";
import type { DetectorObservation, DetectorSet } from "@/lib/detector/types";

async function jsonRequest<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
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
  const mediaRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tracker = useRef(new StableFrameTracker<HTMLCanvasElement>());
  const analyzing = useRef(false);
  const analysisQueue = useRef<Promise<unknown>>(Promise.resolve());
  const queuedCount = useRef(0);
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
  const config = useRef({ setId, sets, sourceUrl, overlayKey, focus });
  const videoEmbed = mode === "screen" ? youtubeEmbed(sourceUrl) : null;
  useEffect(() => { config.current = { setId, sets, sourceUrl, overlayKey, focus }; }, [setId, sets, sourceUrl, overlayKey, focus]);

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
    void jsonRequest<{ sets: DetectorSet[]; players: string[] }>("/api/detector/catalog")
      .then(data => { if (mounted.current) { setSets(data.sets); setPlayers(data.players); } })
      .catch(error => setMessage(error.message));
    void refresh().catch(error => setMessage(error.message));
    void loadPendingFrames().then(frames => { if (mounted.current) setOutbox(frames); }).catch(() => setMessage("Browser recovery storage is unavailable. Keep this tab open until uploads finish."));
    void navigator.mediaDevices?.enumerateDevices().then(items => setDevices(items.filter(item => item.kind === "videoinput"))).catch(() => undefined);
    return () => { mounted.current = false; if (timerRef.current) clearInterval(timerRef.current); mediaRef.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    const reload = () => { void refresh().catch(() => undefined); };
    window.addEventListener("detector-queue-updated", reload);
    return () => window.removeEventListener("detector-queue-updated", reload);
  }, []);
  useEffect(() => {
    if (!setId) return;
    let cancelled = false;
    void jsonRequest<{ players: string[] }>("/api/detector/catalog?setId=" + encodeURIComponent(setId))
      .then(data => { if (!cancelled) setPlayers(data.players); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [setId]);

  async function analyze(source: HTMLCanvasElement) {
    if (!queueReady) { setMessage("The browser review queue is still loading. Please wait or press Refresh."); return false; }
    if (queuedCount.current >= 8) { stop(); setMessage("Capture paused: eight frames are waiting for recognition. Let the queue finish before restarting."); return false; }
    const settings = config.current;
    const selectedSet = settings.sets.find(item => item.id === settings.setId);
    if (!selectedSet) { setMessage("Select the set and year first."); return false; }
    analyzing.current = true; setWorking(true);
    const capturedAt = new Date().toISOString();
    try {
      const capture = prepareCapture(source);
      setPreview(capture.imageDataUrl);
      const frame: PendingObservation = {
        id: crypto.randomUUID(), capturedAt, imageDataUrl: capture.imageDataUrl,
        suggestion: { setId: selectedSet.id, setName: selectedSet.name },
        sourceUrl: settings.sourceUrl, overlayKey: settings.overlayKey, notes: "Recognition has not completed; review manually if interrupted.",
      };
      // Persist before calling the paid provider so a timeout or reload cannot lose the image.
      setOutbox(current => [frame, ...current]);
      await savePendingFrame(frame).catch(() => setMessage("Local recovery storage is full. Keep this tab open until this frame is uploaded."));
      queuedCount.current++;
      analysisQueue.current = analysisQueue.current.catch(() => undefined).then(async () => {
        if (!mounted.current) return;
        setMessage("Reading the foreground card. Uncertain details will remain unknown.");
        try {
          const result = await jsonRequest<{ suggestion: CardEvidence; detectedText: string; notes: string; model: string; durationMs: number }>("/api/detector/vision", { ...capture, setId: selectedSet.id });
          Object.assign(frame, result);
        } catch (error) {
          frame.notes = error instanceof Error ? error.message : "Recognition failed; manual review is required.";
        }
        await savePendingFrame(frame).catch(() => undefined);
        if (!mounted.current) return;
        setOutbox(current => current.map(item => item.id === frame.id ? { ...frame } : item));
        await synchronize(frame);
      }).finally(() => { queuedCount.current--; analyzing.current = queuedCount.current > 0; if (mounted.current) setWorking(queuedCount.current > 0); });
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Frame preparation failed."); return false; }
    finally { analyzing.current = queuedCount.current > 0; setWorking(queuedCount.current > 0); }
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
    mediaRef.current?.getTracks().forEach(track => track.stop()); mediaRef.current = null;
    tracker.current.reset(); setRunning(false);
  }
  async function start() {
    if (!queueReady) { setMessage("The browser review queue is still loading. Please wait or press Refresh."); return; }
    if (!setId) { setMessage("Select the set and year first."); return; }
    try {
      stop();
      const media = mode === "screen" ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
        : await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      mediaRef.current = media;
      media.getVideoTracks()[0].onended = stop;
      if (videoRef.current) { videoRef.current.srcObject = media; await videoRef.current.play(); }
      setRunning(true); setMessage("Capture is running. Place one card inside the focus area and hold it steady briefly.");
      timerRef.current = setInterval(() => {
        const source = captureSource(); if (!source) return;
        const candidate = tracker.current.push(inspectFrame(source), Date.now());
        if (!candidate) return;
        void analyzeRef.current(candidate.value).then(success => tracker.current.complete(candidate, success, Date.now()));
      }, 350);
    } catch (error) { stop(); setMessage(error instanceof Error ? error.message : "Capture could not be started."); }
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
    <header className="section-heading"><div><p className="eyebrow">{mode === "screen" ? "Stream" : "Camera / OBS"} detector</p><h1>Capture. Review. Confirm.</h1></div><a href={mode === "screen" ? "/detector" : "/stream-detector"}>Switch to {mode === "screen" ? "camera" : "screen capture"}</a></header>
    <div className="detector-review-settings">
      <label>Set and year<select value={setId} disabled={running || working} onChange={event => setSetId(event.target.value)}><option value="">Select a catalog set</option>{sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
      <label>Pulled by<input value={pulledBy} onChange={event => setPulledBy(event.target.value)} placeholder="Breaker or collector" /></label>
      <label>Source / video URL<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://www.youtube.com/watch?..." /></label>
      <label>Overlay key (optional)<input value={overlayKey} onChange={event => setOverlayKey(event.target.value)} placeholder="From OBS Studio" /></label>
      {mode === "camera" && <label>Camera<select value={deviceId} disabled={running} onChange={event => setDeviceId(event.target.value)}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
    </div>
    <p className="detector-review-message" role="status" aria-live="polite">{message}</p>
    <p>{isAdmin ? "Admin access: all review entries are visible." : "No login required. Your review queue belongs to this browser; keep its cookies to retain access."}</p>
    {mode === "screen" && <p>Start your video, then choose its tab or window in “Start capture”. The source URL is saved with each frame.</p>}
    {videoEmbed && <details><summary>YouTube preview</summary><iframe src={videoEmbed} title="YouTube source preview" allow="encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} /></details>}
    {hasLegacy && <button className="secondary-button" disabled={!queueReady || !sets.length || working} onClick={() => void importLegacy()}>Import unapproved frames from the old device list</button>}
    <div className="detector-review-capture">
      <div><div className="detector-video-stage"><video ref={videoRef} muted playsInline /><div className="detector-focus-outline" style={{ left: `${focus.x}%`, top: `${focus.y}%`, width: `${Math.min(focus.width, 100 - focus.x)}%`, height: `${Math.min(focus.height, 100 - focus.y)}%` }}>Focus area</div></div>
      <details><summary>Adjust focus area</summary><div className="detector-review-settings">{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key}<input type="range" min={key === "x" || key === "y" ? 0 : 10} max={key === "x" || key === "y" ? 85 : 100} value={focus[key]} onChange={event => { tracker.current.reset(); setFocus(current => ({ ...current, [key]: Number(event.target.value) })); }} /></label>)}</div></details></div>
      {preview && <figure><img src={preview} alt="Card image used for recognition" /><figcaption>Actual recognition image</figcaption></figure>}
    </div>
    <div className="stream-frame-actions">
      <button disabled={!running && (!queueReady || !setId || working)} onClick={() => running ? stop() : void start()}>{running ? "Stop capture" : "Start capture"}</button>
      <button className="secondary-button" disabled={!running || working} onClick={() => { const frame = captureSource(); if (frame) void analyze(frame); }}>Capture now</button>
      <label className="stream-frame-upload">Upload frame<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!queueReady || !setId || working} onChange={event => { const file = event.target.files?.[0]; if (file) void imageFileCanvas(file).then(analyze).catch(error => setMessage(error.message)); event.target.value = ""; }} /></label>
    </div>
    {outbox.length > 0 && <section className="detector-outbox"><h2>Waiting to sync ({outbox.length})</h2><p>These frames are retained on this device. They are not published pulls.</p>{outbox.map(frame => <div key={frame.id}><img src={frame.imageDataUrl} alt="Unsynced card frame" /><span>{new Date(frame.capturedAt).toLocaleString()}</span><button disabled={busy.includes(frame.id) || working} onClick={() => void synchronize(frame)}>Retry upload</button></div>)}</section>}
    <header className="section-heading"><h2>Review queue</h2><div className="stream-frame-actions"><select aria-label="Filter review queue" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">Needs review</option><option value="approved">Approved</option><option value="rejected">Rejected / withdrawn</option><option value="all">All</option></select><button className="secondary-button" onClick={() => void refresh().catch(error => setMessage(error.message))}>Refresh</button><button className="secondary-button" onClick={exportResults}>Export</button></div></header>
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
            {item.status === "pending" && (isEditing ? <><button disabled={busy.includes(item.id)} onClick={() => void action(item, { action: "edit", suggestion: draft })}>Save and rematch</button><button className="secondary-button" onClick={() => setEditingId("")}>Cancel</button></> : <><button disabled={busy.includes(item.id) || !selected || !pulledBy.trim()} onClick={() => void action(item, { action: "approve", pulledBy })}>Confirm pull</button><button className="secondary-button" disabled={busy.includes(item.id)} onClick={() => { setDraft({ ...evidence }); setEditingId(item.id); }}>Correct details</button></>)}
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

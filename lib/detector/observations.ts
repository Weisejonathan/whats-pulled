import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db/client";
import { cards, detectorObservations } from "@/lib/db/schema";
import { searchCardMatches } from "@/lib/db/live-breaks";
import { PUBLIC_DATA_CACHE_TAG } from "@/lib/db/public-cache";
import { storeDetectorImage } from "./images";
import { isUuid, readEvidence, type DetectorObservation, type ObservationPayload } from "./types";
import { loadDetectorSets } from "./catalog";
import { parseSerial, validateCopy } from "./matching";

type Row = typeof detectorObservations.$inferSelect;
const serialize = (row: Row): DetectorObservation => ({ ...row, status: row.status as DetectorObservation["status"], capturedAt: row.capturedAt.toISOString() });
const database = () => { const db = getDb(); if (!db) throw new Error("Database unavailable."); return db; };
export async function getObservation(id: string) {
  if (!isUuid(id)) throw new Error("Invalid observation.");
  const [row] = await database().select().from(detectorObservations).where(eq(detectorObservations.id, id)).limit(1);
  if (!row) throw new Error("Observation not found.");
  return serialize(row);
}
export async function listObservations() {
  const rows = await database().select().from(detectorObservations).orderBy(desc(detectorObservations.createdAt)).limit(100);
  return rows.map(serialize);
}
async function evidenceFor(value: unknown) {
  const evidence = readEvidence(value);
  const sets = await loadDetectorSets();
  const set = sets.find((candidate) => evidence.setId ? candidate.id === evidence.setId : candidate.name === evidence.setName);
  if (!set) throw new Error("Select the set and year before analyzing cards.");
  return { ...evidence, setId: set.id, setName: set.name };
}

export async function createObservation(body: Record<string, unknown>) {
  if (!isUuid(body.id)) throw new Error("A stable observation ID is required.");
  const db = database();
  const [existing] = await db.select().from(detectorObservations).where(eq(detectorObservations.id, body.id)).limit(1);
  if (existing) return serialize(existing);
  const suggestion = await evidenceFor(body.suggestion);
  const matches = await searchCardMatches(suggestion);
  const capturedAt = new Date(String(body.capturedAt ?? ""));
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 60_000) throw new Error("Invalid capture date.");
  const images = await storeDetectorImage(body.imageDataUrl);
  const payload: ObservationPayload = {
    suggestion, originalSuggestion: suggestion, matches, originalMatches: matches,
    detectedText: String(body.detectedText ?? "").slice(0, 6000),
    notes: String(body.notes ?? "").slice(0, 2000),
    model: String(body.model ?? "").slice(0, 80),
    durationMs: typeof body.durationMs === "number" ? Math.max(0, body.durationMs) : undefined,
    sourceUrl: String(body.sourceUrl ?? "").slice(0, 1000),
    usage: body.usage && typeof body.usage === "object" ? {
      inputTokens: Math.max(0, Number((body.usage as Record<string, unknown>).inputTokens) || 0),
      outputTokens: Math.max(0, Number((body.usage as Record<string, unknown>).outputTokens) || 0),
    } : undefined,
  };
  await db.insert(detectorObservations).values({
    id: body.id, ...images, capturedAt, payload,
    // Candidate selection is always explicit; confidence cannot publish a pull.
    selectedCardId: null,
    overlayKey: typeof body.overlayKey === "string" ? body.overlayKey.trim().slice(0, 100) || null : null,
  }).onConflictDoNothing({ target: detectorObservations.id });
  return getObservation(body.id);
}

export async function editObservation(id: string, body: Record<string, unknown>) {
  const current = await getObservation(id);
  if (current.status !== "pending" || current.revision !== body.revision) throw new Error("This observation changed. Reload before editing.");
  const suggestion = await evidenceFor(body.suggestion ?? current.payload.suggestion);
  const matches = await searchCardMatches(suggestion);
  let selectedCardId: string | null = null;
  if (body.action === "select") {
    if (!isUuid(body.cardId) || !matches.some((match) => match.cardId === body.cardId)) throw new Error("This card no longer matches the corrected details.");
    selectedCardId = body.cardId;
  }
  const [updated] = await database().update(detectorObservations).set({
    payload: { ...current.payload, suggestion, matches }, selectedCardId,
    revision: current.revision + 1, updatedAt: new Date(),
  }).where(and(eq(detectorObservations.id, id), eq(detectorObservations.revision, current.revision), eq(detectorObservations.status, "pending"))).returning();
  if (!updated) throw new Error("This observation changed. Reload before editing.");
  return serialize(updated);
}

export async function approveObservation(id: string, revision: number, pulledBy: string) {
  const db = database();
  const current = await getObservation(id);
  if (current.status === "approved") return current;
  if (!current.selectedCardId) throw new Error("Select a catalog card before approving.");
  const matches = await searchCardMatches(current.payload.suggestion);
  if (!matches.some((match) => match.cardId === current.selectedCardId)) throw new Error("The selected card no longer matches these details.");
  const [card] = await db.select({ printRun: cards.printRun, serialNumber: cards.serialNumber }).from(cards).where(eq(cards.id, current.selectedCardId));
  validateCopy(current.payload.suggestion.limitation, card?.printRun ?? parseSerial(card?.serialNumber)?.total ?? null);
  await db.execute(sql`select approve_detector_observation(${id}::uuid, ${revision}::integer, ${pulledBy})`);
  revalidateTag(PUBLIC_DATA_CACHE_TAG, "max");
  return getObservation(id);
}

export async function retractObservation(id: string, revision: number) {
  await getObservation(id);
  await database().execute(sql`select retract_detector_observation(${id}::uuid, ${revision}::integer)`);
  revalidateTag(PUBLIC_DATA_CACHE_TAG, "max");
  return getObservation(id);
}

export async function deliverObservationOverlay(id: string) {
  const db = database();
  const observation = await getObservation(id);
  if (observation.status !== "approved" || !observation.overlayKey || observation.overlayEventId) return observation;
  try {
    // One statement and an observation row lock make retries idempotent.
    const result = await db.execute(sql`
      with locked as (select * from detector_observations where id = ${id}::uuid and status = 'approved' and overlay_event_id is null for update),
      event as (
        insert into recognition_events(session_id, card_id, raw_player_name, raw_set_name, raw_card_name, limitation, frame_image_url, is_autographed, source, status, confirmed_at)
        select s.id, o.selected_card_id, o.payload->'suggestion'->>'playerName', o.payload->'suggestion'->>'setName', o.payload->'suggestion'->>'cardName',
          o.payload->'suggestion'->>'limitation', o.image_url, coalesce((o.payload->'suggestion'->>'isAutographed')::boolean, false), 'detector-reviewed', 'confirmed', now()
        from locked o join break_sessions s on s.overlay_key = o.overlay_key returning id
      ) update detector_observations set overlay_event_id = event.id, overlay_error = null from event where detector_observations.id = ${id}::uuid returning event.id
    `);
    if (!result.rows.length) {
      const latest = await getObservation(id);
      if (latest.status !== "approved" || latest.overlayEventId) return latest;
      throw new Error("Overlay session was not found. The approved pull is safely saved.");
    }
  } catch {
    await db.update(detectorObservations).set({ overlayError: "Overlay delivery failed. The pull is saved; retry the overlay separately." }).where(eq(detectorObservations.id, id));
  }
  return getObservation(id);
}

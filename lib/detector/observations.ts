import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db/client";
import { cards, cardSets, detectorObservations, detectorObservationFrames } from "@/lib/db/schema";
import { searchCardMatches } from "@/lib/db/live-breaks";
import { PUBLIC_DATA_CACHE_TAG } from "@/lib/db/public-cache";
import { prepareDetectorImage, storePreparedDetectorImage } from "./images";
import { isUuid, readEvidence, type DetectorObservation, type ObservationPayload } from "./types";
import { loadDetectorSets } from "./catalog";
import { parseSerial, rankCardCandidates, validateCopy, type CardEvidence } from "./matching";
import { canManageObservation, type DetectorAccess } from "./access-policy";
import { buildFrameEvidence, exactCardIdentity } from "./grouping";

type Row = typeof detectorObservations.$inferSelect;
const serialize = (row: Row): DetectorObservation => {
  const { ownerKey: _ownerKey, serverImageHash: _serverImageHash, ...payload } = row.payload;
  return { ...row, payload, status: row.status as DetectorObservation["status"], capturedAt: row.capturedAt.toISOString() };
};
const database = () => { const db = getDb(); if (!db) throw new Error("Database unavailable."); return db; };
export async function getObservation(id: string) {
  if (!isUuid(id)) throw new Error("Invalid observation.");
  const [row] = await database().select().from(detectorObservations).where(eq(detectorObservations.id, id)).limit(1);
  if (!row) throw new Error("Observation not found.");
  if (row.payload.mergedIntoId) throw new Error("This capture has been merged. Refresh and use its remaining review card.");
  return serialize(row);
}
export async function canAccessObservation(id: string, access: DetectorAccess) {
  if (!isUuid(id)) return false;
  const [row] = await database().select({ payload: detectorObservations.payload }).from(detectorObservations).where(eq(detectorObservations.id, id)).limit(1);
  return Boolean(row && canManageObservation(access, row.payload.ownerKey));
}
export async function listObservations(access: DetectorAccess) {
  if (!access.isAdmin && !access.ownerKey) return [];
  const rows = await database().select().from(detectorObservations)
    .where(and(access.isAdmin ? undefined : sql`${detectorObservations.payload}->>'ownerKey' = ${access.ownerKey}`,
      sql`${detectorObservations.payload}->>'mergedIntoId' is null`))
    .orderBy(desc(detectorObservations.createdAt)).limit(100);
  return rows.map(serialize);
}
export async function listMergedObservations(access: DetectorAccess) {
  if (!access.isAdmin && !access.ownerKey) return [];
  return database().select({ id: detectorObservations.id, mergedIntoId: sql<string>`${detectorObservations.payload}->>'mergedIntoId'` })
    .from(detectorObservations).where(and(access.isAdmin ? undefined : sql`${detectorObservations.payload}->>'ownerKey' = ${access.ownerKey}`,
      sql`${detectorObservations.payload}->>'mergedIntoId' is not null`)).orderBy(desc(detectorObservations.updatedAt)).limit(1000);
}
async function evidenceFor(value: unknown) {
  const evidence = readEvidence(value);
  const sets = await loadDetectorSets();
  const set = sets.find((candidate) => evidence.setId ? candidate.id === evidence.setId : candidate.name === evidence.setName);
  if (!set) throw new Error("Select the set and year before analyzing cards.");
  return { ...evidence, setId: set.id, setName: set.name };
}

export async function createObservation(body: Record<string, unknown>, access: DetectorAccess) {
  if (!access.isAdmin && !access.ownerKey) throw new Error("Reload the detector to start a browser session.");
  if (!isUuid(body.id)) throw new Error("A stable observation ID is required.");
  const db = database();
  for (const field of ["sessionId", "trackId"]) if (body[field] !== undefined && body[field] !== null && !isUuid(body[field])) throw new Error("Invalid capture session or track.");
  const [mapped] = await db.select({ observationId: detectorObservationFrames.observationId, ownerKey: detectorObservationFrames.ownerKey })
    .from(detectorObservationFrames).where(eq(detectorObservationFrames.id, body.id)).limit(1);
  if (mapped) {
    if (!canManageObservation(access, mapped.ownerKey)) throw new Error("Observation unavailable.");
    return getObservation(mapped.observationId);
  }
  const [existing] = await db.select().from(detectorObservations).where(eq(detectorObservations.id, body.id)).limit(1);
  if (existing) {
    if (!canManageObservation(access, existing.payload.ownerKey)) throw new Error("Observation unavailable.");
    if (existing.payload.mergedIntoId) return getObservation(existing.payload.mergedIntoId);
    return serialize(existing);
  }
  const suggestion = await evidenceFor(body.suggestion);
  const matches = await searchCardMatches(suggestion);
  const capturedAt = new Date(String(body.capturedAt ?? ""));
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 60_000) throw new Error("Invalid capture date.");
  const owner = access.ownerKey || `admin:${body.sessionId || body.id}`;
  const preparedImage = await prepareDetectorImage(body.imageDataUrl);
  const [storedFrame] = await db.select({ imageUrl: detectorObservationFrames.imageUrl, thumbnailUrl: detectorObservationFrames.thumbnailUrl })
    .from(detectorObservationFrames).where(and(eq(detectorObservationFrames.ownerKey, owner), eq(detectorObservationFrames.imageHash, preparedImage.hash))).limit(1);
  const [legacyImage] = storedFrame ? [] : await db.select({ imageUrl: detectorObservations.imageUrl, thumbnailUrl: detectorObservations.thumbnailUrl })
    .from(detectorObservations).where(and(sql`${detectorObservations.payload}->>'ownerKey' = ${owner}`,
      sql`detector_url_image_hash(${detectorObservations.imageUrl}) = ${preparedImage.hash}`)).limit(1);
  const images = storedFrame || legacyImage || await storePreparedDetectorImage(preparedImage);
  const frameEvidence = buildFrameEvidence(body, suggestion, images, capturedAt.toISOString());
  const payload: ObservationPayload = {
    nameSource: body.fields && typeof body.fields === "object" && "name" in body.fields
      && (body.fields.name === "read" || body.fields.name === "catalog") ? body.fields.name : undefined,
    ownerKey: access.ownerKey || undefined,
    serverImageHash: preparedImage.hash,
    evidence: frameEvidence.evidence, proof: frameEvidence.proof, proofImage: frameEvidence.proofImage,
    color: frameEvidence.color, visualFingerprint: frameEvidence.visualFingerprint,
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
  return db.transaction(async tx => {
    const ingested = await tx.execute(sql`select ingest_detector_frame_exact(${body.id}::uuid, ${owner}, ${body.sessionId ?? null}::uuid,
      ${body.trackId ?? null}::uuid, ${images.imageUrl}, ${images.thumbnailUrl}, ${capturedAt.toISOString()}::timestamptz,
      ${JSON.stringify(payload)}::jsonb, ${typeof body.overlayKey === "string" ? body.overlayKey.trim().slice(0, 100) || null : null},
      ${frameEvidence.quality}::real, ${exactCardIdentity(suggestion, matches)}, ${preparedImage.hash}) as id`);
    const canonicalId = String(ingested.rows[0].id);
    const [canonical] = await tx.select().from(detectorObservations).where(eq(detectorObservations.id, canonicalId));
    if (!canonical) throw new Error("Observation unavailable.");
    if (canonical.status === "pending" && !canonical.selectedCardId && canonical.payload.nameSource !== "manual") {
      // Rematch the combined fields inside the ingestion transaction, using its connection.
      // A later serial-only frame can complete a previously read name without a race.
      const combinedMatches = await matchesWithinTransaction(tx, canonical.payload.suggestion);
      canonical.payload = { ...canonical.payload, matches: combinedMatches };
      await tx.update(detectorObservations).set({ payload: canonical.payload }).where(eq(detectorObservations.id, canonicalId));
      const identity = exactCardIdentity(canonical.payload.suggestion, combinedMatches);
      if (identity) await tx.execute(sql`insert into detector_group_identities(owner_key, identity_key, observation_id)
        values(${owner}, ${identity}, ${canonicalId}::uuid) on conflict(owner_key, identity_key) do nothing`);
    }
    return serialize(canonical);
  });
}

export async function mergeObservations(id: string, revision: number, targetId: string, targetRevision: number) {
  if (!isUuid(targetId) || !Number.isInteger(targetRevision)) throw new Error("Choose a review card and refresh before merging.");
  return database().transaction(async tx => {
    await tx.execute(sql`select merge_detector_observations(${id}::uuid, ${revision}::integer, ${targetId}::uuid, ${targetRevision}::integer)`);
    const [target] = await tx.select().from(detectorObservations).where(eq(detectorObservations.id, targetId));
    if (!target) throw new Error("Observation unavailable.");
    if (target.status === "pending" && !target.selectedCardId && target.payload.nameSource !== "manual") {
      const matches = await matchesWithinTransaction(tx, target.payload.suggestion);
      target.payload = { ...target.payload, matches };
      await tx.update(detectorObservations).set({ payload: target.payload }).where(eq(detectorObservations.id, targetId));
      const identity = exactCardIdentity(target.payload.suggestion, matches);
      const [frame] = await tx.select({ ownerKey: detectorObservationFrames.ownerKey }).from(detectorObservationFrames)
        .where(eq(detectorObservationFrames.observationId, targetId)).limit(1);
      const owner = frame?.ownerKey || target.payload.ownerKey;
      if (identity && owner) await tx.execute(sql`insert into detector_group_identities(owner_key, identity_key, observation_id)
        values(${owner}, ${identity}, ${targetId}::uuid) on conflict(owner_key, identity_key) do nothing`);
    }
    return serialize(target);
  });
}

async function matchesWithinTransaction(db: Pick<ReturnType<typeof database>, "select">, input: CardEvidence) {
  if (!input.playerName?.trim()) return [];
  const filters = [eq(cards.playerName, input.playerName.trim())];
  if (input.setId) filters.push(eq(cards.setId, input.setId));
  const number = String(input.cardNumber ?? "").trim();
  if (/^\d+$/.test(number)) filters.push(eq(cards.cardNumber, Number(number)));
  const rows = await db.select({ cardId: cards.id, cardName: cards.cardName, cardNumber: cards.cardNumber,
    cardSlug: cards.slug, parallel: cards.parallel, playerName: cards.playerName, serialNumber: cards.serialNumber,
    setName: cardSets.name, setId: cardSets.id, hasImage: sql<boolean>`${cards.imageUrl} is not null` })
    .from(cards).innerJoin(cardSets, eq(cards.setId, cardSets.id)).where(and(...filters)).orderBy(cards.id).limit(500);
  return rankCardCandidates(rows.map(row => ({ ...row, cardUrl: `/cards/${row.cardSlug}`, imageUrl: row.hasImage ? `/api/card-images/${row.cardSlug}` : null })), input);
}

export async function editObservation(id: string, body: Record<string, unknown>) {
  const current = await getObservation(id);
  if (current.status !== "pending" || current.revision !== body.revision) throw new Error("This observation changed. Reload before editing.");
  if (body.action === "select" && current.payload.duplicateConflict?.needsReview) throw new Error("Conflicting readings of the same image need manual correction before selection.");
  const suggestion = await evidenceFor(body.suggestion ?? current.payload.suggestion);
  const matches = await searchCardMatches(suggestion);
  let selectedCardId: string | null = null;
  if (body.action === "select") {
    if (!isUuid(body.cardId) || !matches.some((match) => match.cardId === body.cardId)) throw new Error("This card no longer matches the corrected details.");
    selectedCardId = body.cardId;
  }
  const evidence = { ...current.payload.evidence };
  if (body.action === "edit") {
    const keys = { playerName: "name", limitation: "serial", cardName: "variant", cardNumber: "cardNumber", isAutographed: "autograph" } as const;
    for (const [field, key] of Object.entries(keys)) {
      const value = suggestion[field as keyof CardEvidence];
      if (value === current.payload.suggestion[field as keyof CardEvidence]) continue;
      if (value === undefined || value === null || value === "") delete evidence[key];
      else evidence[key] = { frameId: current.payload.group?.bestFrameId || current.id, imageUrl: current.imageUrl, thumbnailUrl: current.thumbnailUrl,
        capturedAt: current.capturedAt, value: typeof value === "boolean" ? value : String(value), source: "manual", quality: 0, proof: [] };
    }
  }
  return database().transaction(async tx => {
    const [frame] = await tx.select({ ownerKey: detectorObservationFrames.ownerKey }).from(detectorObservationFrames)
      .where(eq(detectorObservationFrames.observationId, id)).limit(1);
    // Use the same lock order as ingestion before taking the observation row lock.
    if (frame) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'detector-group:' + frame.ownerKey}, 0))`);
    const [updated] = await tx.update(detectorObservations).set({
      // Preserve server-only ownership and original evidence when replacing reviewed fields.
      payload: sql`${detectorObservations.payload} || ${JSON.stringify({ suggestion, matches, evidence, nameSource: body.action === "edit" ? "manual" : current.payload.nameSource,
        ...(body.action === "edit" && current.payload.duplicateConflict ? { duplicateConflict: { ...current.payload.duplicateConflict, needsReview: false } } : {}) })}::jsonb`, selectedCardId,
      revision: current.revision + 1, updatedAt: new Date(),
    }).where(and(eq(detectorObservations.id, id), eq(detectorObservations.revision, current.revision), eq(detectorObservations.status, "pending"))).returning();
    if (!updated) throw new Error("This observation changed. Reload before editing.");
    if (body.action === "edit") {
      // A corrected serial/variant must not leave a stale identity pointing at this group.
      await tx.execute(sql`delete from detector_group_identities where observation_id = ${id}::uuid`);
      const identity = exactCardIdentity(suggestion, matches);
      if (frame && identity) await tx.execute(sql`insert into detector_group_identities(owner_key, identity_key, observation_id)
        values(${frame.ownerKey}, ${identity}, ${id}::uuid) on conflict(owner_key, identity_key) do nothing`);
    }
    return serialize(updated);
  });
}

export async function approveObservation(id: string, revision: number, pulledBy: string) {
  const db = database();
  const current = await getObservation(id);
  if (current.status === "approved") return current;
  if (current.payload.duplicateConflict?.needsReview) throw new Error("Conflicting readings of the same image need manual correction before approval.");
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

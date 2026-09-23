import type { LocalReading } from "./local-evidence";
import { normalizeLabel, parseSerial } from "./matching";
import { frameDistance } from "./frame-tracker";

export type CardSessionInput = {
  reading: LocalReading;
  now: number;
  /** Fingerprint of the focus region; only compared within a continuous presentation. */
  pixels?: number[];
  /** 64-bit dHash, produced only from a localized card. */
  visualFingerprint?: string;
  presentation?: number;
  quality?: number;
};
export type CardSessionDecision = {
  trackId: string;
  isRepeat: boolean;
  seenCount: number;
  shouldPersist: boolean;
  complete: boolean;
  reason: "new-card" | "continuous-card" | "reacquired-card" | "exact-numbered-card";
};

type Identity = { name: string; serial: string; variant: string; cardNumber: string; set: string; autograph: boolean | null };
type Appearance = { pixels: number[]; hash: string; quality: number };
type Track = {
  id: string;
  identity: Identity;
  firstAppearance: Appearance;
  bestAppearance: Appearance;
  lastSeen: number;
  presentation: number;
  seen: number;
  persisted: number;
  fieldMask: number;
  persistedQuality: number;
  proofAppearances: Appearance[];
};

/** A small distance is supporting visual evidence, not a physical-card identity. */
export function cardFingerprintDistance(left: string, right: string): number {
  if (!/^[a-f\d]{16}$/i.test(left) || !/^[a-f\d]{16}$/i.test(right)) return Infinity;
  let distance = 0;
  for (let index = 0; index < left.length; index++) {
    let bits = parseInt(left[index], 16) ^ parseInt(right[index], 16);
    while (bits) { bits &= bits - 1; distance++; }
  }
  return distance;
}

function identity(reading: LocalReading): Identity {
  const serial = reading.fields?.serial === "read" ? parseSerial(reading.suggestion.limitation) : null;
  return {
    name: reading.fields?.name === "read" ? normalizeLabel(reading.suggestion.playerName) : "",
    serial: serial?.copy ? `${serial.copy}/${serial.total}` : "",
    variant: normalizeLabel(reading.suggestion.cardName),
    cardNumber: normalizeLabel(reading.suggestion.cardNumber),
    set: normalizeLabel(reading.suggestion.setId || reading.suggestion.setName),
    autograph: reading.suggestion.isAutographed ?? null,
  };
}
function conflicts(left: Identity, right: Identity) {
  return (["name", "serial", "variant", "cardNumber", "set"] as const)
    .some(key => left[key] && right[key] && left[key] !== right[key])
    || (left.autograph !== null && right.autograph !== null && left.autograph !== right.autograph);
}
function exactNumberedIdentity(value: Identity) {
  // A player and a print run can appear in different card families. Re-entry
  // needs explicit variant context; the server additionally validates catalog ID.
  return value.name && value.serial && value.set && value.variant && value.autograph !== null
    ? JSON.stringify(value) : "";
}
function evidenceMask(reading: LocalReading) {
  return (reading.fields?.name === "read" ? 3 : reading.fields?.name === "catalog" ? 1 : 0)
    | (reading.fields?.serial === "read" ? 4 : 0)
    | (reading.fields?.autograph === "visual-evidence" ? 8 : 0)
    | (reading.suggestion.cardName ? 16 : 0)
    | (normalizeLabel(reading.suggestion.cardNumber) ? 32 : 0)
    | (reading.color && reading.color.label !== "unknown" && Number.isFinite(reading.color.support) && reading.color.support >= .6 ? 64 : 0);
}
function sameAppearance(track: Track, current: Appearance, incoming: Identity) {
  const knownName = Boolean(incoming.name && incoming.name === track.identity.name);
  const exactSerial = Boolean(knownName && incoming.serial && incoming.serial === track.identity.serial);
  const anchorHash = cardFingerprintDistance(track.firstAppearance.hash, current.hash);
  const bestHash = cardFingerprintDistance(track.bestAppearance.hash, current.hash);
  if (Number.isFinite(anchorHash)) {
    // Keep an anchor so that a chain of individually similar frames cannot
    // gradually drift into an unrelated card.
    return anchorHash <= (exactSerial ? 20 : knownName ? 14 : 8)
      && Math.min(anchorHash, bestHash) <= (exactSerial ? 14 : knownName ? 10 : 6);
  }
  const anchor = frameDistance(track.firstAppearance.pixels, current.pixels);
  const best = frameDistance(track.bestAppearance.pixels, current.pixels);
  return anchor <= (exactSerial ? 28 : 18) && Math.min(anchor, best) < (exactSerial ? 24 : 12);
}

function differentProofView(previous: Appearance[], current: Appearance) {
  return previous.every(proof => {
    const hashDistance = cardFingerprintDistance(proof.hash, current.hash);
    if (Number.isFinite(hashDistance)) return hashDistance >= 3;
    const pixelDistance = frameDistance(proof.pixels, current.pixels);
    return Number.isFinite(pixelDistance) && pixelDistance >= 4;
  });
}

/**
 * Group views of one physical presentation, without equating two unnumbered
 * copies merely because the player matches. Raw frames remain separate proofs;
 * this class never manufactures a composite reading or replaces field evidence.
 */
export class CardSessionTracker {
  private tracks: Track[] = [];
  private active: Track | null = null;
  private generation = 0;
  private latestPresentation = 0;
  constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

  /** Source/focus changes and the explicit “Different card” action start fresh. */
  reset(presentation = this.latestPresentation + 1) {
    this.active = null; this.tracks = []; this.generation = presentation;
    this.latestPresentation = presentation;
  }
  forceNew() { this.reset(this.latestPresentation); }

  observe(input: CardSessionInput): CardSessionDecision {
    const now = Number.isFinite(input.now) ? input.now : 0;
    const appearance: Appearance = {
      pixels: input.pixels?.slice() ?? [], hash: input.visualFingerprint ?? "",
      quality: Number.isFinite(input.quality) ? Math.max(0, input.quality!) : 0,
    };
    const incoming = identity(input.reading);
    const presentation = input.presentation ?? this.generation;
    const stalePresentation = presentation < this.latestPresentation;
    this.latestPresentation = Math.max(this.latestPresentation, presentation);
    const exact = exactNumberedIdentity(incoming);
    let reason: CardSessionDecision["reason"] = "new-card";
    let track: Track | null = null;
    // Elapsed time is not a witnessed removal: a card can be held still while
    // the operator reviews it, or while a network request takes longer than 12s.
    if (!stalePresentation && this.active && this.active.presentation === presentation
      && !conflicts(this.active.identity, incoming)
      && sameAppearance(this.active, appearance, incoming)) {
      track = this.active; reason = "continuous-card";
    } else if (!stalePresentation) {
      // A transient unrelated/unknown read must not permanently prevent
      // reacquiring a prior card. Ambiguous visual matches cannot choose one.
      const compatible = this.tracks.filter(item => item.presentation === presentation
        && !conflicts(item.identity, incoming) && sameAppearance(item, appearance, incoming));
      if (compatible.length === 1) { track = compatible[0]; reason = "reacquired-card"; }
    }
    if (!track && exact) {
      track = this.tracks.find(item => exactNumberedIdentity(item.identity) === exact && !conflicts(item.identity, incoming)) ?? null;
      if (track) reason = "exact-numbered-card";
    }
    const fieldMask = evidenceMask(input.reading);
    const complete = input.reading.fields?.name === "read" && input.reading.fields?.serial === "read";
    if (!track) {
      track = { id: this.createId(), identity: incoming, firstAppearance: appearance, bestAppearance: appearance,
        lastSeen: now, presentation, seen: 0, persisted: 0, fieldMask: 0, persistedQuality: 0, proofAppearances: [] };
      this.tracks = [...this.tracks.slice(-63), track];
    }
    const isRepeat = track.seen > 0;
    const improvesFields = (fieldMask & ~track.fieldMask) !== 0;
    const improvesQuality = appearance.quality > track.persistedQuality * 1.3 + 5;
    // Re-reading unchanged pixels must not upload the same proof five times.
    // Incomplete cards may retain two complementary views, plus genuinely
    // improved fields/quality; every proof still belongs to this one track.
    const complementaryView = !complete && track.persisted < 3 && differentProofView(track.proofAppearances, appearance);
    const shouldPersist = !isRepeat || improvesFields || complementaryView || (improvesQuality && track.persisted < 8);
    track.seen++;
    if (shouldPersist) {
      track.persisted++; track.persistedQuality = Math.max(track.persistedQuality, appearance.quality);
      track.proofAppearances = [...track.proofAppearances.slice(-7), appearance];
    }
    track.fieldMask |= fieldMask;
    track.lastSeen = Math.max(track.lastSeen, now);
    track.presentation = Math.max(track.presentation, presentation);
    for (const key of ["name", "serial", "variant", "cardNumber", "set"] as const) {
      if (incoming[key]) track.identity[key] = incoming[key];
    }
    if (incoming.autograph !== null) track.identity.autograph = incoming.autograph;
    // The first frame may fail localization. Once a safely associated frame
    // supplies a card fingerprint, keep it as the stable appearance anchor.
    if (!/^[a-f\d]{16}$/i.test(track.firstAppearance.hash) && /^[a-f\d]{16}$/i.test(appearance.hash)) track.firstAppearance = appearance;
    if (appearance.quality > track.bestAppearance.quality) track.bestAppearance = appearance;
    // A late read may still be retained as proof of an older presentation, but
    // must never replace the active tracking state after a source/focus reset.
    if (!stalePresentation) this.active = track;
    return { trackId: track.id, isRepeat, seenCount: track.seen, shouldPersist, complete, reason };
  }
}

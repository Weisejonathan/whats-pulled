/** Evidence scores rank candidates; they are deliberately not probabilities. */
export type CardEvidence = {
  playerName?: string | null;
  setId?: string | null;
  setName?: string | null;
  cardName?: string | null;
  cardNumber?: string | number | null;
  limitation?: string | null;
  isAutographed?: boolean | null;
  detectedText?: string | null;
};

export type CatalogCandidate = {
  cardId: string;
  cardName: string;
  cardNumber: number | null;
  cardUrl: string;
  imageUrl: string | null;
  playerName: string;
  serialNumber: string;
  setName: string;
  setId?: string;
  parallel?: string | null;
};

export type CardMatch = CatalogCandidate & {
  score: number;
  autoEligible: boolean;
  evidence: string[];
  conflicts: string[];
  missing: string[];
};

export const normalizeLabel = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function parseSerial(value: unknown): { copy: number | null; total: number } | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:(\d{1,5})\s*)?[/|\\]\s*(\d{1,5})$/);
  if (!match) return null;
  const total = Number(match[2]);
  const copy = match[1] === undefined ? null : Number(match[1]);
  if (total < 1 || (copy !== null && (copy < 1 || copy > total))) return null;
  return { copy, total };
}

export function validateCopy(limitation: unknown, printRun: number | null) {
  const serial = parseSerial(limitation);
  if (!serial || !printRun || serial.total !== printRun) {
    throw new Error("The serial must match the selected card's print run (for example 18/25 for /25)." );
  }
  const copy = serial.copy ?? (printRun === 1 ? 1 : null);
  if (copy === null) throw new Error("Read or enter the individual copy number before approving this pull.");
  return copy;
}

export const isAutographCard = (name: string) => /\b(auto|autographs?|autographed|signatures?|signed)\b/i.test(name);
const variantLabel = (value: string) => normalizeLabel(value)
  .replace(/\b(auto|autographs?|autographed|signatures?|signed)\b/g, "")
  .replace(/\s+/g, " ").trim();

export function rankCardCandidates(rows: CatalogCandidate[], input: CardEvidence): CardMatch[] {
  const player = normalizeLabel(input.playerName);
  const set = normalizeLabel(input.setName);
  const variant = variantLabel(input.cardName ?? "");
  const specificVariant = variant && !["refractor", "parallel", "sapphire", "base"].includes(variant);
  const serial = parseSerial(input.limitation);
  const numberText = String(input.cardNumber ?? "").trim();
  const number = /^\d+$/.test(numberText) ? Number(numberText) : null;
  const ranked = rows.map((row): CardMatch => {
    const evidence: string[] = [];
    const conflicts: string[] = [];
    const missing: string[] = [];
    let score = 0;
    const compare = (supplied: boolean, matches: boolean, label: string, weight: number) => {
      if (!supplied) missing.push(label);
      else if (!matches) conflicts.push(label);
      else { evidence.push(label); score += weight; }
    };
    compare(Boolean(player), normalizeLabel(row.playerName) === player, "Player", 0.25);
    compare(Boolean(input.setId || set), input.setId ? row.setId === input.setId : normalizeLabel(row.setName) === set, "Set", 0.2);
    compare(Boolean(specificVariant), variantLabel(row.parallel || row.cardName) === variant, "Variant", 0.2);
    compare(Boolean(serial), parseSerial(row.serialNumber)?.total === serial?.total, "Print run", 0.15);
    compare(number !== null, row.cardNumber === number, "Card number", 0.1);
    compare(typeof input.isAutographed === "boolean", isAutographCard(row.cardName + " " + (row.parallel || "")) === input.isAutographed, "Autograph", 0.1);
    if (input.limitation?.trim() && !serial) conflicts.push("Invalid serial");
    return { ...row, score: Math.round(score * 100) / 100, evidence, conflicts, missing, autoEligible: false };
  }).filter((row) => row.conflicts.length === 0)
    .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId));
  const best = ranked[0];
  if (best) {
    // Never turn an ambiguous player/set match into a confirmed card.
    best.autoEligible = best.evidence.includes("Player") && best.evidence.includes("Set")
      && best.evidence.includes("Autograph")
      && (best.evidence.includes("Variant") || best.evidence.includes("Print run"))
      && (!ranked[1] || best.score - ranked[1].score >= 0.1);
  }
  return ranked.slice(0, 8);
}

export function selectUniquePlayer(value: string | null, players: string[]) {
  const normalized = normalizeLabel(value);
  if (!normalized) return "";
  const exact = players.filter((name) => normalizeLabel(name) === normalized);
  if (exact.length === 1) return exact[0];
  const surname = players.filter((name) => normalizeLabel(name).split(" ").at(-1) === normalized);
  return surname.length === 1 ? surname[0] : "";
}

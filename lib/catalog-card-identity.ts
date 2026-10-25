type CardIdentity = {
  slug: string;
  cardName: string;
  cardNumber: number | null;
  player: string;
  sourceUrl?: string | null;
};

export function catalogCardCode(card: Pick<CardIdentity, "cardName" | "cardNumber">): string | null {
  return card.cardName.match(/#([A-Z0-9]+(?:-[A-Z0-9]+)*)\b/i)?.[1] ?? (card.cardNumber === null ? null : String(card.cardNumber));
}

/** Keep inserts/autographs distinct even when their numeric card number is null. */
export function catalogCardIdentity(card: CardIdentity): string {
  const code = card.cardName.match(/#([A-Z0-9]+(?:-[A-Z0-9]+)*)\b/i)?.[1];
  if (code) return `${code.toUpperCase()}:${/Autograph/i.test(card.cardName) && /^\d+$/.test(code) ? "autograph:" : ""}${card.player}`;
  if (card.cardNumber !== null) return `${card.cardNumber}:${card.player}`;
  const legacyCode = card.sourceUrl?.match(/\bca-[a-z0-9]+\b/i)?.[0];
  return legacyCode ? `${legacyCode.toUpperCase()}:${card.player}` : card.slug;
}

export const parallelForLimitation = (limitation?: string | null) => {
  const normalized = limitation?.trim();

  if (!normalized) {
    return null;
  }

  const match =
    normalized.match(/\b\d{1,4}\s*\/\s*(\d{1,4})\b/) ??
    normalized.match(/^\/\s*(\d{1,4})$/);

  return match?.[1] === "25" ? "Orange Refractor" : null;
};

export const applyLimitationParallelRule = <T extends { cardName: string; limitation: string }>(
  payload: T,
) => {
  const parallel = parallelForLimitation(payload.limitation);

  if (!parallel || payload.cardName.toLowerCase().includes("orange")) {
    return payload;
  }

  return {
    ...payload,
    cardName: parallel,
  };
};

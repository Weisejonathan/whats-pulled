type ParallelContext = {
  cardName?: string | null;
  detectedText?: string | null;
  setName?: string | null;
  sourceUrl?: string | null;
};

const sapphireParallels: Record<string, string> = {
  "75": "Green Sapphire",
  "25": "Orange Sapphire",
  "10": "Purple Sapphire",
  "5": "Red Sapphire",
  "1": "Padparadscha Sapphire",
};

const chromeParallels: Record<string, string> = {
  "125": "Purple",
  "99": "Green Refractor",
  "50": "Gold Refractor",
  "25": "Orange Refractor",
  "5": "Red Refractor",
  "1": "Superfractor",
};

const normalizeContext = (context?: ParallelContext) =>
  [context?.setName, context?.cardName, context?.detectedText, context?.sourceUrl]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .toLowerCase();

export const limitationDenominator = (limitation?: string | null) => {
  const normalized = limitation?.trim();

  if (!normalized) {
    return null;
  }

  const match =
    normalized.match(/\b\d{1,4}\s*[/|\\]\s*(\d{1,4})\b/) ??
    normalized.match(/^[/|\\]\s*(\d{1,4})$/);

  return match?.[1]?.replace(/^0+(?=\d)/, "") ?? null;
};

export const normalizeLimitation = (limitation?: string | null) => {
  const normalized = limitation?.trim().replace(/\s+/g, "");

  if (!normalized) {
    return "";
  }

  const serialMatch = normalized.match(/^0*(\d{1,4})[/|\\]0*(\d{1,4})$/);

  if (serialMatch) {
    return `${serialMatch[1]}/${serialMatch[2]}`;
  }

  const denominatorMatch = normalized.match(/^[/|\\]0*(\d{1,4})$/);

  return denominatorMatch ? `/${denominatorMatch[1]}` : normalized;
};

export const inferToppsParallelFromText = (value?: string | null) => {
  const normalized = value?.replace(/[_-]+/g, " ").toLowerCase() ?? "";

  if (!normalized) {
    return null;
  }

  const hasSapphire = /sapphire|25tctn|topps chrome sapphire/.test(normalized);

  if (!hasSapphire) {
    return null;
  }

  if (/padparadscha|superfractor|1\s*\/\s*1|\/\s*1\b/.test(normalized)) {
    return {
      cardName: "Padparadscha Sapphire",
      limitation: "/1",
      setName: "Topps Chrome Sapphire Tennis 2025",
    };
  }

  if (/\bred\b|\/\s*5\b/.test(normalized)) {
    return {
      cardName: "Red Sapphire",
      limitation: "/5",
      setName: "Topps Chrome Sapphire Tennis 2025",
    };
  }

  if (/\bpurple\b|\/\s*10\b/.test(normalized)) {
    return {
      cardName: "Purple Sapphire",
      limitation: "/10",
      setName: "Topps Chrome Sapphire Tennis 2025",
    };
  }

  if (/\borange\b|\/\s*25\b/.test(normalized)) {
    return {
      cardName: "Orange Sapphire",
      limitation: "/25",
      setName: "Topps Chrome Sapphire Tennis 2025",
    };
  }

  if (/\bgreen\b|\/\s*75\b/.test(normalized)) {
    return {
      cardName: "Green Sapphire",
      limitation: "/75",
      setName: "Topps Chrome Sapphire Tennis 2025",
    };
  }

  return {
    cardName: "Sapphire",
    limitation: "",
    setName: "Topps Chrome Sapphire Tennis 2025",
  };
};

export const parallelForLimitation = (limitation?: string | null, context?: ParallelContext) => {
  const denominator = limitationDenominator(limitation);

  if (!denominator) {
    return inferToppsParallelFromText(normalizeContext(context))?.cardName ?? null;
  }

  const contextText = normalizeContext(context);
  const isSapphire = /sapphire|25tctn|topps chrome sapphire/.test(contextText);

  if (isSapphire) {
    return sapphireParallels[denominator] ?? null;
  }

  if (/geometric/.test(contextText)) {
    if (denominator === "50") return "Gold Geometric Refractor";
    if (denominator === "25") return "Orange Geometric Refractor";
    if (denominator === "10") return "Purple Geometric Refractor";
    if (denominator === "5") return "Red Geometric Refractor";
    if (denominator === "2") return "Black Geometric Refractor";
  }

  if (denominator === "10" && /black/.test(contextText)) {
    return "Black Refractor";
  }

  return chromeParallels[denominator] ?? null;
};

export const applyLimitationParallelRule = <
  T extends {
    cardName: string;
    detectedText?: string | null;
    limitation: string;
    setName?: string | null;
    sourceUrl?: string | null;
  },
>(
  payload: T,
) => {
  const { detectedText: _detectedText, sourceUrl: _sourceUrl, ...cleanPayload } = payload;
  const textInference = inferToppsParallelFromText(
    [payload.setName, payload.cardName, payload.limitation, payload.detectedText, payload.sourceUrl].filter(Boolean).join(" "),
  );
  const limitation = normalizeLimitation(payload.limitation) || textInference?.limitation || "";
  const parallel =
    textInference?.cardName ??
    parallelForLimitation(limitation, {
      cardName: payload.cardName,
      detectedText: payload.detectedText,
      setName: payload.setName,
      sourceUrl: payload.sourceUrl,
    });
  const lowerCardName = payload.cardName.toLowerCase();
  const shouldReplaceCardName =
    Boolean(parallel) &&
    (!lowerCardName ||
      lowerCardName === "refractor" ||
      lowerCardName === "parallel" ||
      lowerCardName === "sapphire" ||
      !lowerCardName.includes(parallel!.toLowerCase()));

  return {
    ...cleanPayload,
    cardName: shouldReplaceCardName ? parallel! : payload.cardName,
    limitation,
    setName: payload.setName || textInference?.setName || "",
  };
};

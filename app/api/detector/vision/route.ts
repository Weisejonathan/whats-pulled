import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { applyLimitationParallelRule } from "@/lib/card-parallels";
import { getDb } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type VisionDetection = {
  cardName: string | null;
  cardNumber: string | null;
  confidence: number;
  detectedText: string | null;
  isAutographed: boolean;
  limitation: string | null;
  notes: string | null;
  playerName: string | null;
  setName: string | null;
};

const fallbackPlayers = [
  "Linda Noskova",
  "Sebastian Korda",
  "Valentin Vacherot",
];

const emptySuggestion = {
  playerName: "",
  setName: "",
  cardName: "",
  cardNumber: "",
  limitation: "",
  isAutographed: false,
};

const readText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const loadPlayerNames = async () => {
  const db = getDb();

  if (!db) {
    return fallbackPlayers;
  }

  try {
    const rows = await db
      .select({ playerName: cards.playerName })
      .from(cards)
      .orderBy(asc(cards.playerName));

    const players = Array.from(new Set(rows.map((row) => row.playerName).filter(Boolean)));
    return players.length ? players : fallbackPlayers;
  } catch (error) {
    console.error("Failed to load vision detector player names", error);
    return fallbackPlayers;
  }
};

const normalizeNameForMatch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S")
    .replace(/8/g, "B")
    .replace(/[^A-Z]/g, "");

const levenshteinDistance = (left: string, right: string) => {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);

  for (let index = 1; index <= right.length; index += 1) {
    rows[0][index] = index;
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + cost,
      );
    }
  }

  return rows[left.length][right.length];
};

const aliasesForPlayerName = (playerName: string) => {
  const parts = playerName.split(/\s+/).filter(Boolean);
  const normalizedName = normalizeNameForMatch(playerName);
  const surname = normalizeNameForMatch(parts.at(-1) ?? playerName);
  const noInitials = normalizeNameForMatch(parts.filter((part) => !/^[A-Z]\.?$/i.test(part)).join(" "));

  return Array.from(new Set([normalizedName, noInitials, surname].filter((alias) => alias.length >= 3)));
};

const correctKnownPlayerName = (value: string | null, playerNames: string[]) => {
  if (!value?.trim()) {
    return "";
  }

  const normalized = normalizeNameForMatch(value);
  let bestMatch = {
    distance: Infinity,
    name: "",
    score: 0,
  };

  for (const playerName of playerNames) {
    const target = normalizeNameForMatch(playerName);
    const fullNameDistance = levenshteinDistance(normalized, target);

    for (const alias of aliasesForPlayerName(playerName)) {
      const aliasDistance = levenshteinDistance(normalized, alias);
      const score =
        normalized === target ? 130 :
        normalized === alias ? 120 :
        normalized.includes(target) ? 110 :
        normalized.includes(alias) ? 100 :
        alias.length >= 5 && normalized.length <= alias.length + 3 && aliasDistance <= 2 ? 88 :
        fullNameDistance <= 3 ? 82 :
        0;

      if (score > bestMatch.score || (score === bestMatch.score && aliasDistance < bestMatch.distance)) {
        bestMatch = {
          distance: aliasDistance,
          name: playerName,
          score,
        };
      }
    }
  }

  return bestMatch.score ? bestMatch.name : value.trim();
};

const findStrongOcrPlayerName = (text: string | null, playerNames: string[]) => {
  if (!text?.trim()) {
    return "";
  }

  const normalizedText = normalizeNameForMatch(text);
  let bestMatch = {
    name: "",
    score: 0,
  };

  for (const playerName of playerNames) {
    let score = 0;

    for (const alias of aliasesForPlayerName(playerName)) {
      if (alias.length < 4) {
        continue;
      }

      let searchIndex = 0;
      let matches = 0;
      while (searchIndex < normalizedText.length) {
        const foundAt = normalizedText.indexOf(alias, searchIndex);
        if (foundAt === -1) {
          break;
        }
        matches += 1;
        searchIndex = foundAt + alias.length;
      }

      if (matches > 0) {
        score += matches * (alias === normalizeNameForMatch(playerName) ? 4 : alias.length === 4 ? 4 : 3);
      }
    }

    if (score > bestMatch.score) {
      bestMatch = {
        name: playerName,
        score,
      };
    }
  }

  return bestMatch.score >= 3 ? bestMatch.name : "";
};

const normalizeVisionDetection = (detection: VisionDetection, playerNames: string[], localDetectedText: string | null) => {
  const strongOcrPlayerName = findStrongOcrPlayerName(localDetectedText, playerNames);
  const suggestion = applyLimitationParallelRule({
    ...emptySuggestion,
    playerName: strongOcrPlayerName || correctKnownPlayerName(detection.playerName, playerNames),
    setName: detection.setName?.trim() ?? "",
    cardName: detection.cardName?.trim() ?? "",
    cardNumber: detection.cardNumber?.trim() ?? "",
    limitation: detection.limitation?.replace(/\s+/g, "").trim() ?? "",
    isAutographed: Boolean(detection.isAutographed),
  });

  return {
    confidence: Math.min(1, Math.max(0, Number(detection.confidence) || 0)),
    detectedText: detection.detectedText?.trim() ?? "",
    notes: [
      strongOcrPlayerName ? `Local OCR locked player as ${strongOcrPlayerName}.` : "",
      detection.notes?.trim() ?? "",
    ].filter(Boolean).join(" "),
    suggestion,
  };
};

const buildPrompt = (playerNames: string[], detectedText: string | null) => `
You are reading a single Topps Chrome Tennis trading card from a camera frame.

Focus on the largest foreground card only. Ignore background cards, keyboard text, hands, sleeves, desk texture, and OCR noise.

Important card layout rules:
- The Topps Chrome logo is only the manufacturer mark. It is not the player name.
- The player name is usually printed on the lower nameplate, often bottom right or along the bottom edge.
- A card may show only the surname in the nameplate. If that surname matches exactly one database player, return the full database name.
- Serial numbering can be like 3/5, 1/1, 18/25, or only /25. Return that as limitation.
- cardNumber is the checklist/card number, not the serial number.
- If the design/logo clearly indicates Topps Chrome Tennis, set setName to "Topps Chrome Tennis 2025".
- If the serial denominator is /25, keep limitation as /25 or N/25. Do not call it another color.

Known database player names:
${playerNames.map((name) => `- ${name}`).join("\n")}

Local OCR text, which may contain heavy noise:
${detectedText || "(none)"}

Return the exact database playerName when visible. If the player cannot be read from the foreground card, return null instead of guessing from background cards.
`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    playerName: { type: ["string", "null"] },
    setName: { type: ["string", "null"] },
    cardName: { type: ["string", "null"] },
    cardNumber: { type: ["string", "null"] },
    limitation: { type: ["string", "null"] },
    isAutographed: { type: "boolean" },
    confidence: { type: "number" },
    detectedText: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
  },
  required: [
    "playerName",
    "setName",
    "cardName",
    "cardNumber",
    "limitation",
    "isAutographed",
    "confidence",
    "detectedText",
    "notes",
  ],
};

const extractOutputText = (payload: unknown) => {
  const root = payload as Record<string, unknown>;

  if (typeof root.output_text === "string") {
    return root.output_text;
  }

  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    const record = item as Record<string, unknown>;
    const content = Array.isArray(record.content) ? record.content : [];

    for (const contentItem of content) {
      const contentRecord = contentItem as Record<string, unknown>;
      const text = contentRecord.text;

      if (typeof text === "string") {
        chunks.push(text);
      }
    }
  }

  return chunks.join("\n").trim();
};

const parseDetection = (text: string): VisionDetection => {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(trimmed) as Partial<VisionDetection>;

  return {
    cardName: typeof parsed.cardName === "string" ? parsed.cardName : null,
    cardNumber: typeof parsed.cardNumber === "string" ? parsed.cardNumber : null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    detectedText: typeof parsed.detectedText === "string" ? parsed.detectedText : null,
    isAutographed: typeof parsed.isAutographed === "boolean" ? parsed.isAutographed : false,
    limitation: typeof parsed.limitation === "string" ? parsed.limitation : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
    playerName: typeof parsed.playerName === "string" ? parsed.playerName : null,
    setName: typeof parsed.setName === "string" ? parsed.setName : null,
  };
};

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON payload expected." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const imageDataUrl = readText(body, "imageDataUrl");
  const detectedText = readText(body, "detectedText");
  const apiKey = process.env.OPENAI_API_KEY;

  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
  }

  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(imageDataUrl)) {
    return NextResponse.json({ error: "imageDataUrl must be a PNG, JPEG, or WEBP data URL." }, { status: 400 });
  }

  if (imageDataUrl.length > 10_000_000) {
    return NextResponse.json({ error: "imageDataUrl is too large." }, { status: 413 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 501 });
  }

  const playerNames = await loadPlayerNames();
  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4.1-mini";

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: buildPrompt(playerNames, detectedText) },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        },
      ],
      max_output_tokens: 500,
      text: {
        format: {
          type: "json_schema",
          name: "card_detection",
          schema: responseSchema,
          strict: true,
        },
      },
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!openAiResponse.ok) {
    const status = openAiResponse.status >= 500 ? 502 : openAiResponse.status;
    return NextResponse.json({ error: "OpenAI vision detection failed." }, { status });
  }

  try {
    const responsePayload = await openAiResponse.json();
    const outputText = extractOutputText(responsePayload);

    if (!outputText) {
      return NextResponse.json({ error: "OpenAI vision returned no text." }, { status: 502 });
    }

    const detection = parseDetection(outputText);
    return NextResponse.json({
      model,
      ...normalizeVisionDetection(detection, playerNames, detectedText),
    });
  } catch (error) {
    console.error("Failed to parse vision detector response", error);
    return NextResponse.json({ error: "OpenAI vision response could not be parsed." }, { status: 502 });
  }
}

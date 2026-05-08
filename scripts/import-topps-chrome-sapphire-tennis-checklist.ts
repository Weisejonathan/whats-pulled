import "../lib/db/load-env";
import { inflateSync } from "zlib";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { cards, cardSets } from "../lib/db/schema";
import { slugify } from "../lib/slug";

const CHECKLIST_URL =
  "https://cdn.shopify.com/s/files/1/0662/9749/5709/files/CheckList_25TCTN_SAPPHIRE_FINAL_SUBJECT_TO_CHANGE.pdf?v=1774023689";

const BASE_PARALLELS = [
  { name: "Green Sapphire", printRun: 75 },
  { name: "Orange Sapphire", printRun: 25 },
  { name: "Purple Sapphire", printRun: 10 },
  { name: "Red Sapphire", printRun: 5 },
  { name: "Padparadscha Sapphire", printRun: 1 },
];

const AUTOGRAPH_PARALLELS = [
  { name: "Autographs Orange Sapphire", printRun: 25 },
  { name: "Autographs Purple Sapphire", printRun: 10 },
  { name: "Autographs Red Sapphire", printRun: 5 },
  { name: "Autographs Padparadscha Sapphire", printRun: 1 },
];

type ChecklistRow = {
  number: string;
  name: string;
  rookie: boolean;
};

const db = getDb();

const decodePdfLiteral = (value: string) => {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\") {
      output += value[index + 1] ?? "";
      index += 1;
    } else {
      output += value[index];
    }
  }

  return output;
};

const extractPdfStreams = (buffer: Buffer) => {
  const pdf = buffer.toString("latin1");
  const streams: string[] = [];
  const streamPattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(pdf))) {
    const start = match.index + match[0].length;
    const end = pdf.indexOf("endstream", start);

    if (end < 0) {
      continue;
    }

    let chunk = buffer.subarray(start, end);

    while (chunk.length && (chunk[chunk.length - 1] === 10 || chunk[chunk.length - 1] === 13)) {
      chunk = chunk.subarray(0, -1);
    }

    try {
      streams.push(inflateSync(chunk).toString("latin1"));
    } catch {
      // Font streams and other non-text streams can be ignored.
    }
  }

  return streams;
};

const buildCMap = (streams: string[]) => {
  const cmap = new Map<string, string>();

  for (const stream of streams) {
    if (!stream.includes("begincmap")) {
      continue;
    }

    for (const section of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const match of section[1].matchAll(/<([0-9A-F]{4})>\s+<([0-9A-F]{4})>/g)) {
        cmap.set(match[1], String.fromCharCode(Number.parseInt(match[2], 16)));
      }
    }

    for (const section of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const match of section[1].matchAll(/<([0-9A-F]{4})>\s+<([0-9A-F]{4})>\s+<([0-9A-F]{4})>/g)) {
        const first = Number.parseInt(match[1], 16);
        const last = Number.parseInt(match[2], 16);
        const unicodeStart = Number.parseInt(match[3], 16);

        for (let code = first; code <= last; code += 1) {
          cmap.set(
            code.toString(16).toUpperCase().padStart(4, "0"),
            String.fromCharCode(unicodeStart + code - first),
          );
        }
      }
    }
  }

  return cmap;
};

const decodePdfHex = (value: string, cmap: Map<string, string>) => {
  let output = "";

  for (let index = 0; index < value.length; index += 4) {
    const code = value.slice(index, index + 4).toUpperCase();
    output += cmap.get(code) ?? String.fromCharCode(Number.parseInt(code, 16));
  }

  return output;
};

const decodeTextArray = (value: string, cmap: Map<string, string>) => {
  let output = "";
  const tokenPattern = /\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f]+)>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value))) {
    output += match[0][0] === "("
      ? decodePdfLiteral(match[0].slice(1, -1))
      : decodePdfHex(match[1], cmap);
  }

  return output.replace(/\s+/g, " ").trim();
};

const extractChecklistRows = (buffer: Buffer) => {
  const streams = extractPdfStreams(buffer);
  const cmap = buildCMap(streams);
  const items: { page: number; text: string; x: number; y: number }[] = [];

  for (let page = 0; page < 9; page += 1) {
    const stream = streams[page];

    if (!stream) {
      continue;
    }

    for (const block of stream.matchAll(/BT([\s\S]*?)ET/g)) {
      const matrix = block[1].match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/);
      const textArray = block[1].match(/\[([\s\S]*?)\]\s*TJ/);

      if (!matrix || !textArray) {
        continue;
      }

      const text = decodeTextArray(textArray[1], cmap);

      if (text) {
        items.push({
          page: page + 1,
          text,
          x: Number(matrix[1]),
          y: Number(matrix[2]),
        });
      }
    }
  }

  const rowsFor = (pages: number[], codeTest: (text: string) => boolean) => {
    const rows: ChecklistRow[] = [];

    for (const page of pages) {
      const pageItems = items.filter((item) => item.page === page);
      const codes = pageItems.filter((item) => codeTest(item.text) && item.x < 125);

      for (const code of codes) {
        const rowItems = pageItems.filter((item) => Math.abs(item.y - code.y) < 0.2);
        const name = rowItems.find((item) => item.x > 130 && item.x < 400)?.text;
        const rookie = rowItems.some((item) => item.x > 400 && /Rookie/.test(item.text));

        if (name) {
          rows.push({ name, number: code.text, rookie });
        }
      }
    }

    return rows;
  };

  return {
    autographs: rowsFor([7, 8, 9], (text) => /^CA-/.test(text)),
    base: rowsFor([1, 2, 3, 4, 5, 6], (text) => /^\d+$/.test(text)),
  };
};

const sportsCardsProUrl = (consoleSlug: string, playerName: string, parallel: string, cardNumber: string) =>
  `https://www.sportscardspro.com/game/${consoleSlug}/${slugify(
    `${playerName} ${parallel} ${cardNumber}`,
  )}`;

async function main() {
  if (!db) {
    throw new Error("DATABASE_URL is missing. Add it to .env.local before importing.");
  }

  const response = await fetch(CHECKLIST_URL);

  if (!response.ok) {
    throw new Error(`Could not download checklist PDF: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const checklist = extractChecklistRows(buffer);
  const now = new Date();

  if (checklist.base.length !== 300 || checklist.autographs.length < 100) {
    throw new Error(
      `Unexpected checklist size. Base: ${checklist.base.length}, Autographs: ${checklist.autographs.length}`,
    );
  }

  const [sapphireSet] = await db
    .insert(cardSets)
    .values({
      brand: "Topps",
      name: "Topps Chrome Sapphire Tennis 2025",
      slug: "topps-chrome-sapphire-tennis-2025",
      sport: "Tennis",
      updatedAt: now,
      year: 2025,
    })
    .onConflictDoUpdate({
      target: cardSets.slug,
      set: {
        brand: "Topps",
        name: "Topps Chrome Sapphire Tennis 2025",
        sport: "Tennis",
        updatedAt: now,
        year: 2025,
      },
    })
    .returning();

  const baseRows: (typeof cards.$inferInsert)[] = checklist.base.flatMap((baseCard) =>
    BASE_PARALLELS.map((parallel) => ({
      cardName: baseCard.rookie
        ? "Topps Chrome Sapphire Tennis 2025 Rookie"
        : "Topps Chrome Sapphire Tennis 2025",
      cardNumber: Number(baseCard.number),
      imageUrl: null,
      parallel: parallel.name,
      playerName: baseCard.name,
      printRun: parallel.printRun,
      serialNumber: `/${parallel.printRun}`,
      setId: sapphireSet.id,
      slug: slugify(
        `${baseCard.name} topps chrome sapphire tennis 2025 ${baseCard.number} ${parallel.name} ${parallel.printRun}`,
      ),
      sourceName: `${baseCard.name} [${parallel.name}] #${baseCard.number} /${parallel.printRun}`,
      sourceUrl: sportsCardsProUrl(
        "tennis-cards-2025-topps-chrome-sapphire",
        baseCard.name,
        parallel.name,
        baseCard.number,
      ),
      status: "open" as const,
      updatedAt: now,
    })),
  );

  const autographRows: (typeof cards.$inferInsert)[] = checklist.autographs.flatMap((autograph) =>
    AUTOGRAPH_PARALLELS.map((parallel) => ({
      cardName: autograph.rookie
        ? "Topps Chrome Sapphire Tennis 2025 Autograph Rookie"
        : "Topps Chrome Sapphire Tennis 2025 Autograph",
      cardNumber: null,
      imageUrl: null,
      parallel: parallel.name,
      playerName: autograph.name,
      printRun: parallel.printRun,
      serialNumber: `/${parallel.printRun}`,
      setId: sapphireSet.id,
      slug: slugify(
        `${autograph.name} topps chrome sapphire tennis 2025 ${autograph.number} ${parallel.name} ${parallel.printRun}`,
      ),
      sourceName: `${autograph.name} [${parallel.name}] #${autograph.number} /${parallel.printRun}`,
      sourceUrl: sportsCardsProUrl(
        "tennis-cards-2025-topps-chrome-sapphire-autograph",
        autograph.name,
        parallel.name,
        autograph.number,
      ),
      status: "open" as const,
      updatedAt: now,
    })),
  );

  const importRows = [...baseRows, ...autographRows];
  const uniqueImportRows = Array.from(new Map(importRows.map((row) => [row.slug, row])).values());
  const duplicateCount = importRows.length - uniqueImportRows.length;
  const chunkSize = 250;

  for (let index = 0; index < uniqueImportRows.length; index += chunkSize) {
    const chunk = uniqueImportRows.slice(index, index + chunkSize);

    await db
      .insert(cards)
      .values(chunk)
      .onConflictDoUpdate({
        target: cards.slug,
        set: {
          cardName: sql`excluded.card_name`,
          cardNumber: sql`excluded.card_number`,
          imageUrl: sql`coalesce(${cards.imageUrl}, excluded.image_url)`,
          parallel: sql`excluded.parallel`,
          playerName: sql`excluded.player_name`,
          printRun: sql`excluded.print_run`,
          serialNumber: sql`excluded.serial_number`,
          setId: sapphireSet.id,
          sourceName: sql`excluded.source_name`,
          sourceUrl: sql`excluded.source_url`,
          updatedAt: now,
        },
      });

    console.log(`Imported ${Math.min(index + chunk.length, uniqueImportRows.length)} / ${uniqueImportRows.length}`);
  }

  console.log(
    `Imported ${uniqueImportRows.length} unique variants (${baseRows.length} base rows, ${autographRows.length} autograph rows${
      duplicateCount ? `, skipped ${duplicateCount} duplicate rows` : ""
    }) into Topps Chrome Sapphire Tennis 2025.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

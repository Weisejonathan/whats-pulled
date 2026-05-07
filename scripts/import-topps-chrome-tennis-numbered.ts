import "../lib/db/load-env";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { cards, cardSets, claims, listings, pullReports } from "../lib/db/schema";
import { slugify } from "../lib/slug";

const BASE_CHECKLIST = `
1 Carlos Alcaraz
2 Jessica Pegula
3 Daniil Medvedev
4 Elena Rybakina
5 Taylor Fritz
6 Jasmine Paolini
7 Andrey Rublev
8 Qinwen Zheng
9 Casper Ruud
10 Emma Navarro
11 Daria Kasatkina
12 Alex de Minaur
13 Beatriz Haddad Maia
14 Stefanos Tsitsipas
15 Danielle Collins
16 Tommy Paul
17 Anna Kalinskaya
18 Hubert Hurkacz
19 Barbora Krejcikova
20 Holger Rune
21 Paula Badosa
22 Frances Tiafoe
23 Jelena Ostapenko
24 Ugo Humbert
25 Diana Shnaider
26 Lorenzo Musetti
27 Mirra Andreeva
28 Jack Draper
29 Marta Kostyuk
30 Felix Auger-Aliassime
31 Donna Vekic
32 Arthur Fils
33 Madison Keys
34 Victoria Azarenka
35 Sebastian Korda
36 Ben Shelton
37 Liudmila Samsonova
38 Magdalena Frech
39 Karolina Muchova
40 Sebastian Baez
41 Elina Svitolina
42 Tomas Machac
43 Ekaterina Alexandrova
44 Jordan Thompson
45 Yulia Putintseva
46 Francisco Cerundolo
47 Anastasia Pavlyuchenkova
48 Flavio Cobolli Rookie
49 Alexander Bublik
50 Ons Jabeur
51 Nuno Borges
52 Tallon Griekspoor
53 Leylah Fernandez
54 Tomas Martin Etcheverry
55 Matteo Arnaldi Rookie
56 Amanda Anisimova
57 Pedro Martinez
58 Xinyu Wang
59 Jan-Lennard Struff
60 Magda Linette
61 Carel Ngounoue Rookie
62 Alejandro Tabilo
63 Caroline Garcia
64 Mariano Navone Rookie
65 Yue Yuan
66 Roberto Bautista Agut
67 Elina Avanesyan Rookie
68 Peyton Stearns Rookie
69 Juncheng Shang
70 Marcos Giron
71 Katerina Siniakova
72 Lorenzo Sonego
73 Giovanni Mpetshi Perricard Rookie
74 Diane Parry
75 Jakub Mensik
76 Elisabetta Cocciaretto
77 Cameron Norrie
78 Clara Burel
79 Emma Raducanu
80 Naomi Osaka
81 Miomir Kecmanovic
82 Alexander Shevchenko Rookie
83 Roman Safiullin
84 Arthur Rinderknech
85 Kamilla Rakhimova
86 Veronika Kudermetova
87 Camila Osorio
88 Yoshihito Nishioka
89 Ashlyn Krueger
90 Zizou Bergs
91 Erika Andreeva
92 Taylor Townsend
93 Alexandre Muller
94 Varvara Gracheva
95 Corentin Moutet
96 Christopher O'Connell
97 Hugo Gaston
98 Clervie Ngounoue Rookie
99 Dusan Lajovic
100 Novak Djokovic
101 Jaqueline Cristian
102 Sloane Stephens
103 Yunchaokete Bu Rookie
104 Fabio Fognini
105 Harriet Dart
106 Sebastian Ofner
107 Hailey Baptiste
108 Sumit Nagal
109 Ajla Tomljanovic
110 Olivia Gadecki Rookie
111 Dominik Koepfer
112 Anna Blinkova
113 Emil Ruusuvuori
114 Gabriel Diallo
115 Marton Fucsovics
116 Taro Daniel
117 Quentin Halys
118 Yannick Hanfmann Rookie
119 Jake Fearnley Rookie
120 Max Purcell
121 Mayar Sherif
122 Borna Coric
123 Denis Shapovalov
124 Tatjana Maria
125 Thiago Monteiro
126 Aleksandar Kovacevic
127 Xiyu Wang
128 Irina-Camelia Begu
129 Lin Zhu
130 Chloe Paquet
131 Damir Dzumhur
132 Sara Sorribes Tormo
133 Robin Montgomery
134 Hugo Dellien
135 Alexander Ritschard
136 Ann Li
137 Jesper de Jong
138 Mikhail Kukushkin
139 Julia Riera Rookie
140 Otto Virtanen
141 Luca Van Assche
142 Thiago Agustin Tirante Rookie
143 Chris Eubanks
144 Brenda Fruhvirtova
145 Mackenzie McDonald
146 Lesia Tsurenko
147 Learner Tien
148 Chun-Hsin Tseng
149 Valentin Vacherot Rookie
150 Laslo Djere
151 Martina Trevisan
152 Roman Andres Burruchaga Rookie
153 Lloyd Harris
154 Leandro Riedi
155 Dalma Galfi
156 Facundo Bagnis
157 Heather Watson
158 Marco Trungelliti
159 Celine Naef
160 Maximilian Marterer
161 Albert Ramos-Vinolas
162 Matteo Gigante Rookie
163 Kei Nishikori
164 Garbine Muguruza
165 Elsa Jacquemot Rookie
166 Radu Albot
167 Jaime Faria Rookie
168 Coleman Wong
169 Mitchell Krueger
170 Cristian Garin
171 Alexandra Eala
172 Marc-Andrea Huesler
173 Juan Manuel Cerundolo
174 Vit Kopriva
175 Terence Atmane Rookie
176 Hugo Grenier
177 Jil Teichmann
178 Panna Udvardy
179 Hamad Medjedovic
180 Andy Murray
181 Sofia Kenin
182 Gregoire Barrere
183 Martin Landaluce
184 Tristan Boyer Rookie
185 Bianca Andreescu
186 Stefano Napolitano
187 Taylah Preston
188 Zachary Svajda
189 Raphael Collignon Rookie
190 Titouan Droguet
191 Gijs Brouwer
192 Maja Chwalinska
193 Patrick Kypson
194 Juan Pablo Ficovich Rookie
195 Constant Lestienne
196 Leolia Jeanjean Rookie
197 Omar Jasika
198 Kayla Day
199 Timofey Skatov Rookie
200 Coco Gauff
201 Tamara Zidansek
202 Linda Fruhvirtova
203 Marie Benoit
204 Louisa Chirico
205 Jennifer Brady
206 Emiliana Arango
207 Liv Hovde
208 Iva Jovic Rookie
209 Martin Damm Jr.
210 Harold Mayot
211 Petra Kvitova
212 Belinda Bencic
213 Altug Celikbilek
214 Genie Bouchard
215 Nick Kyrgios
216 Kaylan Bigun Rookie
217 Katie Volynets
218 Cooper Woestendick Rookie
219 Andy Roddick
220 Benoit Paire
221 Alex Molcan
222 Andrea Pellegrino
223 Dalibor Svrcina
224 Clement Chidekh
225 Marin Cilic
226 Pablo Carreno Busta
227 Emilio Nava
228 Juan Pablo Varillas
229 Enzo Couacaud
230 Nicolas Mejia
231 Ethan Quinn
232 Denis Yevseyev
233 Michael Mmoh
234 Antoine Escoffier
235 Denis Kudla
236 Giulio Zeppieri
237 Abdullah Shelbayh
238 J.J. Wolf
239 Marc Polmans
240 Alexis Galarneau Rookie
241 Andrea Vavassori
242 Shintaro Mochizuki
243 Maxime Janvier
244 Andre Agassi
245 Steffi Graf
246 Carlos Costa
247 Sergi Bruguera
248 Saisai Zheng
249 Eliakim Coulibaly Rookie
250 Alexander Zverev
251 Bethanie Mattek-Sands
252 Luca Udvardy
253 Tara Wuerth Rookie
254 Katrina Scott Rookie
255 Kirsten Flipkens
256 Xinyun Han
257 Kimberley Zimmermann
258 Rebecca Peterson
259 Shelby Rogers
260 Lauren Davis
261 Viktorija Golubic
262 Ilya Ivashka
263 Filip Krajinovic
264 Nadia Podoroska
265 Dimitar Kuzmanov
266 Illya Marchenko
267 Franco Agamenone
268 Nerman Fatic
269 Lukas Neumayer Rookie
270 Andrea Collarini
271 Laurent Lokoli
272 Steve Johnson
273 Francesco Maestrelli Rookie
274 Cem Ilkel
275 Tennys Sandgren
276 Tristan Lamasine
277 Renzo Olivo
278 Lorenzo Giustino
279 Emilio Gomez
280 Adam Pavlasek
281 Rafael Nadal
282 Gabriel Debru Rookie
283 Fabian Marozsan Rookie
284 Marketa Vondrousova
285 Maria Sakkari
286 Karen Khachanov
287 Maya Joint Rookie
288 Jack Sock
289 Grigor Dimitrov
290 Linda Noskova Rookie
291 Alex Michelsen Rookie
292 Jagger Leach Rookie
293 Alycia Parks Rookie
294 Kilian Feldbausch
295 Arthur Cazaux Rookie
296 Luciano Darderi Rookie
297 Marina Stakusic Rookie
298 Alexei Popyrin
299 Thanasi Kokkinakis
300 Iga Swiatek
`;

const NUMBERED_PARALLELS = [
  { name: "Aqua Refractor", printRun: 199 },
  { name: "Blue Refractor", printRun: 150 },
  { name: "Purple", printRun: 125 },
  { name: "Green Refractor", printRun: 99 },
  { name: "Pink Geometric Refractor", printRun: 65 },
  { name: "Gold Geometric Refractor", printRun: 50 },
  { name: "Gold Refractor", printRun: 50 },
  { name: "Orange Geometric Refractor", printRun: 25 },
  { name: "Orange Refractor", printRun: 25 },
  { name: "Black Refractor", printRun: 10 },
  { name: "Purple Geometric Refractor", printRun: 10 },
  { name: "Black Geometric Refractor", printRun: 2 },
  { name: "Red Geometric Refractor", printRun: 5 },
  { name: "Red Refractor", printRun: 5 },
  { name: "Superfractor", printRun: 1 },
];

type BaseCard = {
  cardNumber: number;
  playerName: string;
  isRookie: boolean;
};

const parseBaseChecklist = (): BaseCard[] =>
  BASE_CHECKLIST.trim()
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/^(\d{1,3})\s+(.+?)(?:\s+Rookie)?$/);

      if (!match) {
        throw new Error(`Could not parse checklist line: ${line}`);
      }

      return {
        cardNumber: Number(match[1]),
        playerName: match[2],
        isRookie: line.endsWith(" Rookie"),
      };
    });

const sportsCardsProUrl = (playerName: string, parallel: string, cardNumber: number) =>
  `https://www.sportscardspro.com/game/tennis-cards-2025-topps-chrome/${slugify(
    `${playerName} ${parallel} ${cardNumber}`,
  )}`;

const db = getDb();

async function findCardBySlug(slug: string) {
  if (!db) {
    return undefined;
  }

  const [card] = await db
    .select({
      id: cards.id,
      status: cards.status,
      estimatedValue: cards.estimatedValue,
    })
    .from(cards)
    .where(eq(cards.slug, slug))
    .limit(1);

  return card;
}

async function mergeDemoCard(oldSlug: string, newSlug: string, now: Date) {
  if (!db) {
    return;
  }

  const oldCard = await findCardBySlug(oldSlug);
  const newCard = await findCardBySlug(newSlug);

  if (!oldCard || !newCard) {
    return;
  }

  await db
    .update(pullReports)
    .set({ cardId: newCard.id, updatedAt: now })
    .where(eq(pullReports.cardId, oldCard.id));

  await db
    .update(claims)
    .set({ cardId: newCard.id, updatedAt: now })
    .where(eq(claims.cardId, oldCard.id));

  await db
    .update(listings)
    .set({ cardId: newCard.id, updatedAt: now })
    .where(eq(listings.cardId, oldCard.id));

  await db
    .update(cards)
    .set({
      status: oldCard.status,
      estimatedValue: oldCard.estimatedValue,
      updatedAt: now,
    })
    .where(eq(cards.id, newCard.id));

  await db.delete(cards).where(eq(cards.id, oldCard.id));
}

async function deleteDemoCard(slug: string) {
  if (!db) {
    return;
  }

  const demoCard = await findCardBySlug(slug);

  if (demoCard) {
    await db.delete(cards).where(eq(cards.id, demoCard.id));
  }
}

async function main() {
  if (!db) {
    throw new Error("DATABASE_URL is missing. Add it to .env.local before importing.");
  }

  const now = new Date();
  const baseCards = parseBaseChecklist();

  const [tennisSet] = await db
    .insert(cardSets)
    .values({
      name: "Topps Chrome Tennis 2025",
      slug: "topps-chrome-tennis-2025",
      brand: "Topps",
      year: 2025,
      sport: "Tennis",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cardSets.slug,
      set: {
        name: "Topps Chrome Tennis 2025",
        brand: "Topps",
        year: 2025,
        sport: "Tennis",
        updatedAt: now,
      },
    })
    .returning();

  const importRows: (typeof cards.$inferInsert)[] = baseCards.flatMap((baseCard) =>
    NUMBERED_PARALLELS.map((parallel) => {
      const serialNumber = `/${parallel.printRun}`;
      const sourceName = `${baseCard.playerName} [${parallel.name}] #${baseCard.cardNumber} ${serialNumber}`;

      return {
        setId: tennisSet.id,
        playerName: baseCard.playerName,
        slug: slugify(`${baseCard.playerName} ${serialNumber} ${parallel.name}`),
        cardName: baseCard.isRookie
          ? "Topps Chrome Tennis 2025 Rookie"
          : "Topps Chrome Tennis 2025",
        cardNumber: baseCard.cardNumber,
        parallel: parallel.name,
        serialNumber,
        printRun: parallel.printRun,
        status: "open" as const,
        sourceUrl: sportsCardsProUrl(
          baseCard.playerName,
          parallel.name,
          baseCard.cardNumber,
        ),
        sourceName,
        imageUrl: null,
        updatedAt: now,
      };
    }),
  );

  const chunkSize = 250;

  for (let index = 0; index < importRows.length; index += chunkSize) {
    const chunk = importRows.slice(index, index + chunkSize);

    await db
      .insert(cards)
      .values(chunk)
      .onConflictDoUpdate({
        target: cards.slug,
        set: {
          setId: tennisSet.id,
          playerName: sql`excluded.player_name`,
          cardName: sql`excluded.card_name`,
          cardNumber: sql`excluded.card_number`,
          parallel: sql`excluded.parallel`,
          serialNumber: sql`excluded.serial_number`,
          printRun: sql`excluded.print_run`,
          imageUrl: sql`coalesce(${cards.imageUrl}, excluded.image_url)`,
          sourceUrl: sql`excluded.source_url`,
          sourceName: sql`excluded.source_name`,
          updatedAt: now,
        },
      });

    console.log(`Imported ${Math.min(index + chunk.length, importRows.length)} / ${importRows.length}`);
  }

  await mergeDemoCard("carlos-alcaraz-1-1-superfractor", "carlos-alcaraz-1-superfractor", now);
  await deleteDemoCard("novak-djokovic-1-1-superfractor");
  await deleteDemoCard("jannik-sinner-red-refractor-5");

  console.log(
    `Imported ${importRows.length} numbered Topps Chrome Tennis 2025 base parallel cards.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

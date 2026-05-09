import "../lib/db/load-env";

type RecognitionPayload = {
  cardName: string;
  cardNumber: string;
  confidence: number;
  frameImageUrl?: string;
  isAutographed: boolean;
  limitation: string;
  playerName: string;
  setName: string;
  source: string;
};

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith("--")) {
      return [];
    }

    const [key, inlineValue] = arg.slice(2).split("=");
    const nextValue = allArgs[index + 1]?.startsWith("--") ? undefined : allArgs[index + 1];
    return [[key, inlineValue ?? nextValue ?? "true"]];
  }),
);

const apiUrl = args.get("api-url") ?? process.env.DETECTOR_API_URL ?? "http://localhost:3000";
const overlayKey = args.get("overlay-key") ?? process.env.OVERLAY_KEY ?? "demo";

const samples: RecognitionPayload[] = [
  {
    cardName: "Superfractor Auto",
    cardNumber: "1",
    confidence: 0.98,
    frameImageUrl: "/card-images/novak-djokovic-superfractor-1-1.jpg",
    isAutographed: true,
    limitation: "1/1",
    playerName: "Novak Djokovic",
    setName: "Topps Chrome Tennis 2025",
    source: "obs-detector-mock",
  },
  {
    cardName: "Red Refractor",
    cardNumber: "23",
    confidence: 0.91,
    isAutographed: false,
    limitation: "/5",
    playerName: "Carlos Alcaraz",
    setName: "Topps Chrome Tennis 2025",
    source: "obs-detector-mock",
  },
];

async function postRecognition(payload: RecognitionPayload) {
  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/obs/recognitions/${overlayKey}`;
  const response = await fetch(endpoint, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  console.log(`Posted ${payload.playerName} ${payload.limitation} to ${endpoint}`);
}

async function main() {
  const repeat = args.get("repeat") === "true";

  do {
    for (const sample of samples) {
      await postRecognition(sample);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } while (repeat);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

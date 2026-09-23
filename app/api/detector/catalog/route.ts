import { loadDetectorPlayers, loadDetectorSets, loadDetectorPrintRuns } from "@/lib/detector/catalog";

export async function GET(request: Request) {
  const sets = await loadDetectorSets();
  const setId = new URL(request.url).searchParams.get("setId");
  if (setId && !sets.some((set) => set.id === setId)) return Response.json({ error: "Unknown set." }, { status: 400 });
  const [players, printRuns] = await Promise.all([loadDetectorPlayers(setId), setId ? loadDetectorPrintRuns(setId) : Promise.resolve([])]);
  return Response.json({ sets, players, printRuns });
}

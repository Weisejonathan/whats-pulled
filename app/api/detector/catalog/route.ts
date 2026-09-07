import { hasAdminSession } from "@/lib/auth";
import { loadDetectorPlayers, loadDetectorSets } from "@/lib/detector/catalog";

export async function GET(request: Request) {
  if (!(await hasAdminSession())) return Response.json({ error: "Admin login required." }, { status: 401 });
  const sets = await loadDetectorSets();
  const setId = new URL(request.url).searchParams.get("setId");
  if (setId && !sets.some((set) => set.id === setId)) return Response.json({ error: "Unknown set." }, { status: 400 });
  return Response.json({ sets, players: await loadDetectorPlayers(setId) });
}

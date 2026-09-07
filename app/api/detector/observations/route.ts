import { hasAdminSession } from "@/lib/auth";
import { createObservation, listObservations } from "@/lib/detector/observations";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET() {
  if (!(await hasAdminSession())) return Response.json({ error: "Admin login required." }, { status: 401 });
  try { return Response.json({ observations: await listObservations() }); }
  catch { return Response.json({ error: "The review queue could not be loaded." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return Response.json({ error: "Admin login required." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 5_500_000) return Response.json({ error: "Image too large." }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "JSON payload expected." }, { status: 400 });
  try { return Response.json({ observation: await createObservation(body) }, { status: 201 }); }
  catch (error) { console.error("Detector save failed", error instanceof Error ? error.name : "Error"); return Response.json({ error: "Could not save this frame. Check its set and image, then retry; the local copy is retained." }, { status: 400 }); }
}

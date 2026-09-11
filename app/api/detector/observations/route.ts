import { getDetectorAccess } from "@/lib/detector/access";
import { isDetectorWriteRequest } from "@/lib/detector/access-policy";
import { consumeUploadBudget } from "@/lib/detector/budget";
import { createObservation, listObservations } from "@/lib/detector/observations";
import { DetectorStorageError } from "@/lib/detector/storage-provider";
import { recordToolEvent } from "@/lib/db/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  const access = await getDetectorAccess(true);
  try { return Response.json({ observations: await listObservations(access), isAdmin: access.isAdmin }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "The review queue could not be loaded." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!isDetectorWriteRequest(request)) return Response.json({ error: "A same-origin JSON request is required." }, { status: 403 });
  const access = await getDetectorAccess();
  if (!access.isAdmin && !access.ownerKey) return Response.json({ error: "Please reload the Stream Detector and allow its browser cookie. No login is needed." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 5_500_000) return Response.json({ error: "Image too large." }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "JSON payload expected." }, { status: 400 });
  try {
    if (!(await consumeUploadBudget())) return Response.json({ error: "Upload limit reached. The local frame is retained; please retry later." }, { status: 429, headers: { "Retry-After": "60" } });
    const observation = await createObservation(body, access);
    await recordToolEvent({
      tool: "frame-upload",
      sessionId: request.headers.get("x-wp-session-id"),
      inputUnits: Number(request.headers.get("content-length") ?? 0),
    });
    return Response.json({ observation }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) {
    const known = error instanceof DetectorStorageError;
    const reference = crypto.randomUUID();
    // Never log image bytes, URLs, database parameters or provider credentials.
    console.error("Detector save failed", { reference, code: known ? error.code : "save_failed", name: error instanceof Error ? error.name : "Error", cause: error instanceof Error && error.cause instanceof Error ? error.cause.name : undefined });
    return Response.json({ code: known ? error.code : "save_failed", reference,
      error: known ? error.message : "The server could not save this capture. Please retry or contact support with reference " + reference + ". Your local copy is retained." },
      { status: known && error.code === "invalid_image" ? 400 : 503 });
  }
}

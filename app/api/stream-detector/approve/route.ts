import { getDetectorAccess } from "@/lib/detector/access";
import { isDetectorWriteRequest } from "@/lib/detector/access-policy";
import { approveObservation, canAccessObservation, deliverObservationOverlay } from "@/lib/detector/observations";
import { isUuid } from "@/lib/detector/types";

// Legacy URL retained, but direct cardId writes are no longer allowed.
export async function POST(request: Request) {
  if (!isDetectorWriteRequest(request)) return Response.json({ error: "A same-origin JSON request is required." }, { status: 403 });
  const access = await getDetectorAccess();
  const body = await request.json().catch(() => null);
  if (!body || !isUuid(body.observationId) || !Number.isInteger(body.revision) || typeof body.pulledBy !== "string" || !body.pulledBy.trim()) {
    return Response.json({ error: "Save and select the card in the review queue before approving." }, { status: 400 });
  }
  try {
    if (!(await canAccessObservation(body.observationId, access))) return Response.json({ error: "This entry belongs to another browser or requires admin access." }, { status: 403 });
    const observation = await approveObservation(body.observationId, body.revision, body.pulledBy.trim().slice(0, 160));
    return Response.json({ ok: true, observation: await deliverObservationOverlay(observation.id) });
  } catch {
    return Response.json({ error: "Approval refused. Reload the observation and check the card and full serial." }, { status: 409 });
  }
}

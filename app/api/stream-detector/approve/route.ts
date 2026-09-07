import { hasAdminSession } from "@/lib/auth";
import { approveObservation, deliverObservationOverlay } from "@/lib/detector/observations";
import { isUuid } from "@/lib/detector/types";

// Legacy URL retained, but direct cardId writes are no longer allowed.
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return Response.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !isUuid(body.observationId) || !Number.isInteger(body.revision) || typeof body.pulledBy !== "string" || !body.pulledBy.trim()) {
    return Response.json({ error: "Save and select the card in the review queue before approving." }, { status: 400 });
  }
  try {
    const observation = await approveObservation(body.observationId, body.revision, body.pulledBy.trim().slice(0, 160));
    return Response.json({ ok: true, observation: await deliverObservationOverlay(observation.id) });
  } catch {
    return Response.json({ error: "Approval refused. Reload the observation and check the card and full serial." }, { status: 409 });
  }
}

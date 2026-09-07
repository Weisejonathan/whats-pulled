import { hasAdminSession } from "@/lib/auth";
import { approveObservation, deliverObservationOverlay, editObservation, retractObservation } from "@/lib/detector/observations";
import { isUuid } from "@/lib/detector/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminSession())) return Response.json({ error: "Admin login required." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isUuid(id) || !body || !Number.isInteger(body.revision)) return Response.json({ error: "Invalid observation or revision." }, { status: 400 });
  try {
    let observation;
    if (body.action === "approve") {
      const pulledBy = typeof body.pulledBy === "string" ? body.pulledBy.trim().slice(0, 160) : "";
      if (!pulledBy) return Response.json({ error: "Pulled by is required." }, { status: 400 });
      observation = await approveObservation(id, body.revision, pulledBy);
      observation = await deliverObservationOverlay(observation.id);
    } else if (body.action === "reject") observation = await retractObservation(id, body.revision);
    else if (body.action === "retry-overlay") observation = await deliverObservationOverlay(id);
    else if (body.action === "edit" || body.action === "select") observation = await editObservation(id, body);
    else return Response.json({ error: "Unknown action." }, { status: 400 });
    return Response.json({ observation });
  } catch {
    return Response.json({ error: "Update refused: reload this entry, check the selected card and full serial, and ensure the copy is not already registered." }, { status: 409 });
  }
}

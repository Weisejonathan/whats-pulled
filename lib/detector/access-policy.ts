export type DetectorAccess = { isAdmin: boolean; ownerKey: string | null };

/** A public visitor can manage only observations created by the same browser. */
export function canManageObservation(access: DetectorAccess, ownerKey: unknown) {
  return access.isAdmin || Boolean(access.ownerKey && typeof ownerKey === "string" && access.ownerKey === ownerKey);
}

export function isDetectorWriteRequest(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

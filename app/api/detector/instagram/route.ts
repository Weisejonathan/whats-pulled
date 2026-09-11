export const dynamic = "force-dynamic";

// Retired: all capture and approval now goes through the unified review queue.
function retired() {
  return Response.json({ error: "This legacy detector endpoint has been retired. Use /stream-detector or /detector and the review queue.", detectorUrl: "/stream-detector" }, { status: 410 });
}
export const GET = retired;
export const POST = retired;

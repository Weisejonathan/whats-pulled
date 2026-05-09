import { NextResponse } from "next/server";
import { getBreakSessionByOverlayKey } from "@/lib/db/live-breaks";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    overlayKey: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { overlayKey } = await context.params;
  const session = await getBreakSessionByOverlayKey(overlayKey);

  if (!session) {
    return NextResponse.json({ error: "Overlay session not found." }, { status: 404 });
  }

  return NextResponse.json(session);
}

import { notFound } from "next/navigation";
import { getBreakSessionByOverlayKey } from "@/lib/db/live-breaks";
import { OverlayClient } from "./overlay-client";

export const dynamic = "force-dynamic";

type OverlayPageProps = {
  params: Promise<{
    overlayKey: string;
  }>;
};

export default async function OverlayPage({ params }: OverlayPageProps) {
  const { overlayKey } = await params;
  const session = await getBreakSessionByOverlayKey(overlayKey);

  if (!session) {
    notFound();
  }

  return <OverlayClient initialSession={session} overlayKey={overlayKey} />;
}

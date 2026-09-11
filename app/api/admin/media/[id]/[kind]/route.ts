import { eq } from "drizzle-orm";
import { hasAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { directUploadVerifications } from "@/lib/db/schema";
import { signPrivateMedia } from "@/lib/storage/r2";
import { isUuid } from "@/lib/detector/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!(await hasAdminSession())) return new Response("Unauthorized", { status: 401, headers });
  const { id, kind } = await params;
  if (!isUuid(id) || !["image", "video"].includes(kind)) return new Response("Not found", { status: 404, headers });
  const db = getDb();
  if (!db) return new Response("Database unavailable", { status: 503, headers });
  const [row] = await db.select({ reference: kind === "image" ? directUploadVerifications.cardImageDataUrl : directUploadVerifications.videoDataUrl })
    .from(directUploadVerifications).where(eq(directUploadVerifications.id, id)).limit(1);
  if (!row?.reference.startsWith("r2-private:")) return new Response("Not found", { status: 404, headers });
  return new Response(null, { status: 307, headers: { ...headers, Location: await signPrivateMedia(row.reference) } });
}

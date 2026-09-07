import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";

type CardImageRouteProps = {
  params: Promise<{ slug: string }>;
};

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(_request: Request, { params }: CardImageRouteProps) {
  const db = getDb();

  if (!db) {
    return new Response("Database unavailable", { status: 503 });
  }

  const { slug } = await params;
  const [card] = await db
    .select({ imageUrl: cards.imageUrl })
    .from(cards)
    .where(eq(cards.slug, slug))
    .limit(1);
  const imageUrl = card?.imageUrl?.trim();

  if (!imageUrl) {
    return new Response("Image not found", { status: 404 });
  }

  if (!imageUrl.startsWith("data:")) {
    try {
      const target = new URL(imageUrl);

      if (target.protocol === "https:" || target.protocol === "http:") {
        return Response.redirect(target, 307);
      }
    } catch {
      // Invalid legacy image values are handled as missing images below.
    }

    return new Response("Image not found", { status: 404 });
  }

  const match = imageUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);

  if (!match) {
    return new Response("Invalid image data", { status: 422 });
  }

  try {
    const source = Buffer.from(match[2], "base64");
    const optimized = await sharp(source)
      .rotate()
      .resize({
        fit: "inside",
        height: 1400,
        width: 1400,
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer();

    return new Response(new Uint8Array(optimized), {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Length": String(optimized.byteLength),
        "Content-Type": "image/webp",
      },
    });
  } catch (error) {
    console.error("Failed to optimize card image", { error: String(error), slug });
    return new Response("Image processing failed", { status: 500 });
  }
}

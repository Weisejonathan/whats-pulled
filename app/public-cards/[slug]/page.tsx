import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/site-header";
import { getCardCatalog } from "@/lib/db/catalog";
import { PublicCardDetail } from "../public-card-detail";

// No cookies, session data or query-dependent server rendering in this route.
// Public data mutations invalidate its catalog dependency through the shared tag.
export const revalidate = 3600;
export const dynamic = "error";
export const dynamicParams = true;
export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { alternates: { canonical: `https://whatspulled.com/cards/${encodeURIComponent(slug)}` } };
}

export default async function PublicCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getCardCatalog(slug);
  if (!detail) notFound();
  return <PublicCardDetail detail={detail} header={<SiteHeader anonymous links={[
    { href: "/", label: "Home" }, { href: "/sports", label: "Sports" },
    { href: `/sets/${detail.set.slug}`, label: detail.set.name },
  ]} />} />;
}

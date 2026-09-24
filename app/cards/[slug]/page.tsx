import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/site-header";
import { getUserSession, hasAdminSession } from "@/lib/auth";
import { getCardCatalog } from "@/lib/db/catalog";
import { CardDetail, type CardQuery } from "../card-detail";

export const dynamic = "force-dynamic";

export default async function CardPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CardQuery>;
}) {
  const { slug } = await params;
  const [detail, query, isLoggedIn, user] = await Promise.all([
    getCardCatalog(slug), searchParams, hasAdminSession(), getUserSession(),
  ]);
  if (!detail) notFound();
  return <CardDetail detail={detail} query={query} isLoggedIn={isLoggedIn}
    user={user ? { displayName: user.displayName } : null}
    header={<SiteHeader links={[
      { href: "/", label: "Home" }, { href: "/sports", label: "Sports" },
      { href: `/sets/${detail.set.slug}`, label: detail.set.name },
    ]} />} />;
}

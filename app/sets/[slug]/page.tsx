import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/site-header";
import { SetChecklistSearch } from "./set-checklist-search";
import { getSetCatalog, groupCatalogCards } from "@/lib/db/catalog";

type SetPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SetPage({ params }: SetPageProps) {
  const { slug } = await params;
  const set = await getSetCatalog(slug);

  if (!set) {
    notFound();
  }

  const cardGroups = groupCatalogCards(set.cards);

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
          { href: `/sports/${set.sportSlug}`, label: set.sport },
        ]}
      />

      <section className="catalog-hero">
        <p className="eyebrow">
          {set.sport} · {set.brand} · {set.year}
        </p>
        <h1>{set.name}</h1>
        <p>
          {cardGroups.length} base cards · {set.cards.length} tracked variants in this set.
        </p>
      </section>

      <section className="set-stack">
        <article className="set-section">
          <div className="set-section-heading">
            <div>
              <p className="eyebrow">Checklist</p>
              <h2>Card summary</h2>
            </div>
          </div>

          <SetChecklistSearch groups={cardGroups} />
        </article>
      </section>
    </main>
  );
}

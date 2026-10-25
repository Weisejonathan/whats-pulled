import { setCoverImages } from "@/lib/set-cover-images";
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

  const cardGroups = groupCatalogCards(set.cards).map((group) => ({
    ...group,
    variants: group.variants.map(({ id, slug, serial, parallel, printRun, pulledCount, status }) => ({
      id, slug, serial, parallel, printRun, pulledCount, status,
    })),
  }));

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
        {setCoverImages[set.slug] && <img src={setCoverImages[set.slug]} alt={`${set.name} Hobby Box`} width={180} height={180} style={{ objectFit: "contain", maxWidth: "100%" }} />}
        <p className="eyebrow">
          {set.sport} · {set.brand} · {set.year}
        </p>
        <h1>{set.name}</h1>
        <p>
          {cardGroups.length} checklist cards · {set.cards.length} tracked variants in this set.
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

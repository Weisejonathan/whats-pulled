import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/site-header";
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

          <div className="catalog-card-list">
            {cardGroups.map((group) => (
              <div
                className={`catalog-card-row grouped-card-row ${
                  group.isComplete ? "complete" : "open"
                }`}
                key={group.key}
              >
                <div className="catalog-card-media">
                  {group.primary.imageUrl ? (
                    <img
                      src={group.primary.imageUrl}
                      alt={`${group.primary.player} ${group.primary.serial}`}
                    />
                  ) : (
                    <div className={`mini-card ${group.isComplete ? "claimed" : "pulled"}`}>
                      <span>#{group.primary.cardNumber ?? "-"}</span>
                    </div>
                  )}
                </div>
                <div className="card-info">
                  <h3>{group.primary.player}</h3>
                  <p>
                    {[
                      group.primary.cardNumber ? `#${group.primary.cardNumber}` : null,
                      group.primary.cardName,
                      `${group.completeVariants}/${group.variants.length} variants complete`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {group.primary.sourceUrl ? (
                    <a
                      className="source-link"
                      href={group.primary.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      SportsCardsPro
                    </a>
                  ) : null}
                  <div className="variant-button-row">
                    {group.variants.map((variant) => {
                      const isVariantComplete =
                        variant.printRun && variant.pulledCount >= variant.printRun;

                      return (
                        <a
                          className={`variant-button ${isVariantComplete ? "complete" : "open"}`}
                          href={`/cards/${variant.slug}`}
                          key={variant.id}
                        >
                          <span>{variant.serial}</span>
                          <small>{variant.parallel ?? "Base"}</small>
                        </a>
                      );
                    })}
                  </div>
                </div>
                <span className={`status-pill ${group.isComplete ? "claimed" : "pulled"}`}>
                  {group.isComplete ? "Complete" : "Open"}
                </span>
                <div className="value-cell">
                  <span>
                    {group.pulledCopies} / {group.totalCopies} pulled
                  </span>
                  <strong>
                    {group.completeVariants} of {group.variants.length} variants
                  </strong>
                </div>
                <a className="row-action" href={`/cards/${group.primary.slug}`}>
                  Open
                </a>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

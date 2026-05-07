import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/site-header";
import { getSportCatalog, groupCatalogCards } from "@/lib/db/catalog";

type SportPageProps = {
  params: Promise<{
    sport: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SportPage({ params }: SportPageProps) {
  const { sport } = await params;
  const catalog = await getSportCatalog(sport);

  if (!catalog) {
    notFound();
  }

  const cardCount = catalog.sets.reduce((total, set) => total + set.cards.length, 0);

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
          { href: "#sets", label: "Sets" },
        ]}
      />

      <section className="catalog-hero">
        <p className="eyebrow">Sport</p>
        <h1>{catalog.sport}</h1>
        <p>
          {catalog.sets.length} sets · {cardCount} tracked cards
        </p>
      </section>

      <section className="set-stack" id="sets">
        {catalog.sets.map((set) => (
          <article className="set-section" key={set.id}>
            <div className="set-section-heading">
              <div>
                <p className="eyebrow">
                  {set.brand} · {set.year}
                </p>
                <h2>{set.name}</h2>
              </div>
              <a href={`/sets/${set.slug}`}>Open Set</a>
            </div>

            <div className="catalog-card-list">
              {groupCatalogCards(set.cards).map((group) => (
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
                    <div className="card-title-row">
                      <h3>{group.primary.player}</h3>
                      {group.primary.isRookie ? <span className="rc-badge">RC</span> : null}
                    </div>
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
        ))}
      </section>
    </main>
  );
}

import { notFound } from "next/navigation";
import { AuthNav } from "@/app/auth-nav";
import { type CatalogCard, getSetCatalog } from "@/lib/db/catalog";

type SetPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

type CardGroup = {
  key: string;
  primary: CatalogCard;
  variants: CatalogCard[];
  pulledCopies: number;
  totalCopies: number;
  completeVariants: number;
  isComplete: boolean;
};

const sortVariants = (variants: CatalogCard[]) =>
  [...variants].sort((a, b) => (a.printRun ?? 999999) - (b.printRun ?? 999999));

const groupCards = (cards: CatalogCard[]): CardGroup[] => {
  const groups = new Map<string, CatalogCard[]>();

  for (const card of cards) {
    const key = card.cardNumber ? String(card.cardNumber) : card.slug;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }

  return Array.from(groups.entries())
    .map(([key, cardsInGroup]) => {
      const variants = sortVariants(cardsInGroup);
      const primary =
        variants.find((card) => card.parallel?.toLowerCase().includes("superfractor")) ??
        variants[0];
      const totalCopies = variants.reduce(
        (total, card) => total + Math.max(card.printRun ?? 1, 1),
        0,
      );
      const pulledCopies = variants.reduce(
        (total, card) => total + Math.min(card.pulledCount, card.printRun ?? card.pulledCount),
        0,
      );
      const completeVariants = variants.filter(
        (card) => card.printRun && card.pulledCount >= card.printRun,
      ).length;

      return {
        key,
        primary,
        variants,
        pulledCopies,
        totalCopies,
        completeVariants,
        isComplete: totalCopies > 0 && pulledCopies >= totalCopies,
      };
    })
    .sort(
      (a, b) =>
        (a.primary.cardNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.primary.cardNumber ?? Number.MAX_SAFE_INTEGER),
    );
};

export default async function SetPage({ params }: SetPageProps) {
  const { slug } = await params;
  const set = await getSetCatalog(slug);

  if (!set) {
    notFound();
  }

  const cardGroups = groupCards(set.cards);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">W</span>
          <span>Whats Pulled</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/sports">Sports</a>
          <a href={`/sports/${set.sportSlug}`}>{set.sport}</a>
          <AuthNav />
        </nav>
      </header>

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

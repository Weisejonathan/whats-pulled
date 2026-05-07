import { notFound } from "next/navigation";
import { AuthNav } from "@/app/auth-nav";
import { getSetCatalog } from "@/lib/db/catalog";

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
        <p>{set.cards.length} tracked cards in this set.</p>
      </section>

      <section className="set-stack">
        <article className="set-section">
          <div className="set-section-heading">
            <div>
              <p className="eyebrow">Checklist</p>
              <h2>Individual cards</h2>
            </div>
          </div>

          <div className="catalog-card-list">
            {set.cards.map((card) => (
              <div className="catalog-card-row" key={card.id}>
                <div className="catalog-card-media">
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt={`${card.player} ${card.serial}`} />
                  ) : (
                    <div className={`mini-card ${card.status.toLowerCase()}`}>
                      <span>{card.serial}</span>
                    </div>
                  )}
                </div>
                <div className="card-info">
                  <h3>{card.player}</h3>
                  <p>
                    {[
                      card.cardNumber ? `#${card.cardNumber}` : null,
                      card.cardName,
                      card.parallel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {card.sourceUrl ? (
                    <a className="source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">
                      SportsCardsPro
                    </a>
                  ) : null}
                </div>
                <span className={`status-pill ${card.status.toLowerCase()}`}>
                  {card.status}
                </span>
                <div className="value-cell">
                  <span>{card.pulledLabel}</span>
                  <strong>
                    {card.claimedCount > 0
                      ? `${card.claimedCount} claimed`
                      : card.pendingClaimCount > 0
                        ? `${card.pendingClaimCount} requests`
                        : card.value}
                  </strong>
                </div>
                <a className="row-action" href={`/cards/${card.slug}`}>
                  Request Claim
                </a>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

import { notFound } from "next/navigation";
import { getSportCatalog } from "@/lib/db/catalog";

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
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">WP</span>
          <span>Whats Pulled</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/sports">Sports</a>
          <a href="#sets">Sets</a>
        </nav>
      </header>

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
              {set.cards.map((card) => (
                <div className="catalog-card-row" key={card.id}>
                  <div className={`mini-card ${card.status.toLowerCase()}`}>
                    <span>{card.serial}</span>
                  </div>
                  <div className="card-info">
                    <h3>{card.player}</h3>
                    <p>{[card.cardName, card.parallel].filter(Boolean).join(" ")}</p>
                  </div>
                  <span className={`status-pill ${card.status.toLowerCase()}`}>
                    {card.status}
                  </span>
                  <div className="value-cell">
                    <span>{card.attribution}</span>
                    <strong>{card.value}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

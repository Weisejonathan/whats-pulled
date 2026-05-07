import { notFound } from "next/navigation";
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
          <span className="brand-mark">WP</span>
          <span>Whats Pulled</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/sports">Sports</a>
          <a href={`/sports/${set.sportSlug}`}>{set.sport}</a>
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
      </section>
    </main>
  );
}

import { AuthNav } from "@/app/auth-nav";
import { getSportsOverview } from "@/lib/db/catalog";

export const dynamic = "force-dynamic";

export default async function SportsPage() {
  const sports = await getSportsOverview();

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">WP</span>
          <span>Whats Pulled</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/sports/tennis">Tennis</a>
          <AuthNav />
        </nav>
      </header>

      <section className="catalog-hero">
        <p className="eyebrow">Sports catalog</p>
        <h1>Sports</h1>
        <p>Start with a sport, open a set, then inspect every chase card.</p>
      </section>

      <section className="sport-grid" aria-label="Sports">
        {sports.map((sport) => (
          <a className="sport-tile" href={`/sports/${sport.sportSlug}`} key={sport.sportSlug}>
            <span>{sport.sport}</span>
            <strong>{sport.cardCount}</strong>
            <small>
              {sport.setCount} sets · {sport.cardCount} cards
            </small>
          </a>
        ))}
      </section>
    </main>
  );
}

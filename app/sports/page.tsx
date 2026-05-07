import { AuthNav } from "@/app/auth-nav";
import { getSportsOverview } from "@/lib/db/catalog";

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("en-US");

export default async function SportsPage() {
  const sports = await getSportsOverview();

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">W</span>
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
        {sports.map((sport) => {
          const progressLabel =
            sport.pullProgressPercent > 0 && sport.pullProgressPercent < 0.1
              ? "<0.1%"
              : `${sport.pullProgressPercent.toFixed(1)}%`;

          return (
            <a
              className="sport-tile set-sport-tile"
              href={`/sports/${sport.sportSlug}`}
              key={sport.sportSlug}
            >
              {sport.sportSlug === "tennis" ? (
                <img
                  src="/set-images/topps-chrome-tennis-2025-hobby.jpg"
                  alt="Topps Chrome Tennis 2025 Hobby Box"
                />
              ) : null}
              <span>{sport.sport}</span>
              <h2>{sport.displayName}</h2>
              <strong>{numberFormatter.format(sport.cardCount)}</strong>
              <small>
                {sport.setCount} set · {numberFormatter.format(sport.cardCount)} cards
              </small>
              <div className="sport-progress" aria-label={`${progressLabel} pulled`}>
                <div>
                  <span style={{ width: `${Math.min(sport.pullProgressPercent, 100)}%` }} />
                </div>
                <p>
                  <b>{progressLabel}</b>
                  <span>
                    {numberFormatter.format(sport.pulledCardCount)} /{" "}
                    {numberFormatter.format(sport.cardCount)} pulled
                  </span>
                </p>
              </div>
            </a>
          );
        })}
      </section>
    </main>
  );
}

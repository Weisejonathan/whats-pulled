import { SiteHeader } from "@/app/site-header";
import { getSportsOverview } from "@/lib/db/catalog";

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("en-US");
const setShowcaseCards = [
  { player: "Coco Gauff", label: "Bon Voyage", tone: "voyage" },
  { player: "Emma Navarro", label: "Game Set Match", tone: "match" },
  { player: "Alexander Zverev", label: "Court Stamp", tone: "stamp" },
  { player: "Rafael Nadal", label: "Autograph Issue", tone: "auto" },
  { player: "Maria Sharapova", label: "Chrome Icons", tone: "icons" },
  { player: "Novak Djokovic", label: "1/1 Superfractor", tone: "novak" },
];

export default async function SportsPage() {
  const sports = await getSportsOverview();

  return (
    <main className="page-shell">
      <SiteHeader links={[{ href: "/", label: "Home" }]} />

      <section className="sports-showcase" aria-label="Sports">
        {sports.map((sport) => {
          const progressLabel =
            sport.pullProgressPercent > 0 && sport.pullProgressPercent < 0.1
              ? "<0.1%"
              : `${sport.pullProgressPercent.toFixed(1)}%`;
          const visibleProgressPercent =
            sport.pullProgressPercent > 0
              ? Math.min(Math.max(sport.pullProgressPercent, 4), 100)
              : 0;
          const openCardCount = sport.cardCount - sport.pulledCardCount;

          return (
            <article className="set-overview-stage" key={sport.sportSlug}>
              <div className="set-overview-copy">
                <p className="eyebrow">{sport.sport} set tracker</p>
                <h1>2025 Topps Chrome Tennis</h1>
                <div className="set-overview-actions">
                  <a className="button-link red-action" href={`/sports/${sport.sportSlug}`}>
                    Jetzt Pulls Ansehen
                  </a>
                  <a className="secondary-button set-link" href="/sets/topps-chrome-tennis-2025">
                    Checklist öffnen
                  </a>
                </div>
              </div>

              <aside className="set-progress-card" aria-label={`${progressLabel} pulled`}>
                <div>
                  <span>Pull Progress</span>
                  <strong>{progressLabel}</strong>
                </div>
                <div className="smart-progress-track">
                  <span style={{ width: `${visibleProgressPercent}%` }} />
                  <i style={{ left: `${visibleProgressPercent}%` }} />
                </div>
                <div className="set-progress-stats">
                  <span>
                    <b>{numberFormatter.format(sport.pulledCardCount)}</b>
                    pulled
                  </span>
                  <span>
                    <b>{numberFormatter.format(openCardCount)}</b>
                    open
                  </span>
                  <span>
                    <b>{numberFormatter.format(sport.cardCount)}</b>
                    tracked
                  </span>
                </div>
              </aside>

              <div className="set-card-runway" aria-label="Topps Chrome Tennis card preview">
                {setShowcaseCards.map((card) => (
                  <a
                    className={`set-preview-card ${card.tone}`}
                    href={`/sports/${sport.sportSlug}`}
                    key={card.player}
                  >
                    {card.tone === "novak" ? (
                      <img
                        src="/card-images/novak-djokovic-superfractor-1-1.jpg"
                        alt="Novak Djokovic Topps Chrome 2025 Superfractor"
                      />
                    ) : null}
                    <span>{card.label}</span>
                    <strong>{card.player}</strong>
                  </a>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

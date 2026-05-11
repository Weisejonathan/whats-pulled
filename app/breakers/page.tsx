import { SiteHeader } from "@/app/site-header";
import { getBreakerRankings } from "@/lib/db/breakers";

export const dynamic = "force-dynamic";

const upcomingBreaks = [
  {
    breaker: "Court Kings Breaks",
    platform: "Whatnot",
    set: "Topps Chrome Tennis 2025",
    time: "Heute, 20:30",
  },
  {
    breaker: "Prime Pulls EU",
    platform: "Whatnot",
    set: "Topps Chrome Sapphire Tennis 2025",
    time: "Morgen, 19:00",
  },
  {
    breaker: "Baseline Breaks",
    platform: "Whatnot",
    set: "Topps Chrome Tennis 2025 Hobby Case",
    time: "Mi., 21:15",
  },
  {
    breaker: "Ace Card Club",
    platform: "Whatnot",
    set: "Topps Chrome Sapphire Tennis 2025",
    time: "Fr., 18:45",
  },
];

export default async function BreakersPage() {
  const breakers = await getBreakerRankings();
  const topBreaker = breakers[0];

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/sports", label: "Sports" },
          { href: "/breakers", label: "Breakers" },
        ]}
      />

      <section className="breaker-hero">
        <div>
          <p className="eyebrow">Breaker Scoreboard</p>
          <h1>Die besten Breaker der Welt</h1>
          <p>
            Ranking nach verifizierten Pulls, geschätztem Pull Value und den stärksten
            Hits, die bereits auf Whats Pulled getrackt wurden.
          </p>
          <a className="button-link" href="#breaker-ranking">
            Ranking ansehen
          </a>
        </div>

        {topBreaker ? (
          <a className="breaker-spotlight" href={`/breakers/${topBreaker.slug}`}>
            <span>Current #1</span>
            <strong>{topBreaker.name}</strong>
            <div className="breaker-spotlight-grid">
              <small>{topBreaker.hitCount} verified pulls</small>
              <small>{topBreaker.totalValue} value</small>
              <small>{topBreaker.trackedSets} tracked sets</small>
            </div>
          </a>
        ) : null}
      </section>

      <section className="breaker-ranking-section" id="breaker-ranking">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h2>Top Breakers</h2>
          </div>
        </div>

        <div className="breaker-ranking-grid">
          {breakers.map((breaker) => (
            <a className="breaker-rank-card" href={`/breakers/${breaker.slug}`} key={breaker.id}>
              <div className="breaker-rank-top">
                <span className="rank large">{breaker.rank}</span>
                <div>
                  <h3>{breaker.name}</h3>
                  <p>
                    {breaker.country ?? "Global"} · {breaker.verified ? "Verified" : "Tracked"}
                  </p>
                </div>
              </div>

              <div className="breaker-metrics">
                <span>
                  <b>{breaker.hitCount}</b>
                  pulls
                </span>
                <span>
                  <b>{breaker.totalValue}</b>
                  value
                </span>
                <span>
                  <b>{breaker.trackedSets}</b>
                  sets
                </span>
              </div>

              {breaker.topPull ? (
                <div className="breaker-top-pull">
                  {breaker.topPull.imageUrl ? (
                    <img src={breaker.topPull.imageUrl} alt={breaker.topPull.player} />
                  ) : (
                    <div className="mini-card pulled">
                      <span>{breaker.topPull.serial}</span>
                    </div>
                  )}
                  <div>
                    <small>Top Pull</small>
                    <strong>{breaker.topPull.player}</strong>
                    <p>
                      {breaker.topPull.serial} · {breaker.topPull.title} · {breaker.topPull.value}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="breaker-top-pull empty">
                  <div>
                    <small>Top Pull</small>
                    <strong>No verified pull yet</strong>
                    <p>Awaiting approved pulls.</p>
                  </div>
                </div>
              )}
            </a>
          ))}
        </div>
      </section>

      <section className="upcoming-breaks-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h2>Upcoming Breaks</h2>
          </div>
        </div>

        <div className="upcoming-breaks-table">
          <div className="upcoming-breaks-head">
            <span>Breaker</span>
            <span>Set</span>
            <span>Uhrzeit</span>
            <span>Plattform</span>
          </div>
          {upcomingBreaks.map((event) => (
            <article className="upcoming-break-row" key={`${event.breaker}-${event.time}`}>
              <strong>{event.breaker}</strong>
              <span>{event.set}</span>
              <b>{event.time}</b>
              <em>{event.platform}</em>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

import { getHomepageData } from "@/lib/db/homepage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { breakers, chaseCards, metrics } = await getHomepageData();

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">WP</span>
          <span>Whats Pulled</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#sets">Sets</a>
          <a href="#leaderboard">Leaderboard</a>
          <a href="#market">Market</a>
        </nav>
      </header>

      <section className="workspace">
        <div className="intro-panel">
          <p className="eyebrow">Live chase tracker</p>
          <h1>Whats Pulled</h1>
          <p className="intro-copy">
            See which rare trading cards are still open, who pulled the biggest hits,
            and where claimed cards become available for sale.
          </p>
          <div className="search-row" role="search">
            <input
              aria-label="Search set or player"
              placeholder="Search set, player, serial number..."
            />
            <button type="button">Track Card</button>
          </div>
        </div>

        <div className="card-preview" aria-label="Featured chase card">
          <div className="trading-card">
            <div className="card-topline">Topps Chrome Tennis</div>
            <div className="card-player">Novak Djokovic</div>
            <div className="card-art">
              <span>1/1</span>
            </div>
            <div className="card-footer">Superfractor still open</div>
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="Platform metrics">
        <div>
          <span>Open chase cards</span>
          <strong>{metrics.openCards}</strong>
        </div>
        <div>
          <span>Verified pulls</span>
          <strong>{metrics.verifiedPulls}</strong>
        </div>
        <div>
          <span>Claimed value</span>
          <strong>{metrics.claimedValue}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel" id="sets">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Featured set</p>
              <h2>Topps Chrome Tennis 2025</h2>
            </div>
            <a href="#market">View market</a>
          </div>

          <div className="card-list">
            {chaseCards.map((item) => (
              <article className="chase-card" key={`${item.player}-${item.serial}`}>
                <div className={`mini-card ${item.status.toLowerCase()}`}>
                  <span>{item.serial}</span>
                </div>
                <div className="card-info">
                  <h3>{item.player}</h3>
                  <p>{item.card}</p>
                </div>
                <span className={`status-pill ${item.status.toLowerCase()}`}>
                  {item.status}
                </span>
                <div className="value-cell">
                  <span>{item.breaker}</span>
                  <strong>{item.value}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="panel leaderboard" id="leaderboard">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Global rank</p>
              <h2>Breaker Scoreboard</h2>
            </div>
          </div>

          <ol className="breaker-list">
            {breakers.map((breaker, index) => (
              <li key={breaker.name}>
                <span className="rank">{index + 1}</span>
                <div>
                  <strong>{breaker.name}</strong>
                  <span>{breaker.hits} verified hits</span>
                </div>
                <b>{breaker.value}</b>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="market-strip" id="market">
        <div>
          <p className="eyebrow">Marketplace signal</p>
          <h2>Found in a store? Make it visible.</h2>
          <p>
            Stores can upload a card, prove availability, and connect with collectors
            already watching that exact chase card.
          </p>
        </div>
        <button type="button">List Available Card</button>
      </section>
    </main>
  );
}

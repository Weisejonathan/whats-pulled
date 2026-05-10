import {
  createCardAction,
  createListingAction,
  reportPullAction,
} from "@/app/actions";
import { SiteHeader } from "@/app/site-header";
import { hasAdminSession } from "@/lib/auth";
import { getHomepageData } from "@/lib/db/homepage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { breakers, cardOptions, chaseCards, databaseReady, metrics, recentlyPulled } =
    await getHomepageData();
  const formDisabled = !databaseReady || cardOptions.length === 0;
  const isLoggedIn = await hasAdminSession();
  const databaseHref = isLoggedIn ? "#database" : "/login?next=/%23database";

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "#sets", label: "Sets" },
          { href: "/breakers", label: "Breakers" },
          { href: "/leaderboard", label: "Leaderboard" },
        ]}
      />

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
            <a className="button-link" href={databaseHref}>
              Track Card
            </a>
          </div>
        </div>

        <div className="card-preview" aria-label="Pull of the week">
          <a className="featured-pull-photo pull-of-week-card" href="/cards/novak-djokovic-1-superfractor">
            <span className="pull-week-badge">Pull of the Week</span>
            <img
              src="/card-images/novak-djokovic-superfractor-1-1.jpg"
              alt="Novak Djokovic Topps Chrome 2025 1/1 Superfractor"
            />
            <strong>Novak Djokovic 1/1 Superfractor</strong>
          </a>
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

      <section className="dropped-sets" id="sets">
        <div className="dropped-sets-heading">
          <h2>Just dropped</h2>
          <div className="dropped-tabs" aria-label="Set categories">
            <a className="active" href="/sets/topps-chrome-tennis-2025">
              Neu diese Woche
            </a>
            <a href="/sports/tennis">Tennis</a>
            <a href="/sets/topps-chrome-tennis-2025">Chrome</a>
            <a href="/login?next=/account">Claims</a>
          </div>
        </div>

        <div className="dropped-set-row">
          <a className="dropped-set-card primary" href="/sets/topps-chrome-tennis-2025">
            <div className="dropped-badge">4,500 tracked</div>
            <div className="dropped-image">
              <img
                src="https://cdn.shopify.com/s/files/1/0662/9749/5709/files/0ad6b75b641ff6af446e1536f5e8aa58e19945f2_25TCTN_FGC6336_HOBBY.png?v=1774339466"
                alt="2025 Topps Chrome Tennis Hobby Box"
              />
            </div>
            <div className="dropped-copy">
              <h3>2025 Topps Chrome Tennis</h3>
              <strong>Set Tracker live</strong>
              <p>Base Checklist, numbered Parallels, RC Tags und Pull Progress an einem Ort.</p>
              <span className="button-link">Checklist öffnen</span>
            </div>
          </a>

          <a className="dropped-set-card" href="/cards/novak-djokovic-1-superfractor">
            <div className="dropped-badge red">Pulled</div>
            <div className="dropped-image photo">
              <img
                src="/card-images/novak-djokovic-superfractor-1-1.jpg"
                alt="Novak Djokovic 1/1 Superfractor"
              />
            </div>
            <div className="dropped-copy">
              <h3>Novak Djokovic</h3>
              <strong>1/1 Superfractor Auto</strong>
              <p>Frisch gezogen von Erick Schmerick23, mit Claim- und Gebots-Signal.</p>
              <span className="button-link">Karte ansehen</span>
            </div>
          </a>

          <a className="dropped-set-card muted-card" href="/sets/topps-chrome-tennis-2025">
            <div className="dropped-badge">Chase board</div>
            <div className="dropped-illustration">
              <span>/1</span>
              <span>/5</span>
              <span>/10</span>
            </div>
            <div className="dropped-copy">
              <h3>Numbered Cards</h3>
              <strong>Varianten pro Karte gebündelt</strong>
              <p>Sieh direkt, welche Versionen offen, gezogen, geclaimed oder komplett sind.</p>
              <span className="button-link">Pulls prüfen</span>
            </div>
          </a>

          <a className="dropped-set-card muted-card" href="/login">
            <div className="dropped-badge">Account</div>
            <div className="dropped-illustration market">
              <span>Claim</span>
              <span>Watch</span>
              <span>Bid</span>
            </div>
            <div className="dropped-copy">
              <h3>Collector Actions</h3>
              <strong>Proof senden, Karten beobachten, Gebote abgeben</strong>
              <p>Mit Account wird der Tracker zu deinem persönlichen Chase Desk.</p>
              <span className="button-link">Registrieren</span>
            </div>
          </a>
        </div>
      </section>

      <section className="recent-pulls" id="recently-pulled">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recently Pulled</p>
            <h2>Fresh verified hits</h2>
          </div>
        </div>

        <div className="recent-pull-grid">
          {recentlyPulled.map((pull) => (
            <a className="recent-pull-card" href={pull.cardUrl} key={pull.cardUrl}>
              {pull.imageUrl ? (
                <img src={pull.imageUrl} alt={`${pull.player} ${pull.serial}`} />
              ) : (
                <div className="mini-card pulled">
                  <span>{pull.serial}</span>
                </div>
              )}
              <div>
                <span>{pull.serial}</span>
                <h3>{pull.player}</h3>
                <p>{pull.card}</p>
                <strong>{pull.pulledBy}</strong>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="content-grid">
        <div className="panel" id="featured-set">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Featured set</p>
              <h2>Topps Chrome Tennis 2025</h2>
            </div>
            <a href="/sets/topps-chrome-tennis-2025">Open set</a>
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
            <a href="/breakers">Open ranking</a>
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
        <a className="button-link light" href={databaseHref}>
          List Available Card
        </a>
      </section>

      <section className="database-section" id="database">
        <div className="database-heading">
          <div>
            <p className="eyebrow">Neon database</p>
            <h2>Update Whats Pulled from the frontend</h2>
          </div>
          <span className={`connection-pill ${databaseReady ? "online" : "offline"}`}>
            {databaseReady ? "Database connected" : "Using demo data"}
          </span>
        </div>

        {isLoggedIn ? (
          <div className="database-grid">
            <form className="db-form large" action={createCardAction}>
            <div className="form-heading">
              <h3>Add chase card</h3>
              <p>Create or update a card record in Neon.</p>
            </div>

            <div className="form-grid">
              <label className="field span-2">
                <span>Set</span>
                <input name="setName" defaultValue="Topps Chrome Tennis 2025" required />
              </label>
              <label className="field">
                <span>Brand</span>
                <input name="brand" defaultValue="Topps" required />
              </label>
              <label className="field">
                <span>Year</span>
                <input name="year" type="number" defaultValue="2025" required />
              </label>
              <label className="field">
                <span>Sport</span>
                <input name="sport" defaultValue="Tennis" required />
              </label>
              <label className="field">
                <span>Player</span>
                <input name="playerName" placeholder="Iga Swiatek" required />
              </label>
              <label className="field span-2">
                <span>Card name</span>
                <input name="cardName" defaultValue="Topps Chrome Tennis 2025" required />
              </label>
              <label className="field">
                <span>Parallel</span>
                <input name="parallel" placeholder="Superfractor" />
              </label>
              <label className="field">
                <span>Serial</span>
                <input name="serialNumber" placeholder="1/1" required />
              </label>
              <label className="field">
                <span>Status</span>
                <select name="status" defaultValue="open">
                  <option value="open">Open</option>
                  <option value="pulled">Pulled</option>
                  <option value="claimed">Claimed</option>
                  <option value="available">Available</option>
                  <option value="sold">Sold</option>
                </select>
              </label>
              <label className="field">
                <span>Estimated value</span>
                <input name="estimatedValue" inputMode="decimal" placeholder="2500" />
              </label>
            </div>

            <button type="submit" disabled={!databaseReady}>
              Save Card
            </button>
            </form>

            <form className="db-form" action={reportPullAction}>
            <div className="form-heading">
              <h3>Report pull</h3>
              <p>Mark a card as pulled and add breaker score.</p>
            </div>

            <label className="field">
              <span>Card</span>
              <select name="cardId" required disabled={formDisabled}>
                {cardOptions.map((card) => (
                  <option value={card.id} key={card.id}>
                    {card.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Breaker</span>
              <input name="breakerName" placeholder="Prime Pulls EU" required />
            </label>
            <label className="field">
              <span>Country</span>
              <input name="breakerCountry" placeholder="DE" />
            </label>
            <label className="field">
              <span>Value</span>
              <input name="estimatedValue" inputMode="decimal" placeholder="18500" />
            </label>
            <label className="field">
              <span>Proof URL</span>
              <input name="proofUrl" type="url" placeholder="https://..." />
            </label>

            <button type="submit" disabled={formDisabled}>
              Save Pull
            </button>
            </form>

            <form className="db-form" action={createListingAction}>
            <div className="form-heading">
              <h3>List available card</h3>
              <p>Add a store listing and move the card to available.</p>
            </div>

            <label className="field">
              <span>Card</span>
              <select name="cardId" required disabled={formDisabled}>
                {cardOptions.map((card) => (
                  <option value={card.id} key={card.id}>
                    {card.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Store</span>
              <input name="storeName" placeholder="Nordic Card Store" required />
            </label>
            <label className="field">
              <span>Country</span>
              <input name="storeCountry" placeholder="FI" />
            </label>
            <div className="inline-fields">
              <label className="field">
                <span>Price</span>
                <input name="price" inputMode="decimal" placeholder="4200" required />
              </label>
              <label className="field currency-field">
                <span>Currency</span>
                <input name="currency" defaultValue="USD" required />
              </label>
            </div>
            <label className="field">
              <span>Image URL</span>
              <input name="imageUrl" type="url" placeholder="https://..." />
            </label>

            <button type="submit" disabled={formDisabled}>
              Save Listing
            </button>
            </form>
          </div>
        ) : (
          <div className="access-required">
            <div>
              <p className="eyebrow">Access required</p>
              <h3>Login to update the database</h3>
              <p>
                Public visitors can browse the catalog. Claims, pulls, listings,
                and card edits require admin access.
              </p>
            </div>
            <a className="button-link" href="/login?next=/%23database">
              Login
            </a>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <span>Whats Pulled</span>
        <nav aria-label="Footer navigation">
          <a href="/detector">Card Detection Tester</a>
          <a href="/stream-detector">Stream Detector</a>
          <a href="/direct-uploader">Direct Uploader</a>
          <a href="/studio">OBS Studio</a>
          <a href="/overlay/demo">Demo Overlay</a>
        </nav>
      </footer>
    </main>
  );
}

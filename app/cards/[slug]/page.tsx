import { notFound } from "next/navigation";
import { claimCardAction, reportPullAction } from "@/app/actions";
import { AuthNav } from "@/app/auth-nav";
import { hasAdminSession } from "@/lib/auth";
import { getCardCatalog } from "@/lib/db/catalog";

type CardPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: CardPageProps) {
  const { slug } = await params;
  const detail = await getCardCatalog(slug);

  if (!detail) {
    notFound();
  }

  const { card, set } = detail;
  const returnTo = `/cards/${card.slug}`;
  const isLoggedIn = await hasAdminSession();
  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;

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
          <a href={`/sets/${set.slug}`}>{set.name}</a>
          <AuthNav />
        </nav>
      </header>

      <section className="catalog-hero">
        <p className="eyebrow">
          {set.sport} · {set.brand} · {set.year}
        </p>
        <h1>{card.player}</h1>
        <p>
          {[card.cardNumber ? `#${card.cardNumber}` : null, card.cardName, card.parallel]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>

      <section className="card-detail-layout">
        <article className="detail-card">
          <div className="detail-card-media">
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={`${card.player} ${card.serial}`} />
            ) : (
              <div className={`trading-card ${card.status.toLowerCase()}`}>
                <div className="card-topline">{set.name}</div>
                <div className="card-player">{card.player}</div>
                <div className="card-art">
                  <span>{card.serial}</span>
                </div>
                <div className="card-footer">{card.parallel ?? "Base"}</div>
              </div>
            )}
          </div>

          <div className="detail-stats">
            <div>
              <span>Status</span>
              <strong>{card.status}</strong>
            </div>
            <div>
              <span>Pulled</span>
              <strong>{card.pulledLabel}</strong>
            </div>
            <div>
              <span>Claimed</span>
              <strong>{card.claimedCount}</strong>
            </div>
            <div>
              <span>Source</span>
              {card.sourceUrl ? (
                <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                  SportsCardsPro
                </a>
              ) : (
                <strong>-</strong>
              )}
            </div>
          </div>
        </article>

        <div className="claim-panel">
          {isLoggedIn ? (
            <>
              <form className="db-form" action={claimCardAction}>
            <div className="form-heading">
              <h3>Claim card</h3>
              <p>Register ownership and add one pulled copy to the counter.</p>
            </div>
            <input name="cardId" type="hidden" value={card.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="field">
              <span>Owner name</span>
              <input name="ownerDisplayName" placeholder="Your name or store" required />
            </label>
            <label className="field">
              <span>Proof URL</span>
              <input name="proofUrl" type="url" placeholder="https://..." />
            </label>
            <button type="submit">Claim Card</button>
              </form>

              <form className="db-form" action={reportPullAction}>
            <div className="form-heading">
              <h3>Report pull</h3>
              <p>Add a pulled copy without claiming ownership.</p>
            </div>
            <input name="cardId" type="hidden" value={card.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="field">
              <span>Breaker</span>
              <input name="breakerName" placeholder="Breaker or channel" required />
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
            <button type="submit">Save Pull</button>
              </form>
            </>
          ) : (
            <div className="access-required compact">
              <div>
                <p className="eyebrow">Access required</p>
                <h3>Login to claim or report</h3>
                <p>
                  The card page is public, but ownership claims and pull reports
                  need admin access.
                </p>
              </div>
              <a className="button-link" href={loginHref}>
                Login
              </a>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

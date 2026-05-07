import { notFound } from "next/navigation";
import {
  claimCardAction,
  reportPullAction,
  requestClaimAction,
} from "@/app/actions";
import { AuthNav } from "@/app/auth-nav";
import { hasAdminSession } from "@/lib/auth";
import { getCardCatalog } from "@/lib/db/catalog";

type CardPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    claimRequested?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CardPage({ params, searchParams }: CardPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const detail = await getCardCatalog(slug);

  if (!detail) {
    notFound();
  }

  const { card, set, variants } = detail;
  const returnTo = `/cards/${card.slug}`;
  const isLoggedIn = await hasAdminSession();

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
              <span>Requests</span>
              <strong>{card.pendingClaimCount}</strong>
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

          {variants.length > 1 ? (
            <div className="variant-panel">
              <div>
                <p className="eyebrow">Variants</p>
                <h2>#{card.cardNumber} summary</h2>
              </div>
              <div className="variant-button-row detail-variant-row">
                {variants.map((variant) => {
                  const isVariantComplete =
                    variant.printRun && variant.pulledCount >= variant.printRun;

                  return (
                    <a
                      className={`variant-button ${isVariantComplete ? "complete" : "open"} ${
                        variant.id === card.id ? "active" : ""
                      }`}
                      href={`/cards/${variant.slug}`}
                      key={variant.id}
                    >
                      <span>{variant.serial}</span>
                      <small>{variant.parallel ?? "Base"}</small>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
        </article>

        <div className="claim-panel">
          {query.claimRequested ? (
            <div className="notice success">
              Claim request saved. We will review it before changing the card status.
            </div>
          ) : null}

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
            <form className="db-form" action={requestClaimAction}>
              <div className="form-heading">
                <h3>Request Claim</h3>
                <p>Suggest ownership for review. This will not mark the card as verified yet.</p>
              </div>
              <input name="cardId" type="hidden" value={card.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <label className="field">
                <span>Name</span>
                <input name="ownerDisplayName" placeholder="Your name or store" required />
              </label>
              <label className="field">
                <span>Proof URL</span>
                <input name="proofUrl" type="url" placeholder="https://..." />
              </label>
              <label className="field">
                <span>Card image URL</span>
                <input name="imageUrl" type="url" placeholder="https://..." />
              </label>
              <label className="field">
                <span>Note</span>
                <input name="note" placeholder="Instagram handle, store, or short context" />
              </label>
              <button type="submit">Request Claim</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

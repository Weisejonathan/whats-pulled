import { notFound } from "next/navigation";
import {
  claimCardAction,
  favoriteCardAction,
  reportPullAction,
  requestClaimAction,
  submitBidAction,
} from "@/app/actions";
import { SiteHeader } from "@/app/site-header";
import { hasAdminSession } from "@/lib/auth";
import { getCardCatalog } from "@/lib/db/catalog";

type CardPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    bidSubmitted?: string;
    claimRequested?: string;
    favoriteSaved?: string;
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
  const pulledDateLabel = card.pulledAt
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(card.pulledAt))
    : "-";
  const ownedDateLabel = card.ownedAt
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(card.ownedAt))
    : null;

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
          { href: `/sets/${set.slug}`, label: set.name },
        ]}
      />

      <section className="catalog-hero">
        <p className="eyebrow">
          {set.sport} · {set.brand} · {set.year}
        </p>
        <h1>
          {card.player}
          {card.isRookie ? <span className="rc-badge hero-rc-badge">RC</span> : null}
        </h1>
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

          <div className="under-card-actions">
            {query.claimRequested ? (
              <div className="notice success">
                Claim request saved. We will review it before changing the card status.
              </div>
            ) : null}

            {isLoggedIn ? (
              <div className="card-admin-actions">
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
              </div>
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

        <aside className="ownership-panel">
          {query.favoriteSaved ? (
            <div className="notice success">Karte wurde favorisiert.</div>
          ) : null}
          {query.bidSubmitted ? (
            <div className="notice success">Gebot gespeichert. Der Owner kann es prüfen.</div>
          ) : null}

          <div className="ownership-summary">
            <div className="ownership-row primary">
              <span>Owned by</span>
              <strong>{card.ownerDisplayName ?? "Noch nicht geclaimed"}</strong>
              {ownedDateLabel ? <small>Since {ownedDateLabel}</small> : null}
            </div>
            <div className="ownership-row">
              <span>Pulled by</span>
              <strong>{card.pulledBy ?? "-"}</strong>
              <small>{pulledDateLabel}</small>
            </div>
            <div className="ownership-row">
              <span>Status</span>
              <strong>{card.status}</strong>
              <small>{card.pulledLabel}</small>
            </div>
            <div className="ownership-row">
              <span>Market signal</span>
              <strong>{card.highestBid}</strong>
              <small>
                {card.bidCount} Gebote · {card.favoriteCount} Favoriten
              </small>
            </div>
            {card.sourceUrl ? (
              <a className="source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">
                SportsCardsPro source
              </a>
            ) : null}
          </div>

          <form className="db-form compact-form" action={favoriteCardAction}>
            <div className="form-heading">
              <h3>Favorisieren</h3>
              <p>Speichere diese Karte für deinen Account.</p>
            </div>
            <input name="cardId" type="hidden" value={card.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="field">
              <span>Name</span>
              <input name="userDisplayName" placeholder="Your name" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="userEmail" type="email" placeholder="you@example.com" required />
            </label>
            <button type="submit">Favorit speichern</button>
          </form>

          <form className="db-form compact-form" action={submitBidAction}>
            <div className="form-heading">
              <h3>Gebot abgeben</h3>
              <p>Schicke ein privates Angebot an den Owner.</p>
            </div>
            <input name="cardId" type="hidden" value={card.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="field">
              <span>Name</span>
              <input name="bidderDisplayName" placeholder="Your name" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="bidderEmail" type="email" placeholder="you@example.com" required />
            </label>
            <div className="inline-fields">
              <label className="field">
              <span>Betrag</span>
                <input name="amount" inputMode="decimal" placeholder="2500" required />
              </label>
              <label className="field currency-field">
                <span>Currency</span>
                <input name="currency" defaultValue="EUR" maxLength={3} />
              </label>
            </div>
            <label className="field">
              <span>Note</span>
              <input name="note" placeholder="Optionale Nachricht an den Owner" />
            </label>
            <button type="submit">Gebot senden</button>
          </form>
        </aside>
      </section>
    </main>
  );
}

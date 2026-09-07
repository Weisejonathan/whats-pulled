import { notFound } from "next/navigation";
import {
  claimCardAction,
  favoriteCardAction,
  reportPullAction,
  requestClaimAction,
  submitPullAction,
  submitBidAction,
} from "@/app/actions";
import { SiteHeader } from "@/app/site-header";
import { getUserSession, hasAdminSession } from "@/lib/auth";
import { getCardCatalog } from "@/lib/db/catalog";

type CardPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    bidSubmitted?: string;
    claimRequested?: string;
    copy?: string;
    favoriteSaved?: string;
    pullSubmitted?: string;
  }>;
};

export const dynamic = "force-dynamic";

function formatCopyLabel(copyNumber: number, printRun: number) {
  const width = String(printRun).length;
  return `${String(copyNumber).padStart(width, "0")}/${String(printRun).padStart(width, "0")}`;
}

function CopyNumberField({
  printRun,
  selectedCopyNumber,
}: {
  printRun: number | null;
  selectedCopyNumber?: number | null;
}) {
  if (!printRun || printRun <= 1) {
    return printRun === 1 ? <input name="copyNumber" type="hidden" value="1" /> : null;
  }

  return (
    <label className="field">
      <span>Serial copy</span>
      <select name="copyNumber" required defaultValue={selectedCopyNumber ? String(selectedCopyNumber) : ""}>
        <option value="" disabled>
          Select copy
        </option>
        {Array.from({ length: printRun }, (_, index) => {
          const copyNumber = index + 1;
          const copyLabel = formatCopyLabel(copyNumber, printRun);
          const marker =
            copyNumber === 1 && copyNumber === printRun
              ? "First + Bookend"
              : copyNumber === 1
                ? "First of Print"
                : copyNumber === printRun
                  ? "Bookend"
                  : "";

          return (
            <option key={copyNumber} value={copyNumber}>
              {marker ? `${copyLabel} - ${marker}` : copyLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function formatDateLabel(date: Date | string | null) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatRanking(rank: number | null) {
  return rank ? `#${rank}` : "-";
}

function formatRankingMeta(points: number | null, movement: number | null) {
  const parts = [];

  if (points) {
    parts.push(`${points.toLocaleString("de-DE")} pts`);
  }

  if (movement !== null) {
    parts.push(`${movement > 0 ? "+" : ""}${movement} movement`);
  }

  return parts.length ? parts.join(" · ") : "Not synced yet";
}

export default async function CardPage({ params, searchParams }: CardPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const detail = await getCardCatalog(slug);

  if (!detail) {
    notFound();
  }

  const { card, set, variants, copies } = detail;
  const requestedCopy = query.copy ? Number(query.copy) : null;
  const selectedCopy =
    copies.find((copy) => copy.copyNumber === requestedCopy) ??
    copies.find((copy) => copy.status !== "Open") ??
    copies[0] ??
    null;
  const selectedCopyNumber = selectedCopy?.copyNumber ?? null;
  const returnTo = selectedCopyNumber
    ? `/cards/${card.slug}?copy=${selectedCopyNumber}`
    : `/cards/${card.slug}`;
  const isLoggedIn = await hasAdminSession();
  const user = await getUserSession();
  const remainingCopies = card.remainingCopies;
  const pendingCopyCount = card.pendingPullCount + card.pendingClaimCount;
  const hasOpenCopies = remainingCopies === null || remainingCopies > 0;
  const hasUnreservedCopies = remainingCopies === null || remainingCopies > pendingCopyCount;
  const unreservedCopies = remainingCopies === null ? null : Math.max(0, remainingCopies - pendingCopyCount);
  const copyLabel = card.printRun
    ? `${card.pulledCount} / ${card.printRun} pulled · ${remainingCopies} open`
    : `${card.pulledCount} pulled`;
  const pulledDateLabel = selectedCopy ? formatDateLabel(selectedCopy.pulledAt) : formatDateLabel(card.pulledAt);
  const ownedDateLabel = selectedCopy
    ? selectedCopy.ownedAt
      ? formatDateLabel(selectedCopy.ownedAt)
      : null
    : card.ownedAt
      ? formatDateLabel(card.ownedAt)
      : null;
  const selectedOwnerLabel =
    selectedCopy
      ? selectedCopy.ownerDisplayName
      : card.claimedCount > 1
        ? `${card.claimedCount} Claims`
        : card.ownerDisplayName;
  const selectedPulledBy = selectedCopy ? selectedCopy.pulledBy : card.pulledBy;
  const selectedStatus = selectedCopy?.status ?? card.status;
  const selectedMarketBidCount = selectedCopy ? selectedCopy.bidCount : card.bidCount;
  const selectedMarketBid = selectedCopy ? selectedCopy.highestBid : card.highestBid;
  const selectedCopyLabel = selectedCopy ? selectedCopy.label : null;

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
        <div className="player-ranking-row hero-ranking-row">
          <span>
            Ranking <strong>{formatRanking(card.playerRanking)}</strong>
          </span>
          <span>
            Race <strong>{formatRanking(card.playerRaceRanking)}</strong>
          </span>
          {card.playerCountryCode ? <span>{card.playerCountryCode}</span> : null}
        </div>
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
                  Claim request saved. We will verify the proof before changing the status.
                </div>
            ) : null}
            {query.pullSubmitted ? (
                <div className="notice success">
                  Pull submitted. We will verify the proof before updating the counter.
                </div>
            ) : null}
            {!hasOpenCopies ? (
              <div className="notice error">
                All {card.printRun} copies of this card are already marked as pulled.
              </div>
            ) : null}

            {isLoggedIn ? (
              <div className="card-admin-actions">
                <form className="db-form" action={claimCardAction}>
                  <div className="form-heading">
                    <h3>Claim card</h3>
                    <p>Register ownership and add one pulled copy to the counter. {copyLabel}</p>
                  </div>
                  <input name="cardId" type="hidden" value={card.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <CopyNumberField printRun={card.printRun} selectedCopyNumber={selectedCopyNumber} />
                  <label className="field">
                    <span>Owner name</span>
                    <input name="ownerDisplayName" placeholder="Your name or store" required />
                  </label>
                  <label className="field">
                    <span>Proof URL</span>
                    <input name="proofUrl" type="url" placeholder="https://..." />
                  </label>
                  <button type="submit" disabled={!hasOpenCopies}>Claim Card</button>
                </form>

                <form className="db-form" action={reportPullAction}>
                  <div className="form-heading">
                    <h3>Report pull</h3>
                    <p>Add a pulled copy without claiming ownership. {copyLabel}</p>
                  </div>
                  <input name="cardId" type="hidden" value={card.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <CopyNumberField printRun={card.printRun} selectedCopyNumber={selectedCopyNumber} />
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
                  <button type="submit" disabled={!hasOpenCopies}>Save Pull</button>
                </form>
              </div>
            ) : user ? (
              <div className="card-admin-actions">
                <form className="db-form" action={requestClaimAction}>
                  <div className="form-heading">
                    <h3>Request claim</h3>
                    <p>
                      Submit proof. An admin will approve the claim in the backend.
                      {unreservedCopies !== null ? ` ${unreservedCopies} copies without a pending request.` : ""}
                    </p>
                  </div>
                  <input name="cardId" type="hidden" value={card.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <CopyNumberField printRun={card.printRun} selectedCopyNumber={selectedCopyNumber} />
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
                  <button type="submit" disabled={!hasUnreservedCopies}>Request claim</button>
                </form>

                <form className="db-form" action={submitPullAction}>
                  <div className="form-heading">
                    <h3>Submit pull</h3>
                    <p>
                      Submit a pull with proof for verification.
                      {card.printRun ? ` ${copyLabel}` : ""}
                    </p>
                  </div>
                  <input name="cardId" type="hidden" value={card.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <CopyNumberField printRun={card.printRun} selectedCopyNumber={selectedCopyNumber} />
                  <label className="field">
                    <span>Pulled by</span>
                    <input name="breakerName" placeholder={user.displayName} />
                  </label>
                  <label className="field">
                    <span>Value</span>
                    <input name="estimatedValue" inputMode="decimal" placeholder="2500" />
                  </label>
                  <label className="field">
                    <span>Proof URL</span>
                    <input name="proofUrl" type="url" placeholder="https://..." />
                  </label>
                  <button type="submit" disabled={!hasUnreservedCopies}>Submit pull</button>
                </form>
              </div>
            ) : (
              <div className="access-required compact-access">
                <div>
                  <h3>Account required</h3>
                  <p>Create an account to submit pulls or claim this card.</p>
                </div>
                <a className="button-link" href={`/login?next=${encodeURIComponent(returnTo)}`}>
                  Login / Create account
                </a>
              </div>
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
            <div className="notice success">Card added to favorites.</div>
          ) : null}
          {query.bidSubmitted ? (
            <div className="notice success">Bid saved. The owner can review it.</div>
          ) : null}

          {copies.length ? (
            <div className="copy-selector-panel">
              <div className="copy-selector-heading">
                <span>Status</span>
                <strong>{selectedCopyLabel ?? card.serial}</strong>
              </div>
              <div className="copy-selector-grid" aria-label="Serial copy status">
                {copies.map((copy) => (
                  <a
                    className={`copy-selector-item ${copy.status.toLowerCase()} ${
                      copy.copyNumber === selectedCopyNumber ? "active" : ""
                    }`}
                    href={`/cards/${card.slug}?copy=${copy.copyNumber}`}
                    key={copy.copyNumber}
                  >
                    <span>{copy.label}</span>
                    <small>{copy.marker ?? copy.status}</small>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ownership-summary">
            <div className="ownership-row primary">
              <span>Player ranking</span>
              <strong>{formatRanking(card.playerRanking)}</strong>
              <small>
                {formatRankingMeta(card.playerRankingPoints, card.playerRankingMovement)}
              </small>
            </div>
            <div className="ownership-row">
              <span>Race ranking</span>
              <strong>{formatRanking(card.playerRaceRanking)}</strong>
              <small>
                {formatRankingMeta(card.playerRaceRankingPoints, card.playerRaceRankingMovement)}
              </small>
            </div>
            <div className="ownership-row primary">
              <span>{selectedCopyLabel ? `Owned by · ${selectedCopyLabel}` : "Owned by"}</span>
              <strong>
                {selectedOwnerLabel ?? "Not claimed yet"}
              </strong>
              {ownedDateLabel ? <small>Since {ownedDateLabel}</small> : null}
            </div>
            <div className="ownership-row">
              <span>Pulled by</span>
              <strong>{selectedPulledBy ?? "-"}</strong>
              <small>{pulledDateLabel}</small>
            </div>
            <div className="ownership-row">
              <span>Status</span>
              <strong>{selectedStatus}</strong>
              <small>
                {selectedCopyLabel ? `${selectedCopyLabel} · ` : ""}
                {card.pulledLabel}
                {card.printRun ? ` · ${remainingCopies} open` : ""}
                {pendingCopyCount ? ` · ${pendingCopyCount} pending` : ""}
              </small>
            </div>
            <div className="ownership-row">
              <span>Market signal</span>
              <strong>{selectedMarketBid}</strong>
              <small>
                {selectedMarketBidCount} bids{selectedCopyLabel ? " on this copy" : ""} · {card.favoriteCount} favorites total
              </small>
            </div>
          </div>

          {user ? (
            <>
          <form className="db-form compact-form" action={favoriteCardAction}>
            <div className="form-heading">
              <h3>Add to favorites</h3>
              <p>Save this card to your account.</p>
            </div>
            <input name="cardId" type="hidden" value={card.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <p className="user-action-note">Logged in as {user.displayName}</p>
            <button type="submit">Save favorite</button>
          </form>

          <form className="db-form compact-form" action={submitBidAction}>
            <div className="form-heading">
              <h3>Place bid</h3>
              <p>Send a private offer to the owner.</p>
            </div>
            <input name="cardId" type="hidden" value={card.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            {selectedCopyNumber ? <input name="copyNumber" type="hidden" value={selectedCopyNumber} /> : null}
            <div className="inline-fields">
              <label className="field">
              <span>Amount</span>
                <input name="amount" inputMode="decimal" placeholder="2500" required />
              </label>
              <label className="field currency-field">
                <span>Currency</span>
                <input name="currency" defaultValue="EUR" maxLength={3} />
              </label>
            </div>
            <label className="field">
              <span>Note</span>
              <input name="note" placeholder="Optional message to the owner" />
            </label>
            <button type="submit">Submit bid</button>
          </form>
            </>
          ) : (
            <div className="access-required compact-access">
              <div>
                <h3>Account required</h3>
                <p>Favorites and bids are saved to your account.</p>
              </div>
              <a className="button-link" href={`/login?next=${encodeURIComponent(returnTo)}`}>
                Login / Create account
              </a>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

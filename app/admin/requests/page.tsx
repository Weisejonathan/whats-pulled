import {
  approveClaimRequestAction,
  rejectClaimRequestAction,
} from "@/app/actions";
import { AuthNav } from "@/app/auth-nav";
import { requireAdminSession } from "@/lib/auth";
import { getPendingClaimRequests } from "@/lib/db/admin";

type RequestsPageProps = {
  searchParams: Promise<{
    approved?: string;
    rejected?: string;
  }>;
};

const returnTo = "/admin/requests";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({ searchParams }: RequestsPageProps) {
  await requireAdminSession(returnTo);
  const params = await searchParams;
  const { databaseReady, requests } = await getPendingClaimRequests();

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
          <a href="/sets/topps-chrome-tennis-2025">Topps Chrome Tennis</a>
          <AuthNav />
        </nav>
      </header>

      <section className="catalog-hero">
        <p className="eyebrow">Admin backend</p>
        <h1>Claim Requests</h1>
        <p>{requests.length} pending requests waiting for review.</p>
      </section>

      <section className="admin-shell">
        {params.approved ? (
          <div className="notice success">Claim request approved.</div>
        ) : null}

        {params.rejected ? (
          <div className="notice error">Claim request rejected.</div>
        ) : null}

        {!databaseReady ? (
          <div className="notice error">Database connection is not available.</div>
        ) : null}

        {requests.length ? (
          <div className="request-list">
            {requests.map((request) => (
              <article className="request-card" key={request.id}>
                <div>
                  <p className="eyebrow">{request.set.sport}</p>
                  <h2>{request.card.player}</h2>
                  <p>
                    {[
                      request.card.cardNumber ? `#${request.card.cardNumber}` : null,
                      request.card.cardName,
                      request.card.parallel,
                      request.card.serial,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="request-meta">
                    <span>{request.set.name}</span>
                    <span>{request.createdAt.toLocaleDateString("en-US")}</span>
                  </div>
                </div>

                <div className="request-owner">
                  <span>Requested owner</span>
                  <strong>{request.ownerDisplayName}</strong>
                  {request.note ? <p>{request.note}</p> : null}
                  {request.proofUrl ? (
                    <a href={request.proofUrl} target="_blank" rel="noreferrer">
                      Proof URL
                    </a>
                  ) : (
                    <small>No proof URL</small>
                  )}
                  <a href={`/cards/${request.card.slug}`}>Open card</a>
                </div>

                <div className="request-proof-image">
                  {request.imageUrl ? (
                    <>
                      <img
                        src={request.imageUrl}
                        alt={`${request.card.player} claim request`}
                      />
                      <a href={request.imageUrl} target="_blank" rel="noreferrer">
                        Open image
                      </a>
                    </>
                  ) : (
                    <small>No image submitted</small>
                  )}
                </div>

                <div className="request-actions">
                  <form action={approveClaimRequestAction}>
                    <input name="claimId" type="hidden" value={request.id} />
                    <input name="returnTo" type="hidden" value={returnTo} />
                    <button type="submit">
                      {request.imageUrl ? "Approve + Image" : "Approve"}
                    </button>
                  </form>
                  <form action={rejectClaimRequestAction}>
                    <input name="claimId" type="hidden" value={request.id} />
                    <input name="returnTo" type="hidden" value={returnTo} />
                    <button className="secondary-button" type="submit">
                      Reject
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">All clear</p>
            <h2>No pending claim requests</h2>
            <p>New public claim suggestions will appear here for approval.</p>
          </div>
        )}
      </section>
    </main>
  );
}

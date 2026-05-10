import {
  approveClaimRequestAction,
  approvePullRequestAction,
  rejectClaimRequestAction,
  rejectPullRequestAction,
} from "@/app/actions";
import { SiteHeader } from "@/app/site-header";
import { requireAdminSession } from "@/lib/auth";
import { calculatePullPoints } from "@/lib/db/points";
import { getPendingClaimRequests, getPendingPullRequests } from "@/lib/db/admin";

type RequestsPageProps = {
  searchParams: Promise<{
    approved?: string;
    pullApproved?: string;
    pullRejected?: string;
    rejected?: string;
  }>;
};

const returnTo = "/admin/requests";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({ searchParams }: RequestsPageProps) {
  await requireAdminSession(returnTo);
  const params = await searchParams;
  const [{ databaseReady, requests }, pullRequestData] = await Promise.all([
    getPendingClaimRequests(),
    getPendingPullRequests(),
  ]);
  const pullRequests = pullRequestData.requests;

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
          { href: "/sets/topps-chrome-tennis-2025", label: "Topps Chrome Tennis" },
        ]}
      />

      <section className="catalog-hero">
        <p className="eyebrow">Admin backend</p>
        <h1>Admin Requests</h1>
        <p>
          {requests.length} pending claims · {pullRequests.length} pending pulls waiting for review.
        </p>
      </section>

      <section className="admin-shell">
        {params.approved ? (
          <div className="notice success">Claim request approved.</div>
        ) : null}

        {params.rejected ? (
          <div className="notice error">Claim request rejected.</div>
        ) : null}

        {params.pullApproved ? (
          <div className="notice success">Pull request approved and points awarded.</div>
        ) : null}

        {params.pullRejected ? (
          <div className="notice error">Pull request rejected.</div>
        ) : null}

        {!databaseReady || !pullRequestData.databaseReady ? (
          <div className="notice error">Database connection is not available.</div>
        ) : null}

        <div className="section-heading">
          <div>
            <p className="eyebrow">Collector points</p>
            <h2>Pull Requests</h2>
          </div>
        </div>

        {pullRequests.length ? (
          <div className="request-list">
            {pullRequests.map((request) => {
              const previewAward = calculatePullPoints({
                hasProof: Boolean(request.proofUrl),
                isFirstVerifiedPull: true,
                printRun: request.card.printRun,
              });

              return (
                <article className="request-card" key={request.id}>
                  <div>
                    <p className="eyebrow">{request.set.sport}</p>
                    <h2>{request.card.player}</h2>
                    <p>
                      {[
                        request.card.cardNumber ? `#${request.card.cardNumber}` : null,
                        request.card.cardName,
                        request.card.parallel,
                        request.copyNumber && request.card.printRun
                          ? `${request.copyNumber}/${request.card.printRun}`
                          : null,
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
                    <span>Submitted by</span>
                    <strong>
                      {request.submittedBy.displayName ?? request.reportedByName ?? "Collector"}
                    </strong>
                    {request.submittedBy.email ? <small>{request.submittedBy.email}</small> : null}
                    {request.proofUrl ? (
                      <a href={request.proofUrl} target="_blank" rel="noreferrer">
                        Proof URL
                      </a>
                    ) : (
                      <small>No proof URL</small>
                    )}
                    <a href={`/cards/${request.card.slug}`}>Open card</a>
                  </div>

                  <div className="request-owner">
                    <span>Point preview</span>
                    <strong>{previewAward.points} pts</strong>
                    <p>{previewAward.reason}</p>
                  </div>

                  <div className="request-actions">
                    <form action={approvePullRequestAction}>
                      <input name="pullId" type="hidden" value={request.id} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <button type="submit">Approve + Points</button>
                    </form>
                    <form action={rejectPullRequestAction}>
                      <input name="pullId" type="hidden" value={request.id} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <button className="secondary-button" type="submit">
                        Reject
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">All clear</p>
            <h2>No pending pull requests</h2>
            <p>New collector pull submissions will appear here before points are awarded.</p>
          </div>
        )}

        <div className="section-heading">
          <div>
            <p className="eyebrow">Ownership</p>
            <h2>Claim Requests</h2>
          </div>
        </div>

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
                      request.copyNumber ? `${request.copyNumber}/${request.card.serial.replace("/", "")}` : null,
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

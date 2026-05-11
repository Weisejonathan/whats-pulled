import { SiteHeader } from "@/app/site-header";
import { pastBreakPlaceholders } from "@/app/breakers/break-placeholders";
import { getBreakerDetail } from "@/lib/db/breakers";

type BreakerDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function BreakerDetailPage({ params }: BreakerDetailPageProps) {
  const { slug } = await params;
  const breaker = await getBreakerDetail(slug);

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/breakers", label: "Breakers" },
          { href: "/sports", label: "Sports" },
        ]}
      />

      <section className="breaker-detail-hero">
        <div>
          <p className="eyebrow">Breaker #{breaker.rank}</p>
          <h1>{breaker.name}</h1>
          <p>
            {breaker.country ?? "Global"} · {breaker.verified ? "Verified breaker" : "Tracked breaker"}
          </p>
          <button className="breaker-follow-button" type="button">
            Follow {breaker.name}
          </button>
        </div>
        <div className="breaker-detail-score">
          <span>Total Pull Value</span>
          <strong>{breaker.totalValue}</strong>
        </div>
      </section>

      <section className="breaker-stats-grid">
        <div>
          <span>Verified Pulls</span>
          <strong>{breaker.hitCount}</strong>
        </div>
        <div>
          <span>Tracked Sets</span>
          <strong>{breaker.trackedSets}</strong>
        </div>
        <div>
          <span>Average Pull</span>
          <strong>{breaker.averageValue}</strong>
        </div>
        <div>
          <span>Best Pull</span>
          <strong>{breaker.topPull?.value ?? "-"}</strong>
        </div>
      </section>

      <section className="breaker-past-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Break Archive</p>
            <h2>Vergangene Breaks</h2>
          </div>
        </div>

        <div className="breaker-past-grid">
          {pastBreakPlaceholders.map((event) => (
            <a className="breaker-past-card" href={`/breakers/${breaker.slug}/breaks/${event.id}`} key={event.id}>
              <span>{event.platform}</span>
              <h3>{event.set}</h3>
              <p>{event.time}</p>
              <strong>{event.pulls.length} Pulls ansehen</strong>
            </a>
          ))}
        </div>
      </section>

      <section className="breaker-pulls-section">
        <div className="section-heading" id="verified-pulls">
          <div>
            <p className="eyebrow">Pull History</p>
            <h2>Verified Pulls</h2>
          </div>
        </div>

        {breaker.pulls.length ? (
          <div className="breaker-pull-grid">
            {breaker.pulls.map((pull) => (
              <a className="breaker-pull-card" href={pull.cardUrl} key={`${pull.cardUrl}-${pull.pulledAt}`}>
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
                  <p>{pull.setName}</p>
                  <strong>{pull.title}</strong>
                  <small>
                    {pull.value} · {pull.pulledAt}
                  </small>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No verified pulls yet</h3>
            <p>Approved pulls will appear here with value, date, set and card links.</p>
          </div>
        )}
      </section>
    </main>
  );
}

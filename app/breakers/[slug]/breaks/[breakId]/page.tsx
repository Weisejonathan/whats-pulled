import { SiteHeader } from "@/app/site-header";
import { pastBreakPlaceholders } from "@/app/breakers/break-placeholders";
import { getBreakerDetail } from "@/lib/db/breakers";
import { notFound } from "next/navigation";

type BreakDetailPageProps = {
  params: Promise<{
    breakId: string;
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function BreakDetailPage({ params }: BreakDetailPageProps) {
  const { breakId, slug } = await params;
  const breaker = await getBreakerDetail(slug);
  const breakEvent = pastBreakPlaceholders.find((event) => event.id === breakId);

  if (!breakEvent) {
    notFound();
  }

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/breakers", label: "Breakers" },
          { href: `/breakers/${breaker.slug}`, label: breaker.name },
        ]}
      />

      <section className="breaker-break-hero">
        <div>
          <p className="eyebrow">{breakEvent.platform} Break</p>
          <h1>{breakEvent.set}</h1>
          <p>
            {breaker.name} · {breakEvent.time} · Platzhalter Pull-Liste
          </p>
        </div>
        <div className="breaker-detail-score">
          <span>Tracked Pulls</span>
          <strong>{breakEvent.pulls.length}</strong>
        </div>
      </section>

      <section className="breaker-break-pulls-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pulls</p>
            <h2>Pulls aus diesem Break</h2>
          </div>
        </div>

        <div className="breaker-break-pull-list">
          {breakEvent.pulls.map((pull, index) => (
            <a className="breaker-break-pull-row" href={pull.cardUrl} key={`${pull.player}-${pull.serial}`}>
              <span className="rank">{index + 1}</span>
              <div className="mini-card pulled">
                <span>{pull.serial}</span>
              </div>
              <div>
                <strong>{pull.player}</strong>
                <p>{pull.title}</p>
              </div>
              <b>{pull.value}</b>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

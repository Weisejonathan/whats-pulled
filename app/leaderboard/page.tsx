import { SiteHeader } from "@/app/site-header";
import {
  getCollectorLeaderboard,
  readLeaderboardInterval,
  type LeaderboardInterval,
} from "@/lib/db/leaderboard";

type LeaderboardPageProps = {
  searchParams: Promise<{
    interval?: string;
  }>;
};

const intervals: { href: string; label: string; value: LeaderboardInterval }[] = [
  { href: "/leaderboard?interval=week", label: "This Week", value: "week" },
  { href: "/leaderboard?interval=month", label: "This Month", value: "month" },
  { href: "/leaderboard?interval=all", label: "All Time", value: "all" },
];

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const params = await searchParams;
  const interval = readLeaderboardInterval(params.interval);
  const { databaseReady, entries, intervalLabel } = await getCollectorLeaderboard(interval);

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
          { href: "/breakers", label: "Breakers" },
        ]}
      />

      <section className="leaderboard-hero">
        <p className="eyebrow">Collector Incentives</p>
        <h1>Pull Leaderboard</h1>
        <p>
          Approved user submissions earn points. Weekly and monthly seasons keep the race open
          for new collectors.
        </p>
        <div className="leaderboard-tabs" aria-label="Leaderboard interval">
          {intervals.map((item) => (
            <a className={interval === item.value ? "active" : ""} href={item.href} key={item.value}>
              {item.label}
            </a>
          ))}
        </div>
      </section>

      <section className="leaderboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{intervalLabel}</p>
            <h2>Current standings</h2>
          </div>
        </div>

        {!databaseReady ? (
          <div className="notice error">Database connection is not available.</div>
        ) : null}

        {entries.length ? (
          <div className="collector-leaderboard-list">
            {entries.map((entry) => (
              <article className="collector-leaderboard-card" key={entry.userId}>
                <span className="rank">{entry.rank}</span>
                <div>
                  <h3>{entry.displayName}</h3>
                  <p>
                    {entry.approvedPulls} approved pull{entry.approvedPulls === 1 ? "" : "s"}
                  </p>
                </div>
                <strong>{entry.points} pts</strong>
                <small>
                  {entry.topPull
                    ? `Top pull: ${entry.topPull.player} ${entry.topPull.serial} · ${entry.topPull.points} pts`
                    : "No top pull yet"}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">No points yet</p>
            <h2>Awaiting approved collector pulls</h2>
            <p>Once admins approve user submissions, points will appear here automatically.</p>
          </div>
        )}
      </section>
    </main>
  );
}

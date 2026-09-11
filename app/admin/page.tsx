import type { CSSProperties } from "react";
import { SiteHeader } from "@/app/site-header";
import { requireAdminSession } from "@/lib/auth";
import { getAnalyticsDashboard, TOOL_LABELS } from "@/lib/db/analytics";

type AdminPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat("de-DE");
const compact = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });

function changePercent(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function relativeDate(date: Date | null) {
  if (!date) return "Noch keine Aktivität";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 2) return "Gerade aktiv";
  if (minutes < 60) return `Vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Vor ${hours} Std.`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

const pathLabel = (path: string | null) => {
  if (!path) return "–";
  if (path.startsWith("/detector")) return "Detector";
  if (path.startsWith("/stream-detector")) return "Stream Detector";
  if (path.startsWith("/direct-uploader")) return "Direct Uploader";
  if (path.startsWith("/cards")) return "Kartenkatalog";
  return path === "/" ? "Startseite" : path;
};

function Icon({ name }: { name: "users" | "live" | "cost" | "calls" }) {
  const paths = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    live: <><path d="M2 12h3l2-5 4 10 3-7 2 4h6"/><circle cx="12" cy="12" r="10"/></>,
    cost: <><circle cx="12" cy="12" r="10"/><path d="M16 8.5c-.7-.9-1.8-1.5-3.2-1.5-2 0-3.3 1-3.3 2.5 0 3.8 7 1.5 7 5 0 1.5-1.4 2.5-3.5 2.5-1.5 0-2.8-.6-3.6-1.7M12.8 5v14"/></>,
    calls: <><path d="m13 2-9 11h8l-1 9 9-12h-8l1-8Z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

export default async function AdminDashboard({ searchParams }: AdminPageProps) {
  await requireAdminSession("/admin");
  const params = await searchParams;
  const selectedRange = Number(params.range ?? 30);
  const data = await getAnalyticsDashboard(selectedRange);
  const maxDaily = Math.max(1, ...data.daily.map((day) => day.sessions));
  const maxToolCalls = Math.max(1, ...data.tools.map((tool) => tool.calls));
  const budgetPercent = data.monthlyBudget ? Math.min(100, (data.totals.monthlyCost / data.monthlyBudget) * 100) : 0;
  const costTrend = changePercent(data.totals.cost, data.totals.previousCost);
  const knownTools = ["vision-detector", "frame-upload", "direct-uploader", "instagram-import"];
  const tools = knownTools.map((name) => data.tools.find((tool) => tool.tool === name) ?? {
    tool: name, calls: 0, users: 0, cost: 0, inputUnits: 0, outputUnits: 0,
  }).concat(data.tools.filter((tool) => !knownTools.includes(tool.tool)));

  return (
    <main className="page-shell admin-dashboard">
      <SiteHeader links={[{ href: "/admin", label: "Übersicht" }, { href: "/admin/requests", label: "Anfragen" }]} />

      <section className="admin-dashboard-head">
        <div>
          <p className="eyebrow">Operations Center</p>
          <h1>Alles im Blick.</h1>
          <p>Nutzung, Aktivität und laufende Tool-Kosten in einer Ansicht.</p>
        </div>
        <div className="admin-head-actions">
          <span className="admin-system-status"><i /> System aktiv</span>
          <nav className="admin-range" aria-label="Zeitraum auswählen">
            {[7, 30, 90].map((range) => (
              <a className={data.days === range ? "active" : ""} href={`/admin?range=${range}`} key={range}>{range} T</a>
            ))}
          </nav>
        </div>
      </section>

      <section className="admin-dashboard-shell">
        {!data.databaseReady ? <div className="notice error">Keine Datenbankverbindung. Bitte DATABASE_URL prüfen.</div> : null}
        {!data.telemetryReady && data.databaseReady ? <div className="notice error">Analytics-Tabellen fehlen. Migration 0008_admin_analytics.sql ausführen.</div> : null}

        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <div className="admin-kpi-icon"><Icon name="users" /></div>
            <span>Registrierte User</span>
            <strong>{integer.format(data.totals.users)}</strong>
            <small>+{integer.format(data.totals.newUsers)} in den letzten {data.days} Tagen</small>
          </article>
          <article className="admin-kpi-card admin-kpi-live">
            <div className="admin-kpi-icon"><Icon name="live" /></div>
            <span>Live User</span>
            <strong>{integer.format(data.totals.liveUsers)}</strong>
            <small><i /> Aktiv in den letzten 2 Minuten</small>
          </article>
          <article className="admin-kpi-card">
            <div className="admin-kpi-icon"><Icon name="calls" /></div>
            <span>Tool-Nutzungen</span>
            <strong>{compact.format(data.totals.calls)}</strong>
            <small>Im gewählten Zeitraum</small>
          </article>
          <article className="admin-kpi-card admin-kpi-cost">
            <div className="admin-kpi-icon"><Icon name="cost" /></div>
            <span>Geschätzte Kosten</span>
            <strong>{money.format(data.totals.cost)}</strong>
            <small className={costTrend > 0 ? "cost-up" : "cost-down"}>{costTrend > 0 ? "↑" : "↓"} {Math.abs(costTrend).toFixed(0)} % zur Vorperiode</small>
          </article>
        </div>

        <div className="admin-main-grid">
          <article className="admin-data-panel admin-activity-panel">
            <div className="admin-panel-heading">
              <div><p className="eyebrow">Traffic</p><h2>Aktivität</h2></div>
              <div className="admin-chart-legend"><span><i /> Sessions</span><span><i /> Tool Calls</span></div>
            </div>
            {data.daily.length ? (
              <div className="admin-bar-chart" aria-label={`Aktive Sessions der letzten ${data.days} Tage`}>
                {data.daily.map((day, index) => {
                  const showLabel = data.days <= 7 || index === 0 || index === data.daily.length - 1 || index % Math.ceil(data.days / 6) === 0;
                  return (
                    <div className="admin-bar-column" key={day.date} title={`${day.date}: ${day.sessions} Sessions, ${day.calls} Tool Calls`}>
                      <div className="admin-bars">
                        <i className="session-bar" style={{ "--bar-height": `${Math.max(3, day.sessions / maxDaily * 100)}%` } as CSSProperties} />
                        <i className="call-bar" style={{ "--bar-height": `${Math.max(2, day.calls / Math.max(1, ...data.daily.map((item) => item.calls)) * 100)}%` } as CSSProperties} />
                      </div>
                      <span>{showLabel ? new Date(`${day.date}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "short" }) : ""}</span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="admin-chart-empty">Aktivitätsdaten werden ab jetzt erfasst.</div>}
          </article>

          <article className="admin-data-panel admin-budget-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Kostenkontrolle</p><h2>Monatsbudget</h2></div><strong>{budgetPercent.toFixed(0)} %</strong></div>
            <div className="admin-budget-number"><strong>{money.format(data.totals.monthlyCost)}</strong><span>von {money.format(data.monthlyBudget)}</span></div>
            <div className="admin-budget-track"><i style={{ width: `${budgetPercent}%` }} /></div>
            <p>{budgetPercent >= 80 ? "Budgetgrenze fast erreicht. Bitte Nutzung und Tarife prüfen." : `${money.format(Math.max(0, data.monthlyBudget - data.totals.monthlyCost))} bis zum gesetzten Monatslimit.`}</p>
          </article>
        </div>

        <article className="admin-data-panel admin-tool-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">Kostenstellen</p><h2>Nutzung nach Tool</h2></div>
            <span className="admin-estimate-label">Kosten sind Schätzwerte</span>
          </div>
          <div className="admin-tool-table" role="table" aria-label="Nutzung und Kosten je Tool">
            <div className="admin-tool-row admin-tool-header" role="row"><span>Tool</span><span>Nutzung</span><span>User</span><span>Tokens / Daten</span><span>Kosten</span></div>
            {tools.map((tool) => (
              <div className="admin-tool-row" role="row" key={tool.tool}>
                <div className="admin-tool-name"><i>{TOOL_LABELS[tool.tool]?.slice(0, 1) ?? "T"}</i><span><strong>{TOOL_LABELS[tool.tool] ?? tool.tool}</strong><small>{tool.tool}</small></span></div>
                <div className="admin-usage-cell"><strong>{integer.format(tool.calls)}</strong><i><b style={{ width: `${tool.calls / maxToolCalls * 100}%` }} /></i></div>
                <span>{integer.format(tool.users)}</span>
                <span>{tool.inputUnits || tool.outputUnits ? `${compact.format(tool.inputUnits)} / ${compact.format(tool.outputUnits)}` : "–"}</span>
                <strong>{money.format(tool.cost)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-data-panel admin-users-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Zuletzt gesehen</p><h2>User-Aktivität</h2></div></div>
          {data.recentUsers.length ? <div className="admin-user-list">
            {data.recentUsers.map((user) => (
              <div className="admin-user-row" key={user.id}>
                <span className="admin-user-avatar">{user.displayName.slice(0, 2).toUpperCase()}</span>
                <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
                <span><small>Letzte Seite</small><strong>{pathLabel(user.pagePath)}</strong></span>
                <span className={user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() < 120_000 ? "is-live" : ""}><i />{relativeDate(user.lastSeenAt)}</span>
              </div>
            ))}
          </div> : <div className="admin-chart-empty">Noch keine registrierten User vorhanden.</div>}
        </article>
      </section>
    </main>
  );
}

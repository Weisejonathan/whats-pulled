import { SiteHeader } from "@/app/site-header";
import { createBreakSessionAction } from "./actions";
import { getRecentBreakSessions } from "@/lib/db/live-breaks";
import { headers } from "next/headers";
import { ObsEmbedControls } from "./obs-embed-controls";

export const dynamic = "force-dynamic";

type StudioPageProps = {
  searchParams: Promise<{
    session?: string;
  }>;
};

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const { session: requestedSession } = await searchParams;
  const sessions = await getRecentBreakSessions();
  const activeSession =
    sessions.find((session) => session.overlayKey === requestedSession) ?? sessions[0];
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "";
  const overlaySourceUrl = `${origin}${activeSession.overlayUrl}`;
  const apiEndpointUrl = `${origin}/api/obs/recognitions/${activeSession.overlayKey}`;

  return (
    <main className="page-shell studio-page">
      <SiteHeader
        links={[
          { href: "/studio", label: "OBS Studio" },
          { href: activeSession.overlayUrl, label: "Overlay" },
          { href: "/breakers", label: "Breakers" },
        ]}
      />

      <section className="studio-hero">
        <div>
          <p className="eyebrow">Breaker control room</p>
          <h1>OBS Overlay & Recognition Hub</h1>
          <p>
            Starte Break-Sessions, kopiere die Browser-Source-URL in OBS und
            empfange bestätigte Karten aus deiner lokalen Erkennungs-App.
          </p>
        </div>
        <form className="studio-session-form" action={createBreakSessionAction}>
          <label>
            Breaker
            <input name="breakerName" placeholder="Court Kings Breaks" required />
          </label>
          <label>
            Session
            <input name="title" placeholder="Topps Chrome Tennis Case #12" required />
          </label>
          <label>
            Plattform
            <select name="streamPlatform" defaultValue="obs">
              <option value="obs">OBS</option>
              <option value="whatnot">Whatnot</option>
              <option value="fanatics-live">Fanatics Live</option>
              <option value="twitch">Twitch</option>
              <option value="youtube">YouTube</option>
            </select>
          </label>
          <button type="submit">Session starten</button>
        </form>
      </section>

      <section className="studio-grid">
        <div className="studio-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live source</p>
              <h2>OBS Browser Source</h2>
            </div>
            <span className={`connection-pill ${activeSession.status === "live" ? "online" : "offline"}`}>
              {activeSession.status}
            </span>
          </div>
          <div className="overlay-url-box">
            <span>Active Overlay Key</span>
            <code>{activeSession.overlayKey}</code>
          </div>
          <ObsEmbedControls apiEndpointUrl={apiEndpointUrl} overlayUrl={overlaySourceUrl} />
          <div className="api-example">
            <span>OBS Browser Source Setup</span>
            <code>Browser Source · 1920x1080 · Shutdown source when not visible off</code>
          </div>
          <pre className="payload-example">{`{
  "playerName": "Novak Djokovic",
  "setName": "Topps Chrome Tennis 2025",
  "cardNumber": "1",
  "limitation": "1/1",
  "isAutographed": true,
  "confidence": 0.98,
  "frameImageUrl": "https://..."
}`}</pre>
        </div>

        <div className="studio-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recognitions</p>
              <h2>Letzte Treffer</h2>
            </div>
          </div>
          <div className="recognition-list">
            {activeSession.recognitions.map((event) => (
              <article className="recognition-row" key={event.id}>
                <div className="recognition-thumb">
                  {event.frameImageUrl ? (
                    <img src={event.frameImageUrl} alt={`${event.playerName} ${event.cardName}`} />
                  ) : (
                    <span>{event.limitation ?? event.serialNumber ?? "CARD"}</span>
                  )}
                </div>
                <div>
                  <strong>{event.playerName}</strong>
                  <span>{event.setName}</span>
                  <small>
                    {event.cardName} · {event.confidence}
                  </small>
                </div>
                <b>{event.status}</b>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="studio-panel session-table">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sessions</p>
            <h2>Recent Break Rooms</h2>
          </div>
        </div>
        <div className="session-rows">
          {sessions.map((session) => (
            <a className="session-row" href={`/studio?session=${session.overlayKey}`} key={session.id}>
              <span>{session.title}</span>
              <strong>{session.breakerName}</strong>
              <code>{session.overlayUrl}</code>
              <b>{session.status}</b>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

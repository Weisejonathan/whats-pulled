import { SiteHeader } from "@/app/site-header";
import { createBreakSessionAction } from "./actions";
import { getRecentBreakSessions } from "@/lib/db/live-breaks";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const sessions = await getRecentBreakSessions();
  const activeSession = sessions[0];

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
            <span>Overlay URL</span>
            <code>{activeSession.overlayUrl}</code>
          </div>
          <div className="overlay-mode-buttons">
            <a href={`${activeSession.overlayUrl}?mode=last&controls=1`}>Play Last Pull</a>
            <a href={`${activeSession.overlayUrl}?mode=preview&controls=1`}>Play Set Preview</a>
            <a href={`${activeSession.overlayUrl}?mode=comp&controls=1`}>Play Comp</a>
          </div>
          <div className="api-example">
            <span>Local recognition endpoint</span>
            <code>{`POST /api/obs/recognitions/${activeSession.overlayKey}`}</code>
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
            <a className="session-row" href={session.overlayUrl} key={session.id}>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BreakSessionView, OverlayRecognition } from "@/lib/db/live-breaks";

type OverlayClientProps = {
  initialSession: BreakSessionView;
  overlayKey: string;
};

type OverlayMode = "last" | "preview" | "comp";

const resolveMode = (mode: string | null): OverlayMode => {
  const rawMode = mode?.toLowerCase();

  if (rawMode === "preview" || rawMode === "set-preview") {
    return "preview";
  }

  if (rawMode === "comp" || rawMode === "sales-comp") {
    return "comp";
  }

  return "last";
};

const CardImage = ({ latest }: { latest: OverlayRecognition }) => {
  const imageUrl = latest.imageUrl ?? latest.frameImageUrl;

  return (
    <div className="obs-card-frame">
      {imageUrl ? (
        <img src={imageUrl} alt={`${latest.playerName} ${latest.cardName}`} />
      ) : (
        <span>{latest.limitation ?? latest.serialNumber ?? "HIT"}</span>
      )}
    </div>
  );
};

export function OverlayClient({ initialSession, overlayKey }: OverlayClientProps) {
  const searchParams = useSearchParams();
  const [session, setSession] = useState(initialSession);
  const [mode, setMode] = useState<OverlayMode>("last");
  const [replayToken, setReplayToken] = useState(0);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    setMode(resolveMode(searchParams.get("mode")));
    setShowControls(overlayKey === "demo" || searchParams.get("controls") === "1");
  }, [overlayKey, searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    const refresh = async () => {
      const response = await fetch(`/api/overlay/${overlayKey}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as BreakSessionView;
        setSession(data);
      }
    };

    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 1600);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [overlayKey]);

  const latest = session.recognitions[0];
  const confirmedCount = useMemo(
    () => session.recognitions.filter((event) => event.status === "confirmed").length,
    [session.recognitions],
  );
  const shellClassName = `obs-overlay-panel obs-overlay-panel-${mode}`;
  const playbackKey = `${mode}-${latest?.id ?? session.previewCards.map((card) => card.cardId).join("-")}-${replayToken}`;

  return (
    <main className="obs-overlay-shell">
      <section className={shellClassName}>
        <div className="obs-overlay-topline">
          <span>{session.breakerName}</span>
          <strong>{mode === "preview" ? "Set preview" : mode === "comp" ? "Sales comp" : session.status}</strong>
        </div>

        <div className="obs-overlay-stage" key={playbackKey}>
          {mode === "preview" ? (
          <div className="obs-preview-layout">
            <div>
              <span className="obs-hit-kicker">Still possible</span>
              <h1>{session.title}</h1>
            </div>
            <div className="obs-preview-grid">
              {session.previewCards.length ? (
                session.previewCards.map((card) => (
                  <article className="obs-preview-card" key={card.cardId}>
                    <div className="obs-preview-image">
                      {card.imageUrl ? <img src={card.imageUrl} alt={`${card.playerName} ${card.cardName}`} /> : null}
                      <span>{card.serialNumber}</span>
                    </div>
                    <div>
                      <strong>{card.playerName}</strong>
                      <small>{card.cardName}</small>
                    </div>
                    <div className="obs-preview-meta">
                      <b>{card.compLabel}</b>
                      <span>{card.remainingLabel}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="obs-empty-state">
                  <span>Waiting for set data</span>
                </div>
              )}
            </div>
          </div>
        ) : latest && mode === "comp" ? (
          <div className="obs-comp-layout">
            <span className="obs-hit-kicker">Sales comp</span>
            <h1>{latest.compLabel}</h1>
            <p>{latest.playerName}</p>
            <div className="obs-hit-meta">
              <span>{latest.cardName}</span>
              <span>{latest.limitation ?? latest.serialNumber ?? latest.rawCardNumber ?? "Open"}</span>
              <span>{latest.confidence}</span>
            </div>
          </div>
        ) : latest ? (
          <div className="obs-hit-layout">
            <CardImage latest={latest} />
            <div className="obs-hit-copy">
              <span className="obs-hit-kicker">Last pulled</span>
              <h1>{latest.playerName}</h1>
              <p>{latest.cardName}</p>
              <div className="obs-comp-chip">
                <span>Comp</span>
                <strong>{latest.compLabel}</strong>
              </div>
              <div className="obs-hit-meta">
                <span>{latest.setName}</span>
                <span>{latest.limitation ?? latest.serialNumber ?? latest.rawCardNumber ?? "Open"}</span>
                {latest.isAutographed ? <span>Auto</span> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="obs-empty-state">
            <span>Waiting for first card</span>
          </div>
        )}
        </div>

        <div className="obs-overlay-footer">
          <span>{session.title}</span>
          <strong>{confirmedCount} hits</strong>
        </div>
        {showControls ? (
          <div className="obs-overlay-controls">
            <button type="button" onClick={() => setReplayToken((current) => current + 1)}>
              Play animation
            </button>
            <button type="button" onClick={() => setMode("last")}>
              Last pulled
            </button>
            <button type="button" onClick={() => setMode("preview")}>
              Set preview
            </button>
            <button type="button" onClick={() => setMode("comp")}>
              Comp
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

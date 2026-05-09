"use client";

import { useEffect, useMemo, useState } from "react";
import type { BreakSessionView } from "@/lib/db/live-breaks";

type OverlayClientProps = {
  initialSession: BreakSessionView;
  overlayKey: string;
};

export function OverlayClient({ initialSession, overlayKey }: OverlayClientProps) {
  const [session, setSession] = useState(initialSession);

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

  return (
    <main className="obs-overlay-shell">
      <section className="obs-overlay-panel">
        <div className="obs-overlay-topline">
          <span>{session.breakerName}</span>
          <strong>{session.status}</strong>
        </div>

        {latest ? (
          <div className="obs-hit-layout">
            <div className="obs-card-frame">
              {latest.frameImageUrl ? (
                <img src={latest.frameImageUrl} alt={`${latest.playerName} ${latest.cardName}`} />
              ) : (
                <span>{latest.limitation ?? latest.serialNumber ?? "HIT"}</span>
              )}
            </div>
            <div className="obs-hit-copy">
              <span className="obs-hit-kicker">Now pulled</span>
              <h1>{latest.playerName}</h1>
              <p>{latest.cardName}</p>
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

        <div className="obs-overlay-footer">
          <span>{session.title}</span>
          <strong>{confirmedCount} hits</strong>
        </div>
      </section>
    </main>
  );
}

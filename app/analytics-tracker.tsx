"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SESSION_KEY = "wp_analytics_session";
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let sessionId = window.localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = window.crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY, sessionId);
    }

    const send = (eventType: "page_view" | "heartbeat") => {
      void fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType, pagePath: pathname, sessionId }),
        keepalive: true,
      }).catch(() => undefined);
    };

    send("page_view");
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        send("heartbeat");
      }
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(heartbeat);
  }, [pathname]);

  return null;
}

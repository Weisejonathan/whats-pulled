"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CardCatalogDetail } from "@/lib/db/catalog";
import { CardDetail, type CardQuery } from "@/app/cards/card-detail";

export function PublicCardDetail({ detail, header }: { detail: CardCatalogDetail; header: ReactNode }) {
  const [query, setQuery] = useState<CardQuery>({});
  useEffect(() => {
    // Copy selection is public UI state, not a separate server-rendered cache entry.
    const sync = () => setQuery(Object.fromEntries(new URLSearchParams(window.location.search)));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return <CardDetail detail={detail} query={query} isLoggedIn={false} user={null} header={header} />;
}

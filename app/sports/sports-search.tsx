"use client";

import { useMemo, useState } from "react";
import type { SportOverview } from "@/lib/db/catalog";

const numberFormatter = new Intl.NumberFormat("en-US");
const setShowcaseCards = [
  { player: "Coco Gauff", label: "Bon Voyage", tone: "voyage" },
  { player: "Emma Navarro", label: "Game Set Match", tone: "match" },
  { player: "Alexander Zverev", label: "Court Stamp", tone: "stamp" },
  { player: "Rafael Nadal", label: "Autograph Issue", tone: "auto" },
  { player: "Maria Sharapova", label: "Chrome Icons", tone: "icons" },
  { player: "Novak Djokovic", label: "1/1 Superfractor", tone: "novak" },
];

const quickFilters = [
  { label: "All Sports", slug: "all" },
  { label: "Tennis", slug: "tennis" },
  { label: "Basketball", slug: "basketball" },
  { label: "Soccer", slug: "soccer" },
  { label: "Baseball", slug: "baseball" },
  { label: "Formula 1", slug: "formula-1" },
];

type SportsSearchProps = {
  sports: SportOverview[];
};

type SportSetOverview = SportOverview["sets"][number];

export function SportsSearch({ sports }: SportsSearchProps) {
  const [query, setQuery] = useState("");
  const [activeSport, setActiveSport] = useState("all");
  const sportCounts = useMemo(
    () => new Map(sports.map((sport) => [sport.sportSlug, sport.setCount])),
    [sports],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSports = sports.filter((sport) => {
    const title = getSportTitle(sport);
    const matchesSport = activeSport === "all" || sport.sportSlug === activeSport;
    const matchesQuery =
      !normalizedQuery ||
      [sport.sport, sport.displayName, title, "topps chrome 2025", ...sport.sets.map((set) => set.name)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    return matchesSport && matchesQuery;
  });

  return (
    <section className="sports-showcase" aria-label="Sports">
      <div className="sports-search-panel">
        <div className="sports-search-copy">
          <p className="eyebrow">Catalog Search</p>
          <h1>Find your next chase</h1>
        </div>

        <label className="sports-search-box" htmlFor="sports-search">
          <span>Search sports, sets, players</span>
          <input
            id="sports-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Tennis, Topps Chrome, Djokovic..."
            type="search"
            value={query}
          />
        </label>

        <div className="sports-quick-filters" aria-label="Quick filters">
          {quickFilters.map((filter) => {
            const count =
              filter.slug === "all"
                ? sports.reduce((total, sport) => total + sport.setCount, 0)
                : sportCounts.get(filter.slug) ?? 0;
            const isActive = activeSport === filter.slug;

            return (
              <button
                className={isActive ? "active" : ""}
                key={filter.slug}
                onClick={() => setActiveSport(filter.slug)}
                type="button"
              >
                <span>{filter.label}</span>
                <small>{count ? `${count} set${count === 1 ? "" : "s"}` : "coming"}</small>
              </button>
            );
          })}
        </div>
      </div>

      {filteredSports.length ? (
        filteredSports.map((sport) => (
          <SportStage key={sport.sportSlug} normalizedQuery={normalizedQuery} sport={sport} />
        ))
      ) : (
        <div className="sports-empty-state">
          <h2>No sets found</h2>
          <p>Try another sport or search for Topps Chrome Tennis.</p>
        </div>
      )}
    </section>
  );
}

function SportStage({
  normalizedQuery,
  sport,
}: {
  normalizedQuery: string;
  sport: SportOverview;
}) {
  const visibleSets = normalizedQuery
    ? sport.sets.filter((set) =>
        [set.name, getSetTitle(set.name), getSetSectionLabel(set.name)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : sport.sets;

  return (
    <div className="sport-set-stack">
      {visibleSets.map((set) => (
        <SportSetStage key={set.slug} set={set} sport={sport} />
      ))}
    </div>
  );
}

function SportSetStage({ set, sport }: { set: SportSetOverview; sport: SportOverview }) {
  const activeHref = `/sets/${set.slug}`;
  const progressLabel =
    set.pullProgressPercent > 0 && set.pullProgressPercent < 0.1
      ? "<0.1%"
      : `${set.pullProgressPercent.toFixed(1)}%`;
  const visibleProgressPercent =
    set.pullProgressPercent > 0 ? Math.min(Math.max(set.pullProgressPercent, 4), 100) : 0;
  const openCardCount = set.cardCount - set.pulledCardCount;

  return (
    <article className="set-overview-stage">
      <div className="set-overview-copy">
        <p className="eyebrow">{sport.sport} set tracker</p>
        <h1>{getSetTitle(set.name)}</h1>
        <div className="set-section-pill" aria-label={set.name}>
          <span>{getSetSectionLabel(set.name)}</span>
          <small>{numberFormatter.format(set.cardCount)}</small>
        </div>
        <div className="set-overview-actions">
          <a className="button-link red-action" href={activeHref}>
            Jetzt Pulls Ansehen
          </a>
          <a className="secondary-button set-link" href={activeHref}>
            Checklist öffnen
          </a>
        </div>
      </div>

      <aside className="set-progress-card" aria-label={`${progressLabel} pulled`}>
        <div>
          <span>Pull Progress</span>
          <strong>{progressLabel}</strong>
        </div>
        <div className="smart-progress-track">
          <span style={{ width: `${visibleProgressPercent}%` }} />
          <i style={{ left: `${visibleProgressPercent}%` }} />
        </div>
        <div className="set-progress-stats">
          <span>
            <b>{numberFormatter.format(set.pulledCardCount)}</b>
            pulled
          </span>
          <span>
            <b>{numberFormatter.format(openCardCount)}</b>
            open
          </span>
          <span>
            <b>{numberFormatter.format(set.cardCount)}</b>
            tracked
          </span>
        </div>
      </aside>

      <div className="set-card-runway" aria-label="Topps Chrome Tennis card preview">
        {setShowcaseCards.map((card) => (
          <a className={`set-preview-card ${card.tone}`} href={activeHref} key={card.player}>
            {card.tone === "novak" ? (
              <img
                src="/card-images/novak-djokovic-superfractor-1-1.jpg"
                alt="Novak Djokovic Topps Chrome 2025 Superfractor"
              />
            ) : null}
            <span>{card.label}</span>
            <strong>{card.player}</strong>
          </a>
        ))}
      </div>
    </article>
  );
}

function getSportTitle(sport: SportOverview) {
  return sport.sportSlug === "tennis" ? "2025 Topps Chrome Tennis" : sport.displayName;
}

function getSetTitle(name: string) {
  return name.replace("Tennis 2025", "Tennis");
}

function getSetSectionLabel(name: string) {
  return name.includes("Sapphire") ? "2025 Topps Chrome Sapphire" : "2025 Topps Chrome";
}

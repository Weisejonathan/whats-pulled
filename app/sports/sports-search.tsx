"use client";

import { useMemo, useState } from "react";
import type { SportOverview } from "@/lib/db/catalog";

const numberFormatter = new Intl.NumberFormat("en-US");
const setCoverImages: Record<string, string> = {
  "topps-chrome-sapphire-tennis-2025":
    "https://cdn.shopify.com/s/files/1/0749/3710/6672/files/18fae3b3f11f7356a22f22b31f76b9a36c8528af_25TCTN_FGC6338_SAPPHIRE.png?v=1773830741",
  "topps-chrome-tennis-2025":
    "https://cdn.shopify.com/s/files/1/0749/3710/6672/files/0ad6b75b641ff6af446e1536f5e8aa58e19945f2_25TCTN_FGC6336_HOBBY.png?v=1770413357",
};
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
        [set.name, getSetTitleWithoutBrand(set.name), getSetSectionLabel(set.name)]
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
  const coverImage = setCoverImages[set.slug];
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
        <div className="set-title-lockup">
          <a className="set-cover-placeholder" href={activeHref} aria-label={`${set.name} Pulls ansehen`}>
            {coverImage ? <img src={coverImage} alt={set.name} /> : null}
            <span>{getSetSectionLabel(set.name)}</span>
          </a>
          <div className="set-title-content">
            <p className="set-brand-name">{getSetBrand(set.name)}</p>
            <h1>{getSetTitleWithoutBrand(set.name)}</h1>
            <a className="secondary-button set-link" href={activeHref}>
              Pulls ansehen
            </a>
          </div>
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

    </article>
  );
}

function getSportTitle(sport: SportOverview) {
  return sport.sportSlug === "tennis" ? "2025 Topps Chrome Tennis" : sport.displayName;
}

function getSetBrand(name: string) {
  return name.split(" ")[0] ?? name;
}

function getSetTitleWithoutBrand(name: string) {
  return name.replace(/^Topps\s+/, "");
}

function getSetSectionLabel(name: string) {
  return name.includes("Sapphire") ? "2025 Topps Chrome Sapphire" : "2025 Topps Chrome";
}

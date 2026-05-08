"use client";

import { useMemo, useState } from "react";
import type { CardVariantGroup } from "@/lib/db/catalog";

type SetChecklistSearchProps = {
  groups: CardVariantGroup[];
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const groupMatchesQuery = (group: CardVariantGroup, query: string) => {
  if (!query) {
    return true;
  }

  const searchText = normalizeSearch(
    [
      group.primary.player,
      group.primary.cardNumber ? `#${group.primary.cardNumber}` : "",
      group.primary.cardNumber ? String(group.primary.cardNumber) : "",
      group.primary.cardName,
      group.primary.isRookie ? "rc rookie rookie card" : "",
      group.isComplete ? "complete" : "open",
      ...group.variants.flatMap((variant) => [
        variant.serial,
        variant.parallel ?? "",
        variant.status,
      ]),
    ].join(" "),
  );

  return searchText.includes(query);
};

export function SetChecklistSearch({ groups }: SetChecklistSearchProps) {
  const [query, setQuery] = useState("");
  const [rookiesOnly, setRookiesOnly] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<"all" | "base" | "autograph">("all");
  const normalizedQuery = normalizeSearch(query.trim());

  const filteredGroups = useMemo(
    () =>
      groups.filter((group) => {
        if (rookiesOnly && !group.primary.isRookie) {
          return false;
        }

        const isAutograph = group.primary.cardName.toLowerCase().includes("autograph");

        if (sectionFilter === "base" && isAutograph) {
          return false;
        }

        if (sectionFilter === "autograph" && !isAutograph) {
          return false;
        }

        return groupMatchesQuery(group, normalizedQuery);
      }),
    [groups, normalizedQuery, rookiesOnly, sectionFilter],
  );

  const rookieCount = groups.filter((group) => group.primary.isRookie).length;
  const baseCount = groups.filter(
    (group) => !group.primary.cardName.toLowerCase().includes("autograph"),
  ).length;
  const autographCount = groups.length - baseCount;

  return (
    <>
      <div className="checklist-toolbar">
        <label className="checklist-search" htmlFor="set-card-search">
          <span>Search checklist</span>
          <input
            id="set-card-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Player, #, parallel, RC, status..."
            type="search"
            value={query}
          />
        </label>
        <button
          className={`filter-chip ${rookiesOnly ? "active" : ""}`}
          onClick={() => setRookiesOnly((current) => !current)}
          type="button"
        >
          RC only
        </button>
        <p className="result-count">
          {filteredGroups.length} / {groups.length} cards
          {rookiesOnly ? ` · ${rookieCount} RC` : ""}
        </p>
      </div>

      {autographCount ? (
        <div className="checklist-segmented" aria-label="Checklist sections">
          {[
            { label: "All", value: "all", count: groups.length },
            { label: "Base", value: "base", count: baseCount },
            { label: "Autographs", value: "autograph", count: autographCount },
          ].map((item) => (
            <button
              className={sectionFilter === item.value ? "active" : ""}
              key={item.value}
              onClick={() => setSectionFilter(item.value as typeof sectionFilter)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </div>
      ) : null}

      <div className="catalog-card-list" aria-live="polite">
        {filteredGroups.length ? (
          filteredGroups.map((group) => (
            <div
              className={`catalog-card-row grouped-card-row ${
                group.isComplete ? "complete" : "open"
              }`}
              key={group.key}
            >
              <div className="catalog-card-media">
                {group.primary.imageUrl ? (
                  <img
                    src={group.primary.imageUrl}
                    alt={`${group.primary.player} ${group.primary.serial}`}
                  />
                ) : (
                  <div className={`mini-card ${group.isComplete ? "claimed" : "pulled"}`}>
                    <span>#{group.primary.cardNumber ?? "-"}</span>
                  </div>
                )}
              </div>
              <div className="card-info">
                <div className="card-title-row">
                  <h3>{group.primary.player}</h3>
                  {group.primary.isRookie ? <span className="rc-badge">RC</span> : null}
                </div>
                <p>
                  {[
                    group.primary.cardNumber ? `#${group.primary.cardNumber}` : null,
                    group.primary.cardName,
                    `${group.completeVariants}/${group.variants.length} variants complete`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {group.primary.sourceUrl ? (
                  <a
                    className="source-link"
                    href={group.primary.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    SportsCardsPro
                  </a>
                ) : null}
                <div className="variant-button-row">
                  {group.variants.map((variant) => {
                    const isVariantComplete =
                      variant.printRun && variant.pulledCount >= variant.printRun;

                    return (
                      <a
                        className={`variant-button ${isVariantComplete ? "complete" : "open"}`}
                        href={`/cards/${variant.slug}`}
                        key={variant.id}
                      >
                        <span>{variant.serial}</span>
                        <small>{variant.parallel ?? "Base"}</small>
                      </a>
                    );
                  })}
                </div>
              </div>
              <span className={`status-pill ${group.isComplete ? "claimed" : "pulled"}`}>
                {group.isComplete ? "Complete" : "Open"}
              </span>
              <div className="value-cell">
                <span>
                  {group.pulledCopies} / {group.totalCopies} pulled
                </span>
                <strong>
                  {group.completeVariants} of {group.variants.length} variants
                </strong>
              </div>
              <a className="row-action" href={`/cards/${group.primary.slug}`}>
                Open
              </a>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <h3>No cards found</h3>
            <p>Try a player name, card number, parallel, status, or RC.</p>
          </div>
        )}
      </div>
    </>
  );
}

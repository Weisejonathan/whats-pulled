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
  const normalizedQuery = normalizeSearch(query.trim());

  const filteredGroups = useMemo(
    () =>
      groups.filter((group) => {
        if (rookiesOnly && !group.primary.isRookie) {
          return false;
        }

        return groupMatchesQuery(group, normalizedQuery);
      }),
    [groups, normalizedQuery, rookiesOnly],
  );

  const rookieCount = groups.filter((group) => group.primary.isRookie).length;

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

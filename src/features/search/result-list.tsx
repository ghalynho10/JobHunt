import type { ReactNode } from "react";

import type { Listing } from "./adzuna";
import { ResultCard } from "./result-card";

/**
 * One row of the result list: a listing, and whatever is being shown about it.
 *
 * `score` IS A NODE, NOT A SCORE. This module knows nothing about bands,
 * outcomes, or feature 14 at all: it places whatever the page hands it. That is
 * what keeps the dependency running one way, `/search` composing two features
 * rather than either importing the other, the same direction
 * `src/features/applications/AGENTS.md` already fixed for the apply control.
 */
export type ResultRow = {
  readonly listing: Listing;
  /** Absent on a card that is not scored at all. */
  readonly score?: ReactNode;
  /** Whether this card's score has not resolved yet (spec 0015, AC-16). */
  readonly busy?: boolean;
};

/**
 * The result list, in whatever order it is handed (spec 0013, AC-6; spec 0015,
 * AC-9, AC-16).
 *
 * IT DECIDES NO ORDER OF ITS OWN. The caller hands rows already in the order
 * they should render, so the unscored list, the pending list and the ranked
 * list are one component rendering three orders rather than three components
 * that could drift apart in every other respect.
 *
 * THE KEY IS THE LISTING, NOT THE POSITION. `source:sourceJobId` survives the
 * one time re-sort in AC-9; an array index would let React reuse a card's DOM
 * for a different job the moment the order changed.
 */
export function ResultList({
  rows,
  now,
  appliedIds,
}: {
  readonly rows: readonly ResultRow[];
  /**
   * ONE `now` FOR THE WHOLE LIST, so twenty cards cannot disagree about what
   * "today" is mid render.
   */
  readonly now: Date;
  /** Absent when the read behind the applied markers failed (spec 0014). */
  readonly appliedIds: ReadonlySet<string> | undefined;
}) {
  return (
    <ul className="space-y-4">
      {rows.map(({ listing, score, busy }) => (
        <li
          key={`${listing.source}:${listing.sourceJobId}`}
          /**
           * AC-16: a card whose outcome has not resolved says so to assistive
           * technology, not only to the eye. It sits on the list item rather
           * than inside the card, because it describes the whole card as
           * incomplete rather than one line within it.
           *
           * Spread conditionally so an unscored card carries no `aria-busy` at
           * all. `aria-busy="false"` on every card would be a claim about
           * loading state on a page where nothing is loading.
           */
          {...(busy === true ? { "aria-busy": true } : {})}
        >
          <ResultCard
            listing={listing}
            now={now}
            alreadyApplied={appliedIds?.has(listing.sourceJobId) ?? false}
            score={score}
          />
        </li>
      ))}
    </ul>
  );
}

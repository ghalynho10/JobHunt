import type { ReactNode } from "react";

import type { Listing } from "./adzuna";
import { SEARCH_COPY } from "./copy";
import { RESULTS_LIST_ATTRIBUTE } from "./focus-key";
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
    <ul
      className="space-y-4"
      /**
       * Spec 0015, AC-17: the fallback focus target. When the reveal orphans a
       * reader and the control they were on cannot be found in the ranked list,
       * focus lands here rather than on the document body. `-1` keeps it out of
       * the tab order, so it is reachable by script and by nobody's Tab key.
       *
       * NAMED, BECAUSE AN UNNAMED LIST ANNOUNCES AS NOTHING. A screen reader
       * landing here would otherwise say only "list", which tells a reader who
       * just lost their place nothing about where they now are.
       */
      tabIndex={-1}
      aria-label={SEARCH_COPY.resultsListLabel}
      /**
       * SPREAD SO THE ATTRIBUTE NAME HAS ONE DEFINITION. `focus-keeper.tsx`
       * queries for this exact string, and the failure mode of a typo is
       * silence: the restorer would find nothing and leave the reader on the
       * body, which is the very case this attribute exists to catch.
       */
      {...{ [RESULTS_LIST_ATTRIBUTE]: true }}
    >
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

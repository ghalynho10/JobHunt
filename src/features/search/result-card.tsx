import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

import {
  AdzunaAttribution,
  JobsworthAttribution,
} from "@/components/adzuna-attribution";
import { ApplyControl } from "@/features/applications/apply-control";
import { recordApplication } from "@/features/applications/actions";
import { relativePostedAt, salaryText } from "@/lib/listing-format";

import type { Listing } from "./adzuna";

/**
 * One search result (spec 0013, AC-6, AC-7, AC-8).
 *
 * EVERY OPTIONAL FIELD IS OMITTED WHEN ABSENT, NEVER RENDERED AS A DASH OR A
 * PLACEHOLDER (invariant 7). A dash beside "Salary" reads as real information
 * about the salary; an omitted row reads as what it is, which is that Adzuna
 * did not say.
 */

export function ResultCard({
  listing,
  now,
  alreadyApplied = false,
}: {
  readonly listing: Listing;
  /**
   * PASSED IN RATHER THAN READ HERE, so the relative date has one source per
   * render and a test can state what "now" is instead of racing the clock.
   */
  readonly now: Date;
  /** Whether the caller already recorded this job (spec 0014, AC-9). */
  readonly alreadyApplied?: boolean;
}) {
  const posted = relativePostedAt(listing.postedAt, now);
  const salary = salaryText(listing);

  /**
   * THE APPLY ACTION, DEFINED INLINE SO IT CLOSES OVER THIS CARD'S LISTING
   * (spec 0014, `## Decision`).
   *
   * IT HAS TO BE INLINE, and that is a mechanical requirement rather than a
   * preference. Next encrypts the variables an action defined inside a
   * component closes over, with a private key regenerated every build, so the
   * browser can neither read the listing nor forge one
   * (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:505-526`,
   * the `publishVersion` example). A module level `'use server'` export has
   * nothing to close over; the alternative there is `.bind()`, documented
   * separately at `forms.md:74-88` with no encryption claim attached to it
   * anywhere in the installed docs. Moving this into `actions.ts` would
   * silently turn the security model's central sentence into a false one.
   *
   * IT DELEGATES RATHER THAN IMPLEMENTS, so the span, the caller check, the
   * read only cookie adapter and the insert all live in one place in the
   * applications feature, and this stays the thin capture it needs to be.
   */
  async function apply() {
    "use server";

    return recordApplication(listing);
  }

  return (
    <Card tone="flat" as="article">
      <Card.Header>
        <Heading level={3}>{listing.title}</Heading>
        <Text variant="monoLabel" as="span">
          {listing.location === undefined
            ? listing.companyName
            : `${listing.companyName} · ${listing.location}`}
        </Text>
      </Card.Header>

      <Card.Body>
        {salary === undefined ? undefined : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text variant="monoLabel" as="span">
              {/*
               * AC-7: a predicted figure is NEVER shown indistinguishably
               * from a stated one (invariant 5). The label sits with the
               * figure, not in a legend elsewhere on the page.
               */}
              {listing.salaryIsPredicted ? `${salary} (estimated)` : salary}
            </Text>
            {listing.salaryIsPredicted ? <JobsworthAttribution /> : undefined}
          </div>
        )}

        {listing.descriptionSnippet === undefined ? undefined : (
          <Text
            variant="monoData"
            className={salary === undefined ? "" : "mt-3"}
          >
            {listing.descriptionSnippet}
          </Text>
        )}

        {posted === undefined ? undefined : (
          <Text variant="monoLabel" as="span" className="mt-3 block">
            {posted}
          </Text>
        )}
      </Card.Body>

      <Card.Footer attribution={<AdzunaAttribution />}>
        {/*
         * The visible label is the same on every card, so the accessible name
         * says which posting this one is: twenty links all named "View the
         * posting" are indistinguishable in a screen reader's link list.
         */}
        <Button
          variant="tertiary"
          href={listing.url}
          external
          label={`View the posting for ${listing.title} at ${listing.companyName}`}
        >
          View the posting
        </Button>

        {/*
         * AC-1: a SEPARATE control. Opening the posting above records nothing,
         * because looking at a job is not applying to it, and one control
         * meaning both would fill the record with jobs nobody applied to and
         * then block the real apply through the unique constraint.
         */}
        <ApplyControl
          action={apply}
          title={listing.title}
          companyName={listing.companyName}
          alreadyApplied={alreadyApplied}
        />
      </Card.Footer>
    </Card>
  );
}

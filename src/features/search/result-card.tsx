import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

import type { Listing } from "./adzuna";
import { AdzunaAttribution, JobsworthAttribution } from "./adzuna-attribution";

/**
 * One search result (spec 0013, AC-6, AC-7, AC-8).
 *
 * EVERY OPTIONAL FIELD IS OMITTED WHEN ABSENT, NEVER RENDERED AS A DASH OR A
 * PLACEHOLDER (invariant 7). A dash beside "Salary" reads as real information
 * about the salary; an omitted row reads as what it is, which is that Adzuna
 * did not say.
 */

/**
 * The posted date, computed at render from the raw timestamp and never stored
 * formatted (`AGENTS.md`'s store raw, format at render rule).
 *
 * Returns `undefined` rather than a placeholder when the timestamp is absent
 * or unparseable, so the row disappears instead of claiming a date this app
 * does not have.
 */
export function relativePostedAt(
  postedAt: string | undefined,
  now: Date,
): string | undefined {
  if (postedAt === undefined) return undefined;

  const posted = new Date(postedAt);

  if (Number.isNaN(posted.getTime())) return undefined;

  const elapsedMs = posted.getTime() - now.getTime();
  const elapsedDays = Math.round(elapsedMs / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  /**
   * Days, and hours only inside the first day. Adzuna's `created` is a
   * posting date, so a finer unit would be precision this app cannot stand
   * behind, and a coarser one would collapse "today" and "last week".
   */
  if (Math.abs(elapsedDays) >= 1) {
    return `posted ${formatter.format(elapsedDays, "day")}`;
  }

  const elapsedHours = Math.round(elapsedMs / 3_600_000);
  return `posted ${formatter.format(elapsedHours, "hour")}`;
}

/**
 * The salary line, or `undefined` when Adzuna stated no figure at all.
 *
 * Both figures are formatted here, at render, against the currency the
 * configured country fixes (invariant 3): the currency never comes from
 * Adzuna, whose response carries no currency field.
 */
function salaryText(listing: Listing): string | undefined {
  if (listing.salaryCurrency === undefined) return undefined;

  const format = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: listing.salaryCurrency,
      maximumFractionDigits: 0,
    }).format(amount);

  if (listing.salaryMin !== undefined && listing.salaryMax !== undefined) {
    return `${format(listing.salaryMin)} to ${format(listing.salaryMax)}`;
  }

  if (listing.salaryMin !== undefined)
    return `from ${format(listing.salaryMin)}`;
  if (listing.salaryMax !== undefined)
    return `up to ${format(listing.salaryMax)}`;

  return undefined;
}

export function ResultCard({
  listing,
  now,
}: {
  readonly listing: Listing;
  /**
   * PASSED IN RATHER THAN READ HERE, so the relative date has one source per
   * render and a test can state what "now" is instead of racing the clock.
   */
  readonly now: Date;
}) {
  const posted = relativePostedAt(listing.postedAt, now);
  const salary = salaryText(listing);

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
      </Card.Footer>
    </Card>
  );
}

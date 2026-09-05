import {
  AdzunaAttribution,
  JobsworthAttribution,
} from "@/components/adzuna-attribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import {
  appliedOnText,
  relativePostedAt,
  salaryText,
} from "@/lib/listing-format";

import { CONTROLS, viewPostingLabel } from "./copy";
import type { ApplicationRow } from "./queries";

/**
 * One recorded application (spec 0014, AC-7, AC-8, AC-11, AC-18).
 *
 * IT CARRIES ITS OWN ATTRIBUTION, and that is a licence obligation rather than
 * a design choice. Adzuna's terms attach the "Jobs by Adzuna" attribution to
 * every DISPLAYED ADVERT, never once per screen (spec 0013, invariant 4,
 * verified against Adzuna's own terms at feature 11). A recorded application
 * displays a title, a company, a salary and a link to the posting, so the
 * obligation follows the data here exactly as it applies on `/search`.
 *
 * THE SAME OMISSION RULE AS THE RESULT CARD (spec 0013, invariant 7). Every
 * optional field disappears when absent rather than rendering as a dash: a dash
 * beside a salary reads as information about the pay, an omitted row reads as
 * what it is.
 *
 * IT SHARES ITS FORMATTERS WITH `/search` rather than copying them
 * (`src/lib/listing-format.ts`). Two implementations of "how a predicted salary
 * is shown" is exactly how the two screens would drift apart, and the rule they
 * would drift on is the one spec 0013 AC-7 exists to protect.
 */
export function ApplicationCard({
  application,
  now,
}: {
  readonly application: ApplicationRow;
  /** Injected, so the relative posted date has one source per render. */
  readonly now: Date;
}) {
  const salary = salaryText(application);
  const posted = relativePostedAt(application.postedAt, now);
  const applied = appliedOnText(application.appliedAt);

  return (
    <Card tone="flat" as="article">
      <Card.Header>
        <Heading level={3}>{application.title}</Heading>
        <Text variant="monoLabel" as="span">
          {application.location === undefined
            ? application.companyName
            : `${application.companyName} · ${application.location}`}
        </Text>
      </Card.Header>

      <Card.Body>
        {salary === undefined ? undefined : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text variant="monoLabel" as="span">
              {/*
               * AC-7, AND THIS IS WHY THE COLUMN EXISTS. Without
               * `salary_is_predicted` on the row, a figure Adzuna only guessed
               * at would render here indistinguishably from one an employer
               * stated. The label sits with the figure, never in a legend.
               *
               * `=== true` rather than a truthiness check, deliberately: the
               * value has three states and `undefined` means the source quoted
               * no pay at all, which is not the same as "not predicted".
               */}
              {application.salaryIsPredicted === true
                ? `${salary} (estimated)`
                : salary}
            </Text>
            {application.salaryIsPredicted === true ? (
              <JobsworthAttribution />
            ) : undefined}
          </div>
        )}

        {application.descriptionSnippet === undefined ? undefined : (
          <Text
            variant="monoData"
            className={salary === undefined ? "" : "mt-3"}
          >
            {application.descriptionSnippet}
          </Text>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {/*
           * The applied date is absolute and the posted date is relative
           * (AC-18). An archive read months later needs a date; a posting's
           * whole meaning is freshness.
           */}
          {applied === undefined ? undefined : (
            <Text variant="monoLabel" as="span">
              {applied}
            </Text>
          )}
          {posted === undefined ? undefined : (
            <Text variant="monoLabel" as="span">
              {posted}
            </Text>
          )}
        </div>
      </Card.Body>

      <Card.Footer attribution={<AdzunaAttribution />}>
        <Button
          variant="tertiary"
          href={application.url}
          external
          /**
           * The visible label is the same on every row, so the accessible name
           * says which posting this one is. Ten links all named "View the
           * posting" are indistinguishable in a screen reader's link list.
           */
          label={viewPostingLabel(application.title, application.companyName)}
        >
          {CONTROLS.viewPosting}
        </Button>

        {/*
         * AC-11: the confirmation is a LINK to a URL that mutates nothing, not
         * a submit. Reaching `?remove=<id>` only renders the question, which is
         * what keeps the link safe to prefetch or bookmark. The removal happens
         * on that page's own form and nowhere else. Same shape as spec 0010
         * AC-8's delete flow on `/profile`.
         */}
        <Button
          variant="tertiary"
          href={`/applications?remove=${application.id}`}
          label={`${CONTROLS.remove} your application to ${application.title} at ${application.companyName}`}
        >
          {CONTROLS.remove}
        </Button>
      </Card.Footer>
    </Card>
  );
}

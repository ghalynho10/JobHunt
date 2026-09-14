import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { BandBadge } from "@/features/scoring/band-badge";
import { SCORING_COPY } from "@/features/scoring/copy";
import { salaryText } from "@/lib/listing-format";

import { DEMO_COPY } from "./copy";
import { DEMO_SALARY_CURRENCY, type DemoResult } from "./queries";

/**
 * One seeded result on `/demo` (spec 0021, AC-8, AC-9).
 *
 * A SEPARATE COMPONENT FROM `ResultCard`, NOT A VARIANT OF IT, and the split is
 * deliberate. `ResultCard` takes a `Listing`, defines an inline Server Action
 * that closes over it, renders `ApplyControl`, a real posting link, a relative
 * posted date and the Adzuna attribution. Every one of those is something this
 * page must NOT have. Adding four "not on the demo" flags to the real card
 * would put this feature's constraints inside the one component the real
 * product's correctness runs through, where the cost of getting one wrong is
 * paid by a real reader looking at a real job.
 *
 * WHAT IT DOES SHARE IS EVERYTHING THAT CARRIES MEANING: `BandBadge`, the two
 * `SCORING_COPY` headings and the caption, `salaryText()`, `Card` and `Chip`.
 * A demo that reimplemented those would be a demo of something the product does
 * not do, which is worse than no demo.
 *
 * FOUR THINGS THE REAL CARD HAS ARE ABSENT ON PURPOSE, not by omission:
 *
 * - No Adzuna attribution and no Jobsworth salary attribution (AC-9). Nothing
 *   here came from either vendor, and displaying their marks beside invented
 *   listings would attribute fabricated data to two real companies.
 * - No "view the posting" link. There is no posting to view. A link to nowhere
 *   is the untruth this whole feature exists to avoid.
 * - No relative posted date and no sponsorship chip. The demo has no meaningful
 *   posted time and no sponsorship claim to make, so it makes neither.
 * - No apply control, and specifically NEVER A DISABLED BUTTON (AC-8). A plain
 *   sentence says what the real page does instead.
 */
export function DemoCard({ result }: { readonly result: DemoResult }) {
  /**
   * The shared formatter, reused rather than reimplemented, so the equal min
   * and max single figure case and the one sided `from` and `up to` cases stay
   * correct here without this feature knowing they exist.
   *
   * The currency is a constant rather than a column, since every seeded row
   * carries the same one. `salaryText()` returns `undefined` when it is handed
   * no figures at all, so a row with no pay renders no salary line rather than
   * a placeholder that reads as information.
   */
  const salary = salaryText({
    salaryMin: result.salaryMin,
    salaryMax: result.salaryMax,
    salaryCurrency: DEMO_SALARY_CURRENCY,
  });

  return (
    <Card tone="flat" as="article">
      <Card.Header>
        <Heading level={3}>{result.title}</Heading>
        <Text variant="monoLabel" as="span">
          {result.location === undefined
            ? result.companyName
            : `${result.companyName} · ${result.location}`}
        </Text>
      </Card.Header>

      <Card.Body>
        {/*
         * NO `(estimated)` LABEL AND NO ATTRIBUTION BESIDE IT, unlike the real
         * card. Spec 0013's AC-7 exists because Adzuna predicts some figures
         * and a predicted one must never read like a stated one; here nothing
         * predicted anything, so every seeded figure is a plain stated one and
         * labelling it otherwise would be the false claim in reverse.
         */}
        {salary === undefined ? undefined : (
          <Text variant="monoLabel" as="span" className="block">
            {salary}
          </Text>
        )}

        {result.descriptionSnippet === undefined ? undefined : (
          <Text
            variant="monoData"
            className={salary === undefined ? "" : "mt-3"}
          >
            {result.descriptionSnippet}
          </Text>
        )}

        {/*
         * The judgment sits BELOW the posting's own facts, the same order the
         * real card uses and for the same reason: the reader is deciding about
         * a job, and the title, pay and description are what the judgment is
         * about. Putting the verdict first asks them to read the conclusion
         * before the evidence.
         */}
        <div className="mt-5">
          <BandBadge band={result.band} />

          {result.matchedSkills.length === 0 ? undefined : (
            <div className="mt-4">
              <Text variant="eyebrow" className="text-secondary">
                {SCORING_COPY.matchedHeading}
              </Text>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.matchedSkills.map((skill) => (
                  <Chip key={skill} state="matched">
                    {skill}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {result.notMentionedSkills.length === 0 ? undefined : (
            <div className="mt-4">
              {/*
               * BOTH STRINGS COME FROM `SCORING_COPY` VERBATIM, and the
               * caption is why the seed data is written the way it is. It
               * reads "This posting only shows part of the description, so
               * this is not a confirmed gap." On `/search` that is true
               * because Adzuna returns an excerpt of a longer real posting.
               * Here it is true only because every seeded
               * `description_snippet` was deliberately written as a cut off
               * excerpt (see the seed migration). Reword either the caption or
               * the seed data and this page starts saying something false.
               */}
              <Text variant="eyebrow" className="text-secondary">
                {SCORING_COPY.notMentionedHeading}
              </Text>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.notMentionedSkills.map((skill) => (
                  <Chip key={skill} state="missing">
                    {skill}
                  </Chip>
                ))}
              </div>
              <Text variant="muted" className="mt-2">
                {SCORING_COPY.notMentionedCaption}
              </Text>
            </div>
          )}

          {/*
           * The written reasoning, in the register spec 0005 reserves for it,
           * with the same teal comment marker the real score card and the
           * entry page's example card both use.
           */}
          <Text variant="monoData" className="mt-4">
            <span className="text-primary-600">{"//"}</span> {result.reasoning}
          </Text>
        </div>
      </Card.Body>

      {/*
       * AC-8, and AC-9 by omission: the footer takes no `attribution` node, so
       * neither vendor's mark can appear on a fabricated listing.
       */}
      <Card.Footer>
        <Text as="span" variant="muted">
          {DEMO_COPY.applyUnavailable}
        </Text>
      </Card.Footer>
    </Card>
  );
}

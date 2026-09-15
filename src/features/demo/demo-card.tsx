import {
  AdzunaAttribution,
  JobsworthAttribution,
} from "@/components/adzuna-attribution";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { BandBadge } from "@/features/scoring/band-badge";
import { SCORING_COPY } from "@/features/scoring/copy";
import { salaryText } from "@/lib/listing-format";

import { DEMO_COPY } from "./copy";
import type { DemoScoredListing } from "./queries";

/**
 * One real listing on `/demo`, scored for one example candidate (spec 0021,
 * AC-8, AC-9, AC-16, AC-19).
 *
 * WHAT THIS CARD SHOWS IS REAL, WHICH IS THE REVERSE OF WHAT IT USED TO SHOW.
 * Before 2026-09-14 every value here was written by hand, and this comment said
 * so. The title, company, location, salary, description and every part of the
 * judgment now come from a real Adzuna search and a real scoring call. The
 * candidate being scored is the only invented thing, and the page discloses it
 * in full.
 *
 * A REAL EMPLOYER'S NAME RENDERS UNCHANGED WHATEVER BAND IT GOT (AC-19).
 * Nothing here is hidden, blurred or softened because a score came back
 * `weak_match` or `not_a_match`. Suppressing the low bands would turn the page
 * back into a curated set, which is the exact thing this rework exists to stop.
 *
 * A SEPARATE COMPONENT FROM `ResultCard`, NOT A VARIANT OF IT, and the split is
 * still deliberate. `ResultCard` defines an inline Server Action that closes
 * over its listing, renders `ApplyControl`, a real posting link and a relative
 * posted date. Those are the pieces this page must not have. Adding "not on the
 * demo" flags to the real card would put this feature's constraints inside the
 * one component a real reader's real job application runs through.
 *
 * WHAT IT SHARES IS EVERYTHING THAT CARRIES MEANING: `BandBadge`, the
 * `SCORING_COPY` headings, captions and both grounding sentences,
 * `salaryText()`, both vendor attributions, `Card` and `Chip`. A demo that
 * reimplemented those would be a demo of something the product does not do.
 *
 * THREE THINGS THE REAL CARD HAS ARE STILL ABSENT ON PURPOSE:
 *
 * - No "view the posting" link. The stored row carries no URL, deliberately:
 *   this page is a demonstration, not a job board, and a link would make it one
 *   without any of the apply tracking that makes the real one useful.
 * - No relative posted date and no sponsorship chip. The posted date would age
 *   between refreshes into a claim nobody rechecked, and sponsorship is not
 *   stored.
 * - No apply control, and specifically NEVER A DISABLED BUTTON (AC-8). A plain
 *   sentence says what the real page does instead.
 */
export function DemoCard({ listing }: { readonly listing: DemoScoredListing }) {
  const result = listing.own;

  /**
   * The shared formatter, reused rather than reimplemented, so the equal min
   * and max single figure case and the one sided `from` and `up to` cases stay
   * correct here without this feature knowing they exist.
   *
   * THE CURRENCY IS A STORED COLUMN NOW, not a constant. It used to be safe to
   * assume one value because every row was hand written in it; a real Adzuna
   * response carries whatever the configured country resolved to, and
   * `salaryText()` returns `undefined` without it, so assuming would have
   * silently dropped the salary line rather than showing a wrong currency.
   */
  const salary = salaryText({
    salaryMin: result.salaryMin,
    salaryMax: result.salaryMax,
    salaryCurrency: result.salaryCurrency,
  });

  /**
   * DERIVED AT RENDER, NEVER ASSUMED, the same way `buildListingBlock()`
   * derives it. `SCORING_COPY.notMentionedCaption` says "This posting only
   * shows part of the description", which used to be true by construction
   * because every seeded snippet was written as a cut off excerpt. Adzuna
   * returns whole descriptions for short postings, so on those rows that
   * sentence would now be false, and the caption is withheld rather than
   * reworded: the heading above it is `/search`'s own and must not drift.
   */
  const snippetTruncated =
    result.descriptionSnippet !== undefined &&
    result.descriptionSnippet.trimEnd().endsWith("…");

  /**
   * The names the grounding check flagged are already out of `matchedSkills`
   * by the time a row is stored (`refresh.ts`), so nothing is filtered here.
   * This card renders the consequence of that check, not the check itself.
   */
  const { ungroundedSkills } = result;

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
        {salary === undefined ? undefined : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text variant="monoLabel" as="span">
              {/*
               * AC-9, AND THE LABEL AND THE ATTRIBUTION MUST NEVER COME APART
               * (`salaryText()`'s own doc comment). Some of these figures are
               * Adzuna's Jobsworth estimates rather than figures an employer
               * stated, and spec 0013 AC-7 exists because a predicted figure
               * must never read like a stated one. That distinction could not
               * arise while every row was hand written; it arises on every
               * refresh now.
               */}
              {result.salaryIsPredicted ? `${salary} (estimated)` : salary}
            </Text>
            {result.salaryIsPredicted ? <JobsworthAttribution /> : undefined}
          </div>
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

          {/*
           * AC-16. THE OTHER CANDIDATE'S BAND FOR THIS SAME POSTING, so a
           * reader sees both judgments without switching profiles and going
           * looking for the same card again. It is a compact line and not a
           * second badge: the active candidate's result is what this card is
           * about, and two badges of equal weight would read as one listing
           * with two bands rather than one listing judged twice.
           *
           * ALWAYS PRESENT, NEVER DEFENSIVELY HIDDEN. Both personas' rows for
           * every kept listing are written by one transaction (AC-17), and the
           * read path fails loudly if a sibling is missing, so there is no
           * absent case for this line to render around.
           */}
          <Text variant="muted" className="mt-2 block">
            {DEMO_COPY.otherPersonaBand(
              listing.otherPersonaLabel,
              SCORING_COPY.bands[listing.otherBand],
            )}
          </Text>

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

          {/*
           * `COPY-9`, the same sentence the real card shows, reused verbatim.
           * It sits directly under the matched list because it is about that
           * list, and it renders EVEN WHEN THE LIST IS NOW EMPTY, which is the
           * case that matters most: a card whose every claimed skill was
           * flagged shows no chips at all, and this sentence is then the only
           * thing on screen saying why.
           *
           * THERE IS NO "could not check" STATE ON THIS PAGE, unlike the real
           * card, and that is not an omission. A check that failed or was
           * refused aborts the whole refresh (AC-17), so no row here can ever
           * represent an unfinished check. An empty `ungroundedSkills` means
           * checked and clean, every time.
           */}
          {ungroundedSkills.length === 0 ? undefined : (
            <Text variant="muted" className="mt-3 block">
              {SCORING_COPY.removedSkills(ungroundedSkills)}
            </Text>
          )}

          {result.notMentionedSkills.length === 0 ? undefined : (
            <div className="mt-4">
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
              {/*
               * THE CAPTION IS CONDITIONAL NOW, on whether this posting's
               * stored snippet is actually a cut off excerpt. It claims "This
               * posting only shows part of the description", and on a short
               * posting Adzuna returned in full that claim is simply untrue.
               * The heading above it stays unconditional, because "not
               * mentioned in this posting" is true either way.
               */}
              {snippetTruncated ? (
                <Text variant="muted" className="mt-2">
                  {SCORING_COPY.notMentionedCaption}
                </Text>
              ) : undefined}
            </div>
          )}

          {/*
           * `COPY-11`, AC-13 of spec 0019, reused here for the same reason it
           * exists there. A SEPARATE ELEMENT ABOVE THE REASONING, NEVER
           * SPLICED INTO IT: the reasoning is the model's own words, rendered
           * byte for byte as it was scored, and editing it to remove a mention
           * of a flagged skill would put words in the model's mouth.
           */}
          {ungroundedSkills.length === 0 ? undefined : (
            <Text variant="muted" className="mt-4 block">
              {SCORING_COPY.reasoningCaveat}
            </Text>
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
       * AC-9. THE ADZUNA ATTRIBUTION IS NOW REQUIRED RATHER THAN FORBIDDEN, and
       * that reversal is the whole difference between this page and the one it
       * replaced. The listing genuinely came from Adzuna, whose terms name the
       * attribution as an obligation on any published listing, so the mark is
       * load bearing here rather than decorative. It used to be absent
       * precisely because attributing invented listings to a real company would
       * have been a false claim about them.
       */}
      <Card.Footer attribution={<AdzunaAttribution />}>
        <Text as="span" variant="muted">
          {DEMO_COPY.applyUnavailable}
        </Text>
      </Card.Footer>
    </Card>
  );
}

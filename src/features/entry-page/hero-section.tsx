import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

import { ScoreBadge } from "./score-badge";
import { SignInControls } from "./sign-in-controls";

/**
 * The hero (spec 0006, AC-2, AC-5, AC-9, AC-17).
 *
 * `generous` on `paper`, the first of the two peaks the rhythm scale marks, and
 * one of the only two sections that opens with an eyebrow.
 *
 * THE RESULT CARD IS ILLUSTRATION, NOT DATA. Every value in it is fixed copy in
 * this file: no fixture, no fetch, no table. The page reads nothing, so there is
 * no source these could come from, and a card that looks like a live result
 * without being one is the untruth AC-9 exists to prevent. It is labelled twice
 * over, as a `Text` eyebrow the eye sees and as the `aria-label` on the figure
 * a screen reader hears.
 */

const MATCHED_SKILLS = [
  "Go",
  "PostgreSQL",
  "gRPC",
  "Kubernetes",
  "Terraform",
  "TypeScript",
  "REST APIs",
  "CI/CD",
] as const;

/**
 * Each missing skill carries its own note, rather than the notes living in a
 * second array keyed by position. Removing a skill from this list removes its
 * note with it; a parallel array leaves the note behind, which is the same
 * class of defect as a match bar disagreeing with the number beside it.
 */
const MISSING_SKILLS = [
  { name: "Airflow", note: "nice to have, not core to this backend role." },
  { name: "Kafka", note: "nice to have, named once in the posting." },
  {
    name: "AWS",
    note: "overlaps with your Terraform work, so the gap is small.",
  },
] as const;

/**
 * Kept beside the skill lists on purpose: the counts have to agree, and the
 * `MatchBar` derives its own cells from them, so eight matched and three
 * missing is one fact stated once rather than a picture drawn to match a number.
 */
const MATCHED_COUNT = MATCHED_SKILLS.length;
const TOTAL_COUNT = MATCHED_COUNT + MISSING_SKILLS.length;

/** `COPY-2` (spec 0006), the example label. Used verbatim in both places. */
const EXAMPLE_LABEL = "Example result";

const HERO_SUBHEAD =
  "JobHunt ranks openings for your profile, then shows exactly which skills matched and which are missing. You see the reasoning behind every result, not just a number.";

/**
 * The counts are interpolated, not written into the sentence. The composition
 * review's finding on this card was a picture disagreeing with the number
 * beside it; a hand written "8 of 11" here would be the same defect one line
 * further down, and it would survive an edit to the skill lists above.
 */
const SUMMARY_LINE = `${MATCHED_COUNT} of ${TOTAL_COUNT} skills matched. Strong fit on the core backend stack; the data-infra gap is the one to name in your application.`;

/**
 * The example result, composed from the card's three slots.
 *
 * A PLAIN `<figure>` WRAPS THE CARD rather than `Card` rendering as one.
 * `Card`'s `as` union is `div`, `article`, `section` or `li`, and spec 0006 says
 * not to widen it for this single caller. The wrapper carries no rounded or
 * bordered styling of its own, only the label, so it is not a hand composed
 * container and trips neither AC-1 nor the `no-restricted-syntax` rule.
 *
 * THE `<figcaption>` IS THE ROLE, NOT THE EXAMPLE LABEL. HTML allows one
 * caption per figure and the role is the genuine one (AC-9). The heading inside
 * it is `h3`: the size the scale gives this, and subordinate to the page's `h1`
 * as illustrative content should be.
 *
 * The prototype drew five hairlines inside this card at one weight. They are
 * gone: `Card.Header`, `Card.Body` and `Card.Footer` carry the same structure
 * with the card's single border (spec 0006, the hero card internals call).
 */
function ExampleResultCard() {
  return (
    <figure aria-label={EXAMPLE_LABEL}>
      <Card tone="elevated">
        <Card.Header>
          <Text variant="eyebrow">{EXAMPLE_LABEL}</Text>

          <div className="flex items-baseline justify-between gap-4">
            <Text as="span" variant="monoLabel">
              Northwind Labs
            </Text>
            <Text as="span" variant="monoLabel">
              4d ago
            </Text>
          </div>

          <figcaption>
            <Heading level={3}>Senior Backend Engineer</Heading>
          </figcaption>

          <Text variant="monoLabel">Berlin · Hybrid · €92k–118k</Text>
        </Card.Header>

        <Card.Body>
          <div className="flex items-baseline justify-between gap-4">
            <Text as="span" variant="eyebrow">
              Your match
            </Text>
            <ScoreBadge>
              {MATCHED_COUNT} / {TOTAL_COUNT}
            </ScoreBadge>
          </div>

          <MatchBar
            matched={MATCHED_COUNT}
            total={TOTAL_COUNT}
            className="mt-3"
          />

          <div className="mt-5">
            <Text variant="eyebrow" className="text-secondary">
              Matched
            </Text>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MATCHED_SKILLS.map((skill) => (
                <Chip key={skill} state="matched">
                  {skill}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <Text variant="eyebrow" className="text-secondary">
              Missing
            </Text>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MISSING_SKILLS.map((skill) => (
                <Chip key={skill.name} state="missing">
                  {skill.name}
                </Chip>
              ))}
            </div>

            <ul className="mt-3 space-y-1">
              {MISSING_SKILLS.map((skill) => (
                <Text key={skill.name} as="li" variant="monoData">
                  {skill.name}: {skill.note}
                </Text>
              ))}
            </ul>
          </div>

          <Text variant="monoData" className="mt-5">
            <span className="text-primary-600">{"//"}</span> {SUMMARY_LINE}
          </Text>
        </Card.Body>

        {/*
         * NOT A LINK, for the same reason the sign in controls are not (AC-17).
         * An example listing has no real posting to open, so this states what
         * the control would do rather than offering a destination that does not
         * exist. Feature 12 builds the real one on a real result.
         */}
        <Card.Footer>
          <Text
            as="span"
            variant="muted"
            className="inline-flex items-center gap-1.5"
          >
            Apply on the real posting
            <ExternalLinkIcon />
          </Text>
        </Card.Footer>
      </Card>
    </figure>
  );
}

/** The page's opening section: the claim, the sign in state, and the example. */
export function HeroSection() {
  return (
    <Section weight="generous" background="paper" divider="none">
      {/*
       * The 60/40 split from spec 0005, AC-8: the argument is the primary
       * column and the example is the secondary one. Single column below `lg`,
       * where the card would be too narrow to read either way.
       */}
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-split lg:gap-16">
        <div>
          <Text variant="eyebrow">Job search, with the reasoning shown</Text>

          {/*
           * No character count cap on the heading. The prototype pinned it at
           * 16ch, which sets the line break by accident; `text-balance` from
           * `Heading` breaks it by sense instead.
           */}
          <Heading level={1} className="mt-4">
            Job search that shows its work.
          </Heading>

          <Text className="mt-5 text-muted">{HERO_SUBHEAD}</Text>

          <div className="mt-8">
            <SignInControls />
          </div>
        </div>

        <ExampleResultCard />
      </div>
    </Section>
  );
}

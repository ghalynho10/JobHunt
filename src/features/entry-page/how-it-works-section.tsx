import type { ReactNode } from "react";

import { Heading } from "@/components/ui/heading";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

/**
 * How it works (spec 0006, AC-1, AC-2, AC-3).
 *
 * `compact` on `sunken`: the quietest tier of the rhythm scale, because three
 * short parallel steps are the page's connective tissue rather than one of its
 * peaks. No opening eyebrow here, by spec 0006's eyebrow placement call: the
 * eyebrow marks the two `generous` sections, so this section opens on its
 * heading alone.
 *
 * NO DIVIDER. The hero above is `paper` and this is `sunken`, so the background
 * change already separates them and a hairline would double state it (spec
 * 0005's adjacency rule, AC-3). The page's one hairline is on the section after
 * this one, which shares this background.
 *
 * Three equal columns, not the 60/40 split: these are genuinely equal peers,
 * which is the distinction spec 0005, AC-8 draws.
 */

type StepProps = {
  /** The step numeral, decoration rather than data, so sans tracked caps. */
  readonly numeral: string;
  readonly title: string;
  readonly children: ReactNode;
};

/**
 * One step. The 2px teal rule at the top is a column marker in the brand
 * colour, not a hairline: AC-3 counts `border-line` dividers between sections,
 * and this is neither that weight, that colour, nor in that position.
 */
function Step({ numeral, title, children }: StepProps) {
  return (
    <div className="border-primary-800 border-t-2 pt-5">
      <Text as="span" variant="eyebrow" className="text-primary-600">
        {numeral}
      </Text>
      <Heading level={3} className="mt-3">
        {title}
      </Heading>
      {children}
    </div>
  );
}

/** The three step explanation of the loop, with no black box in it. */
export function HowItWorksSection() {
  return (
    <Section
      id="how-it-works"
      weight="compact"
      background="sunken"
      divider="none"
      className="scroll-mt-16"
    >
      <Heading level={2}>Three steps, no black box.</Heading>

      <div className="mt-10 grid gap-10 sm:grid-cols-3">
        <Step numeral="01" title="Tell it what you're after">
          {/*
           * The five decorative filter pills the prototype drew here are gone
           * (spec 0006's decorative chips call): the sentence below already
           * names every filter, so they were texture shaped like real UI.
           */}
          <Text className="mt-2 text-muted">
            Point it at your profile or resume, then set real filters: location,
            seniority, remote or hybrid, salary, and job type.
          </Text>
        </Step>

        <Step numeral="02" title="Search and read the reasoning">
          <Text className="mt-2 text-muted">
            Results come back ranked for you. Each one shows which skills
            matched and which are missing, so the number is never a mystery.
          </Text>

          {/*
           * The real component, not the hand copied bar the composition review
           * found here drawing six of eight cells beside a page that says eight
           * of eleven (spec 0005's follow up, Weakness #1). `MatchBar` derives
           * its own cells, so the picture cannot disagree with its inputs.
           */}
          <MatchBar
            matched={6}
            total={8}
            label="Example: 6 of 8 required skills matched"
            className="mt-4"
          />
          <Text variant="monoLabel" className="mt-2">
            matched / gap, always both.
          </Text>
        </Step>

        <Step numeral="03" title="Apply on the real posting, then track it">
          <Text className="mt-2 text-muted">
            JobHunt links out to the actual listing and records that you
            applied.
          </Text>
          <Text variant="monoData" className="mt-4 text-primary-600">
            No auto-fill. No application is ever submitted for you.
          </Text>
        </Step>
      </div>
    </Section>
  );
}

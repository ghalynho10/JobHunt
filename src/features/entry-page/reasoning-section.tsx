import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

import { ScoreBadge } from "./score-badge";

/**
 * The reasoning (spec 0006, AC-2, AC-3, AC-5).
 *
 * `generous` on `sunken`: the page's second peak, and the argument it exists to
 * make. It opens with an eyebrow for the same reason the hero does.
 *
 * THIS CARRIES THE PAGE'S ONLY HAIRLINE. It follows another `sunken` section,
 * so the background alternation has nothing to say at this boundary and the
 * rule is the separator (spec 0005's adjacency rule, AC-3). A second hairline
 * anywhere on this page means the alternation was changed without reapplying
 * that rule.
 *
 * BOTH CARDS ARE FLAT AND IDENTICAL (AC-5). The prototype gave the JobHunt card
 * a shadow, which argued the point by decoration rather than by content: the
 * two cards are a comparison, so any difference in weight between them is a
 * thumb on the scale. The only elevated card on this page is the hero result.
 */

/**
 * The one number, drawn as one continuous bar.
 *
 * DELIBERATELY A DIFFERENT OBJECT FROM `MatchBar`, not the same shape at a
 * different radius (spec 0006, the comparison bars call). It is thin, fully
 * rounded and unbroken, where the match bar is taller, squared and segmented,
 * so the eye reads them as two kinds of thing rather than two states of one.
 * The two are not expected to align across the gutter.
 *
 * `aria-hidden` because the percentage sits directly above it in text: a screen
 * reader gets the value once, from the value.
 */
function SingleNumberBar() {
  return (
    <div className="bg-line/20 mt-4 h-1 w-full rounded-full" aria-hidden="true">
      <div className="bg-muted h-1 w-[82%] rounded-full" />
    </div>
  );
}

/** The comparison that makes the product's case: one number against evidence. */
export function ReasoningSection() {
  return (
    <Section
      id="reasoning"
      weight="generous"
      background="sunken"
      divider="hairline"
      className="scroll-mt-16"
    >
      <Text variant="eyebrow">The reasoning</Text>
      <Heading level={2} className="mt-3">
        The score is not a black box.
      </Heading>
      <Text className="mt-3 text-muted">
        Most tools hand you one number. JobHunt breaks it into the parts you can
        actually act on.
      </Text>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <Card tone="flat">
          <Card.Header>
            <Text variant="eyebrow">Most tools</Text>
          </Card.Header>
          <Card.Body>
            {/*
             * Mono and on the locked scale: a score is a measured value (spec
             * 0005, AC-6), and 44px is not a step the type scale has.
             */}
            <Text variant="monoLabel" className="text-h2 font-semibold">
              82%
            </Text>
            <SingleNumberBar />
            <Text className="mt-5 text-muted">
              {
                "A single number. You can't see which skills moved it, so you can't act on it."
              }
            </Text>
          </Card.Body>
        </Card>

        <Card tone="flat">
          <Card.Header>
            <Text variant="eyebrow">JobHunt</Text>
          </Card.Header>
          <Card.Body>
            <div>
              <ScoreBadge size="compare">8 of 11</ScoreBadge>
            </div>
            <MatchBar
              matched={8}
              total={11}
              label="Example: 8 of 11 required skills matched"
              className="mt-4"
            />
            <Text className="mt-5 text-muted">
              The reasoning is written out: which skills matched, which are
              missing, and what to say about the gap.
            </Text>
          </Card.Body>
        </Card>
      </div>
    </Section>
  );
}

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

/**
 * About, and the status card (spec 0006, AC-2, AC-5, AC-8).
 *
 * `standard` on `paper`, and no opening eyebrow: it is neither of the two peaks
 * the eyebrow marks. No divider either, because the `sunken` section above it
 * already changes ground.
 */

/**
 * The status card's two lists, and the one place on this page that can go
 * untrue without anyone touching this file.
 *
 * THE SOURCE IS `docs/scope/scope.md`, the At a glance status column, read by a
 * human rather than by code. AC-8 makes both directions a promise: nothing sits
 * under `working` that the scope does not mark `done`, and nothing sits under
 * `planned` that has no scope row at all. That is why `email digests` is not
 * here (its only trace is a deferred idea, not a planned feature) and why
 * `a no sign in demo account` is (feature 31).
 *
 * WHY `working` READS THE WAY IT DOES. Sign in was the only thing a visitor
 * could actually use when this card was written, so it was the only thing
 * listed. It is deliberately not one of the five under `planned`: those are
 * product capabilities, and sign in was never among them, which is why feature 7
 * shipping retired the old placeholder rather than moving a claim across.
 * Features 9, 11, 12 and 14 each carry a line in their own `Done when` requiring
 * them to move their claim over when they ship, so this row fills in from
 * `planned` rather than being rewritten by hand again.
 *
 * `profile` MOVED ACROSS ON 2026-09-02, when feature 9 shipped the form (spec
 * 0010, AC-16). That is the mechanism above working as intended for the first
 * time: a claim left `planned` and joined `working` because the thing it names
 * now exists. `filtered search` followed on 2026-09-04, when feature 11
 * shipped the real Adzuna search (spec 0013, AC-12). Three remain under
 * `planned`, each owned by the feature that will move it.
 *
 * THE PLACEHOLDER OUTLIVED ITS OWN DEADLINE, and that is worth recording here
 * rather than only in the scope. It read `nothing yet · this page is the first
 * of it`. Feature 7's `Done when` required retiring it, feature 7 was marked
 * done on 2026-08-30, and the string was never touched: the live site went on
 * telling every visitor that nothing worked, for two days after signing in
 * worked, until this was noticed on 2026-09-01. The header above explains why
 * no test guards this card, and that reasoning still holds. This is what it
 * costs: the only guard is somebody reading the page and knowing better.
 */
const WORKING = "sign in with Google or GitHub · profile · filtered search";

const PLANNED =
  "ranked results with reasoning · application tracking · a no sign in demo account";

const ABOUT_PARAGRAPHS = [
  "JobHunt is a real product in progress, built and run by one engineer. I use it for my own search, so the parts that are broken get fixed because I run into them too.",
  "The ranking compares your profile against each posting and writes out the reasoning. A score you can't question isn't much help when you're deciding where to spend an application.",
  "Anything not built yet is labeled as such on this page, not implied.",
] as const;

/**
 * What this is and who built it, beside a card that says exactly how much of it
 * exists today.
 */
export function AboutSection() {
  return (
    <Section
      id="about"
      weight="standard"
      background="paper"
      divider="none"
      className="scroll-mt-16"
    >
      <div className="grid grid-cols-1 gap-10 lg:grid-split lg:gap-16">
        <div>
          <Heading level={2}>Built for real use, not for show.</Heading>
          <div className="mt-5 space-y-4">
            {ABOUT_PARAGRAPHS.map((paragraph) => (
              <Text key={paragraph} className="text-muted">
                {paragraph}
              </Text>
            ))}
          </div>
        </div>

        {/*
         * Flat, like every card on this page except the hero result. It sits on
         * `paper` and its own hairline does the separating (spec 0005's flat
         * idiom), which is the quiet reading this content wants: it is a status
         * note, not the page's claim.
         */}
        <Card tone="flat" className="self-start">
          <Card.Header>
            <Text variant="eyebrow" className="text-secondary">
              {"What's real today"}
            </Text>
          </Card.Header>
          <Card.Body>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <Chip state="matched" className="shrink-0 self-start">
                  working
                </Chip>
                <Text as="span" variant="monoData">
                  {WORKING}
                </Text>
              </li>
              <li className="flex gap-3">
                <Chip state="missing" className="shrink-0 self-start">
                  planned
                </Chip>
                <Text as="span" variant="monoData">
                  {PLANNED}
                </Text>
              </li>
            </ul>
          </Card.Body>
        </Card>
      </div>
    </Section>
  );
}

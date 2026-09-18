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
 * shipped the real Adzuna search (spec 0013, AC-12), `application tracking` on
 * 2026-09-05, when feature 12 made applications real (spec 0014, AC-16),
 * `ranked results with reasoning` on 2026-09-06, when feature 14 shipped fit
 * scoring (spec 0015, AC-15), and `a no sign in demo account` on 2026-09-17,
 * when feature 31's entry page integration shipped (spec 0021, AC-13), which
 * was the last of the original five. `about-section.test.ts` names the planned
 * claim individually, so the next feature to ship has to come here and change
 * it rather than the row quietly emptying.
 *
 * THAT LAST MOVE IS THE ONE WORTH READING TWICE. `ranked results with
 * reasoning` is the claim the two paragraphs beside this card are entirely
 * about, so it was the one claim on the page that could make the prose false
 * while sitting under `planned`, and the one whose move most needs the scope
 * row behind it to actually say `done`.
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
const WORKING =
  "sign in with Google or GitHub · profile · filtered search · application tracking · ranked results with reasoning · a no sign in demo account";

/**
 * ONE CLAIM, NOT A LIST, and that shape is deliberate rather than incidental.
 * `WORKING` is a middot list because several things are true at once; this has
 * always been a single string naming the next thing a visitor cannot do yet,
 * and it stays one.
 *
 * REPLACED ON 2026-09-17 RATHER THAN EMPTIED. Feature 31 shipping moved the last
 * of the original five claims across, which would have left this row rendering a
 * `planned` chip beside nothing. That is not merely untidy: the third paragraph
 * to the left of this card promises "anything not built yet is labeled as such
 * on this page, not implied", and a card with no `planned` side makes that
 * sentence false on the same screen it appears. So one replacement was chosen
 * instead of deleting the row.
 *
 * `resumes tailored to each posting` IS FEATURE 25 (Resume tailoring per job),
 * a real `planned` row in `docs/scope/scope.md`, which is what AC-8's second
 * promise requires: nothing sits here that has no scope row at all.
 *
 * THE RECURRING COST THIS CREATES, worth naming because the mechanism did not
 * have it before. The original five drained one at a time and were never
 * refilled, so the row was always going to empty exactly once. From now on,
 * every feature that moves this claim to `working` has to choose the next one,
 * or delete the row and rewrite the paragraph beside it. Recorded in spec
 * 0021's Follow-up.
 */
const PLANNED = "resumes tailored to each posting";

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

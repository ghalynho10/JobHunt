import { describe, expect, it } from "vitest";

import { Chip } from "@/components/ui/chip";
import { failure, isFailure, success } from "@/lib/result";

import {
  findAllByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { BandBadge } from "./band-badge";
import { SCORING_COPY } from "./copy";
import type { CheckOutcome } from "./check";
import { ScoreCard } from "./score-card";
import type { FitScore } from "./rubric";
import type { ScoreOutcome } from "./score";
import type { ListingOutcome } from "./score-listings";

/**
 * The four states one card's scoring block can be in (spec 0015, AC-5, AC-6,
 * AC-10, AC-11).
 *
 * WHY THEY ARE TESTED TOGETHER. The requirement is not that each state renders;
 * it is that a reader can TELL THEM APART, the same reasoning `/search`'s own
 * page test states for its four outcomes. The dangerous defect here is two
 * states collapsing into one treatment, and the worst of those collapses would
 * be a failure that reads like a low score, which is exactly what AC-10's "a
 * failed scoring attempt never renders anything that reads as a working score"
 * forbids. Several assertions below compare states against each other for that
 * reason.
 */

const score = (over: Partial<FitScore> = {}): FitScore => ({
  band: "good_match",
  matchedSkills: ["Go", "PostgreSQL"],
  notMentionedSkills: ["Kafka"],
  reasoning: "Your backend work lines up with what the posting shows.",
  sponsorshipSignal: "not_stated",
  ...over,
});

const scored = (over: Partial<FitScore> = {}): ScoreOutcome =>
  success({ allowed: true, value: score(over) });

/** A check that ran and disputed nothing (spec 0019, AC-7's clean state). */
const cleanCheck: CheckOutcome = success({
  allowed: true,
  value: { ungroundedSkills: [] },
});

/**
 * A whole card outcome, from a score alone (spec 0019).
 *
 * THE DEFAULT CHECK IS CHOSEN TO BE A STATE THE SYSTEM CAN ACTUALLY REACH,
 * not just one that typechecks. A score that refused or failed is paired with
 * `"skipped_no_score"`, because AC-5 means no check is ever attempted on one;
 * pairing it with a completed check would let every spec 0015 assertion below
 * pass against a shape `scoreListings()` cannot produce, which is a suite
 * proving something about a system other than this one.
 */
const listingOutcome = (
  score: ScoreOutcome,
  check?: ListingOutcome["check"],
): ListingOutcome => ({
  score,
  check:
    check ??
    (isFailure(score) || !score.value.allowed
      ? "skipped_no_score"
      : cleanCheck),
});

const render = (outcome: ScoreOutcome | "pending") =>
  renderDeep(
    ScoreCard({
      outcome: outcome === "pending" ? outcome : listingOutcome(outcome),
    }),
  );

/**
 * The same tree, stopped at the two components whose PROPS the criteria are
 * written against rather than their markup, exactly as spec 0006's page tests
 * stop at the design system. Rendered through, a `Chip` becomes a `span` and
 * its `state` (the fill versus outline grammar) is gone.
 */
const renderShallow = (outcome: ScoreOutcome | "pending") =>
  renderDeep(
    ScoreCard({
      outcome: outcome === "pending" ? outcome : listingOutcome(outcome),
    }),
    [Chip, BandBadge],
  );

/** The spec 0019 states, where the check half is what is under test. */
const renderChecked = (check: ListingOutcome["check"], over = {}) =>
  renderDeep(ScoreCard({ outcome: listingOutcome(scored(over), check) }));

const renderCheckedShallow = (check: ListingOutcome["check"], over = {}) =>
  renderDeep(ScoreCard({ outcome: listingOutcome(scored(over), check) }), [
    Chip,
    BandBadge,
  ]);

describe("a resolved score (AC-5, AC-6)", () => {
  it("shows the band, the matched skills and the written reasoning", () => {
    const text = textOf(render(scored()));

    expect(text).toContain(SCORING_COPY.bands.good_match);
    expect(text).toContain("Go");
    expect(text).toContain(
      "Your backend work lines up with what the posting shows.",
    );
  });

  it("never labels the second list as missing, and says why it is not (AC-5)", () => {
    /**
     * THE CENTRAL CLAIM OF THIS WHOLE SPEC, in one assertion. Adzuna returns
     * 500 characters of a posting, so the app cannot tell a skill a posting
     * does not want from one it wants further down text nobody was shown.
     * "Missing" would claim the first. The caption is what makes the heading
     * above it true, so both halves are asserted: a heading reworded to
     * "Missing skills" and a caption quietly deleted are the same defect.
     */
    const text = textOf(render(scored()));

    expect(text).toContain(SCORING_COPY.notMentionedHeading);
    expect(text).toContain(SCORING_COPY.notMentionedCaption);
    expect(text).not.toMatch(/missing/i);
  });

  it("renders the two skill lists in the two different chip states", () => {
    /**
     * The design system's fill versus outline grammar carries matched versus
     * not mentioned by SHAPE, since each `Chip` state draws its own icon. Colour
     * alone would be lost in a forced palette, which is this project's WCAG 2.2
     * AA floor.
     */
    const chips = findAllByType(renderShallow(scored()), Chip);
    const states = chips.map(
      (chip) => (chip.props as { state?: string }).state,
    );

    expect(states).toContain("matched");
    expect(states).toContain("missing");
  });

  it("omits a list entirely when it is empty, rather than showing a heading over nothing", () => {
    const text = textOf(
      render(scored({ matchedSkills: [], notMentionedSkills: [] })),
    );

    expect(text).not.toContain(SCORING_COPY.matchedHeading);
    expect(text).not.toContain(SCORING_COPY.notMentionedHeading);
    /** The band and the reasoning still render: an empty list is not an error. */
    expect(text).toContain(SCORING_COPY.bands.good_match);
  });
});

describe("the sponsorship signal (AC-6)", () => {
  it("renders nothing at all when the posting did not say", () => {
    const text = textOf(render(scored({ sponsorshipSignal: "not_stated" })));

    expect(text).not.toMatch(/sponsor/i);
  });

  it("renders its own badge, separate from the band badge, when it did say", () => {
    const tree = renderShallow(
      scored({ sponsorshipSignal: "does_not_sponsor" }),
    );

    /**
     * SEPARATE ELEMENTS, NOT ONE COMBINED PILL (AC-6). The signal is never an
     * input to the band, and a single badge carrying both would imply it was.
     * Asserted on the two components rather than on the rendered text, because
     * the text would read the same either way.
     */
    const badges = findAllByType(tree, BandBadge);
    expect(badges).toHaveLength(1);
    expect((badges[0]?.props as { band?: string }).band).toBe("good_match");

    const sponsorship = findAllByType(tree, Chip).filter(
      (chip) => (chip.props as { state?: string }).state === "status",
    );
    expect(textOf(sponsorship[0])).toBe(
      SCORING_COPY.sponsorship.does_not_sponsor,
    );
  });
});

describe("the three non score states (AC-10, AC-11)", () => {
  it("says a listing could not be scored, and shows no band (AC-10)", () => {
    const text = textOf(
      render(
        failure({
          kind: "external_service_failed",
          severity: "unexpected",
          message: "vendor down",
        }),
      ),
    );

    expect(text).toContain(SCORING_COPY.couldNotScore);

    /**
     * AC-10: a failed attempt never renders anything that reads as a working
     * score. `not_a_match` is the one that would be mistaken for one, since a
     * broken call and a bad fit would then look identical.
     */
    for (const label of Object.values(SCORING_COPY.bands)) {
      expect(text).not.toContain(label);
    }
  });

  it("never leaks the internal failure message to the reader", () => {
    const text = textOf(
      render(
        failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "the model returned nonsense",
        }),
      ),
    );

    expect(text).not.toContain("the model returned nonsense");
  });

  it("renders nothing at all for a usage cap refusal (AC-11)", () => {
    /**
     * The page says it once, above the list. Repeating a cap on twenty cards
     * would bury the one thing the reader can act on under nineteen copies of
     * itself, and would read as twenty separate things having gone wrong.
     */
    const refused = render(
      success({ allowed: false, reason: "account_week_cap_reached" }),
    );

    expect(refused).toBeUndefined();
  });

  it("keeps the refusal and the failure visibly different (key invariant)", () => {
    const refused = render(
      success({ allowed: false, reason: "global_day_cap_reached" }),
    );
    const failed = render(
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "vendor down",
      }),
    );

    expect(textOf(refused)).not.toBe(textOf(failed));
  });

  it("shows the pending sentence while the call is still out (COPY-4)", () => {
    expect(textOf(render("pending"))).toBe(SCORING_COPY.pending);
  });
});

/**
 * The three check states on a scored card (spec 0019, AC-7, AC-8, AC-12,
 * AC-13).
 *
 * WHY THEY ARE TESTED AGAINST EACH OTHER, the same reasoning the four scoring
 * states above are. The requirement is not that each renders; it is that a
 * reader can tell them apart. The dangerous collapse here is specific and
 * named in AC-8: a check that BROKE reading the same as a check that was
 * never needed. That would turn an outage into a page of cards that look
 * ordinary, which is the failure dressed as success this feature exists to
 * catch one layer down.
 */
describe("the three check states (AC-7, AC-8)", () => {
  const flaggedCheck = (ungroundedSkills: readonly string[]): CheckOutcome =>
    success({ allowed: true, value: { ungroundedSkills } });

  it("removes a flagged skill from the chips and says which one went (AC-7)", () => {
    const text = textOf(renderChecked(flaggedCheck(["PostgreSQL"])));
    const chips = findAllByType(
      renderCheckedShallow(flaggedCheck(["PostgreSQL"])),
      Chip,
    ).map((chip) => textOf(chip));

    /** Gone from the chips, and named in the sentence that explains why. */
    expect(chips).not.toContain("PostgreSQL");
    expect(chips).toContain("Go");
    expect(text).toContain(SCORING_COPY.removedSkills(["PostgreSQL"]));
  });

  it("names every removed skill in one note, not one note per skill", () => {
    const text = textOf(renderChecked(flaggedCheck(["Go", "PostgreSQL"])));

    expect(text).toContain(SCORING_COPY.removedSkills(["Go", "PostgreSQL"]));
    expect(text.split("Removed from matched skills")).toHaveLength(2);
  });

  it("still explains itself when every claimed skill was flagged", () => {
    /**
     * THE CASE THE NOTE MATTERS MOST IN, and the one a naive implementation
     * drops: hanging the sentence inside the matched skills block would hide
     * it exactly when the block disappears, leaving a card that silently lost
     * a whole section with nothing to say why.
     */
    const tree = renderChecked(flaggedCheck(["Go", "PostgreSQL"]));
    const chips = findAllByType(
      renderCheckedShallow(flaggedCheck(["Go", "PostgreSQL"])),
      Chip,
    ).map((chip) => textOf(chip));

    expect(chips).not.toContain("Go");
    expect(chips).not.toContain("PostgreSQL");
    expect(textOf(tree)).toContain(
      SCORING_COPY.removedSkills(["Go", "PostgreSQL"]),
    );
  });

  it("says a check could not be run, and changes nothing else (AC-7)", () => {
    const brokenStates: CheckOutcome[] = [
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "check vendor down",
      }),
      success({ allowed: false, reason: "global_day_cap_reached" }),
    ];

    for (const broken of brokenStates) {
      const text = textOf(renderChecked(broken));
      const chips = findAllByType(renderCheckedShallow(broken), Chip).map(
        (chip) => textOf(chip),
      );

      expect(text).toContain(SCORING_COPY.couldNotCheck);

      /**
       * THE HALF THAT MATTERS MORE THAN THE SENTENCE. Dropping the matched
       * skills because a check broke would let an outage quietly edit
       * somebody's own profile off their screen, and the card would look
       * exactly like a flagged one.
       */
      expect(chips).toContain("Go");
      expect(chips).toContain("PostgreSQL");
      expect(text).not.toContain("Removed from matched skills");
    }
  });

  it("renders a refusal and a failure identically at the card level (AC-7, AC-9)", () => {
    /**
     * AC-9 rests on this: a check refusal gets no page level notice of its
     * own, only this state. The two remain structurally distinct TYPES, which
     * `check.test.ts` proves; what AC-7 asks for is that they read the same
     * here, because the difference between them is not something a reader can
     * act on.
     */
    const refused = textOf(
      renderChecked(
        success({ allowed: false, reason: "global_day_cap_reached" }),
      ),
    );
    const failed = textOf(
      renderChecked(
        failure({
          kind: "external_service_failed",
          severity: "unexpected",
          message: "check vendor down",
        }),
      ),
    );

    expect(refused).toBe(failed);
  });

  it("says nothing at all for a clean check or either skip (AC-8)", () => {
    /**
     * AC-8's exact requirement. A skipped check and a broken one must stay
     * visibly distinct, and the way they are is that one of them is silent.
     * Compared against the unverifiable card rather than only against a
     * substring, so a note added later under a different wording still fails
     * this.
     */
    const quiet = [
      cleanCheck,
      "skipped_no_skills" as const,
      "skipped_no_score" as const,
    ].map((check) => textOf(renderChecked(check)));

    for (const text of quiet) {
      expect(text).not.toContain(SCORING_COPY.couldNotCheck);
      expect(text).not.toContain("Removed from matched skills");
      expect(text).not.toContain(SCORING_COPY.reasoningCaveat);
    }

    /** All three read alike, and none reads like the unverifiable card. */
    expect(new Set(quiet).size).toBe(1);
    expect(quiet[0]).not.toBe(
      textOf(
        renderChecked(
          failure({
            kind: "external_service_failed",
            severity: "unexpected",
            message: "check vendor down",
          }),
        ),
      ),
    );
  });
});

describe("the reasoning caveat and the band (AC-12, AC-13)", () => {
  const flaggedCheck: CheckOutcome = success({
    allowed: true,
    value: { ungroundedSkills: ["PostgreSQL"] },
  });

  it("renders the caveat above the untouched reasoning on a flagged card (AC-13)", () => {
    const text = textOf(renderChecked(flaggedCheck));

    expect(text).toContain(SCORING_COPY.reasoningCaveat);

    /**
     * THE REASONING ITSELF IS BYTE FOR BYTE WHAT WAS SCORED (AC-13, and this
     * project's store raw rule). Editing it to remove a mention of a flagged
     * skill would put words in the model's mouth; the caveat is a separate
     * element for exactly that reason.
     */
    expect(text).toContain(score().reasoning);
  });

  it("puts the caveat BEFORE the reasoning, not after it (AC-13)", () => {
    /**
     * ORDER IS THE REQUIREMENT, NOT MERE PRESENCE. A caveat read after the
     * paragraph it qualifies arrives too late to do its job: the reader has
     * already taken the sentence naming a removed skill at face value.
     */
    const text = textOf(renderChecked(flaggedCheck));

    expect(text.indexOf(SCORING_COPY.reasoningCaveat)).toBeLessThan(
      text.indexOf(score().reasoning),
    );
  });

  it("adds no caveat for a clean, unverifiable or skipped check (AC-13)", () => {
    for (const check of [
      cleanCheck,
      "skipped_no_skills" as const,
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "check vendor down",
      }),
    ]) {
      expect(textOf(renderChecked(check))).not.toContain(
        SCORING_COPY.reasoningCaveat,
      );
    }
  });

  it("never changes the band, whatever the check said (AC-12)", () => {
    /**
     * AC-12 at the card level. A card can lose every chip it had and keep its
     * band, which is the honest reading: an excerpt failing to confirm a
     * claim is a limit of the excerpt, not a re-scoring of the job. The sort
     * half of AC-12 is proved in `src/app/(app)/search/page.test.ts`, where
     * the ordering actually happens.
     */
    const everyState: ListingOutcome["check"][] = [
      cleanCheck,
      flaggedCheck,
      success({
        allowed: true,
        value: { ungroundedSkills: ["Go", "PostgreSQL"] },
      }),
      success({ allowed: false, reason: "global_day_cap_reached" }),
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "check vendor down",
      }),
      "skipped_no_skills",
      "skipped_no_score",
    ];

    for (const check of everyState) {
      expect(textOf(renderChecked(check))).toContain(
        SCORING_COPY.bands.good_match,
      );
    }
  });
});

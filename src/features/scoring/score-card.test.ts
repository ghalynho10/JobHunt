import { describe, expect, it } from "vitest";

import { Chip } from "@/components/ui/chip";
import { failure, success } from "@/lib/result";

import {
  findAllByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { BandBadge } from "./band-badge";
import { SCORING_COPY } from "./copy";
import { ScoreCard } from "./score-card";
import type { FitScore } from "./rubric";
import type { ScoreOutcome } from "./score";

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

const render = (outcome: ScoreOutcome | "pending") =>
  renderDeep(ScoreCard({ outcome }));

/**
 * The same tree, stopped at the two components whose PROPS the criteria are
 * written against rather than their markup, exactly as spec 0006's page tests
 * stop at the design system. Rendered through, a `Chip` becomes a `span` and
 * its `state` (the fill versus outline grammar) is gone.
 */
const renderShallow = (outcome: ScoreOutcome | "pending") =>
  renderDeep(ScoreCard({ outcome }), [Chip, BandBadge]);

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

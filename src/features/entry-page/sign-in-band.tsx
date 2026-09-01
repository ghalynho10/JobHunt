import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

import { DoorCta } from "./door-cta";

/**
 * The sign in band (spec 0006, AC-2, AC-6, AC-7).
 *
 * ONE DISTINGUISHING AXIS, NOT THREE. The prototype over signalled this band on
 * three axes at once: dark ground, centred text, and a narrowed measure. Two of
 * them are removed here (Tell #7). It keeps the dark ground and otherwise uses
 * the same left aligned, full width content column every other section on this
 * page uses, so the eye reads a change of ground rather than a change of
 * document.
 *
 * THE DARK GROUND IS AN OVERRIDE, ON PURPOSE. `Section`'s `background` variant
 * enumerates `paper` and `sunken`, the two grounds the page alternates between;
 * AC-3 lists this band separately for exactly that reason. The `className` wins
 * over the variant through `tailwind-merge`, and this is the only place on the
 * page that does it.
 *
 * NO DIVIDER above or below: `paper` to dark and dark to the footer are both
 * background changes, which is the separation (spec 0005's adjacency rule).
 *
 * SPEC 0008, AC-18: THE BAND NO LONGER SIGNS ANYBODY IN. It held the two
 * provider forms, which invited every reader to sign in including the ones
 * already signed in, on a page that cannot tell the difference because it reads
 * no session. Both are replaced by the door, and the header's control no longer
 * jumps here, because there is nothing here to jump to any more. The band keeps
 * its job: saying what this costs and what it needs from you.
 */

/**
 * THE OPENING CLAUSE HAS BEEN DELETED TWICE NOW, BOTH TIMES FOR THE SAME
 * REASON: it stopped being true of every visitor.
 *
 * Spec 0007, AC-16 removed "is coming soon" the moment sign in shipped. Spec
 * 0008, AC-18 removes "Sign in with Google or GitHub" for the same kind of
 * reason: `/` reads no session, so it cannot tell whether the person reading it
 * is already signed in, and this band no longer signs anybody in either way.
 * Deleted at the engineer's direction on 2026-08-31, rather than reworded, which
 * is the operation both criteria use. What is left is the engineer's own
 * sentence, unchanged.
 */
const BAND_BODY = "No email, no password, no subscription. JobHunt is free.";

/** The page's closing section: where sign in will live, and what it will cost. */
export function SignInBand() {
  return (
    <Section
      id="start"
      weight="standard"
      divider="none"
      className="bg-primary-800 scroll-mt-16"
    >
      <Heading level={2} className="text-paper">
        Start your search.
      </Heading>

      <Text className="text-paper mt-3">{BAND_BODY}</Text>

      <div className="mt-8">
        <DoorCta />
      </div>
    </Section>
  );
}

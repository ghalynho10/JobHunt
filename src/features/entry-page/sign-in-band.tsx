import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

import { SignInControls } from "./sign-in-controls";

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
 * The controls in this band are not links (AC-7). The header's "Sign in" points
 * here, which is the one honest destination the word has until feature 7.
 */

const BAND_BODY =
  "Sign in with Google or GitHub is coming soon. No email, no password, no subscription. JobHunt is free.";

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
        <SignInControls tone="dark" />
      </div>
    </Section>
  );
}

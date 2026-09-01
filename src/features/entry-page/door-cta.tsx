import { Button } from "@/components/ui/button";

/**
 * The door, as it appears on the entry page (spec 0008, AC-17, AC-18).
 *
 * THIS REPLACED THE TWO PROVIDER CONTROLS, and the reason is not tidiness. `/`
 * is a static page that reads no session, so it cannot tell whether the person
 * reading it is signed in, and a page that cannot tell was inviting everybody to
 * sign in. A signed in visitor was being treated as a stranger by the one page
 * that speaks for the product.
 *
 * The door at `/go` is what makes that avoidable without `/` reading anything:
 * it is a tiny route handler that reads the session itself and sends a signed in
 * visitor to the landing rule and everyone else to `/sign-in`. So `/` keeps spec
 * 0006's accepted contract, static and session free, and stops lying at the same
 * time.
 *
 * IT IS AN ANCHOR, NOT A FORM. Sign in now begins on `/sign-in`, which is one
 * extra hop and is the accepted cost of the line above.
 */

/**
 * The door route. Shared with the header, which points at the same place with
 * its own sentence.
 */
export const DOOR_PATH = "/go";

/**
 * `COPY-4`, the engineer's, used verbatim.
 *
 * IT MUST NOT READ AS A SIGN IN INVITATION. That constraint is load bearing
 * rather than stylistic: it is the whole point of AC-18, since the visitor
 * reading it may already be signed in.
 *
 * The header's control carries the same sentence as its own `COPY-5`, written
 * out separately there. Two slots, deliberately: both controls do the same
 * thing, so different words would suggest two destinations, and they stay
 * separate so a later change to one does not silently move the other.
 */
const DOOR_CTA = "Open JobHunt";

/** The entry page's way in. */
export function DoorCta() {
  return (
    <Button href={DOOR_PATH} prefetch={false}>
      {DOOR_CTA}
    </Button>
  );
}

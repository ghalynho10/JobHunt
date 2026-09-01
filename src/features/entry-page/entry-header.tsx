import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/site-header";

import { DOOR_PATH } from "./door-cta";

/**
 * The marketing header (spec 0006 AC-4; spec 0008 AC-3a, AC-5a, AC-18).
 *
 * NO CLIENT JAVASCRIPT, AND THEREFORE NO HAMBURGER. The prototype held a mobile
 * menu open with `useState`, which made the whole page a client component to
 * hold three in page anchors. Spec 0006 drops it: below `md` the anchors are
 * hidden and the right hand control stays, so nothing becomes unreachable and
 * the page ships as a pure server render.
 *
 * COMPOSED BY EACH MARKETING PAGE, NOT BY A MARKETING LAYOUT, and the reason is
 * a constraint rather than a preference (AC-3a). A layout never learns the
 * pathname, and the navigation has to differ per page: the in page anchors
 * below exist only on `/`, so rendering them from a layout would ship dead links
 * on `/sign-in` and `/ui-preview`, which this feature's own AGENTS.md forbids.
 * Reading the pathname in a client component to work around it would put client
 * JavaScript on `/sign-in`, whose own contract forbids that.
 *
 * THE CHROME ITSELF IS `SiteHeader`, in the design system. This module supplies
 * only what is particular to the marketing side: which anchors, and which
 * control on the right.
 */

/**
 * `COPY-5`, the engineer's, used verbatim.
 *
 * The same sentence as `COPY-4` on purpose: both controls point at the door and
 * do the same thing, so different words would suggest two destinations. Written
 * here rather than imported, because the spec keeps them as two slots so a later
 * change to one does not silently move the other.
 */
const HEADER_CTA = "Open JobHunt";

interface EntryHeaderProps {
  /**
   * `anchors` renders the three in page links, and is correct on `/` alone,
   * because `/` is the only marketing page that has those sections. `none`
   * renders no navigation at all, which is what every other marketing page
   * takes (AC-5a).
   *
   * A required prop rather than one defaulting to `anchors`: a page that
   * forgets to say would otherwise ship three links that scroll nowhere, which
   * is exactly the failure this prop exists to prevent.
   */
  readonly navigation: "anchors" | "none";
}

/** The header the public pages wear. */
export function EntryHeader({ navigation }: EntryHeaderProps) {
  return (
    <SiteHeader
      homeHref="/"
      homeLabel="JobHunt home"
      navigationClassName="hidden md:flex"
      navigation={
        navigation === "none" ? undefined : (
          <>
            <Button variant="tertiary" size="sm" href="#how-it-works">
              How it works
            </Button>
            <Button variant="tertiary" size="sm" href="#reasoning">
              The reasoning
            </Button>
            <Button variant="tertiary" size="sm" href="#about">
              About
            </Button>
          </>
        )
      }
      action={
        /*
         * `COPY-5`, and it is deliberately NOT a sign in invitation (AC-18).
         * The old control jumped to `#start`, a band that signed people in; that
         * band no longer does, and a signed in visitor should not be invited to
         * sign in again. The door decides per visitor instead.
         *
         * `prefetch={false}`: `/go` is a redirect whose destination differs per
         * visitor, so prefetching it would run the landing rule on hover.
         */
        <Button variant="secondary" size="sm" href={DOOR_PATH} prefetch={false}>
          {HEADER_CTA}
        </Button>
      }
    />
  );
}

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/site-header";
import { signOut } from "@/features/auth/actions";

/**
 * The signed in header (spec 0008, AC-3, AC-3a, AC-4, AC-5, AC-21).
 *
 * COMPOSED BY EACH ROUTE, NOT BY `(app)/layout.tsx`, decided by the engineer on
 * 2026-08-31 during the build. AC-3a asked the layout to compose this once, and
 * AC-5 asks each route to pass its own `aria-current="page"` in rather than have
 * any component compute one. Those two cannot both hold: a layout never learns
 * the pathname (`layout.md` lines 238 to 242), so a header composed there can
 * never be told which page it is on. This is the same defect the spec's own
 * revision 4 fixed for the marketing header, left unfixed on this side.
 *
 * Of the three ways out, this is the one that keeps the user facing guarantee.
 * Dropping `aria-current` would weaken the WCAG 2.2 AA commitment; computing it
 * from `usePathname()` would need a client boundary and would break AC-5's
 * "never computed" outright. Composing per route costs one line in each of four
 * files and keeps both promises. **Spec 0008's AC-3a needs a dated amendment
 * saying so**, which is `/architect`'s to write, not this build's.
 *
 * TWO ITEMS AND ONE ACTION, AT EVERY WIDTH (AC-4). No hamburger, no drawer, no
 * tab bar. `/applications` is deliberately not here: it is reached from the link
 * on `/profile`, so the shell stays at two items and never grows a menu.
 *
 * THE SIGN OUT FORM LIVES HERE, NOT IN `src/components/ui/` (AC-3). It is a
 * feature's Server Action, and the design system must gain no dependency on
 * `src/features/`, so the chrome takes it as a slot.
 */

/** Which of the two navigation items is the page being rendered, if either. */
export type AppRoute = "search" | "profile";

interface AppHeaderProps {
  /**
   * The route composing this header. `undefined` is correct for a page that is
   * not in the navigation at all, which today is `/applications` and `/health`.
   */
  readonly current?: AppRoute;
}

/** The header every signed in page wears. */
export function AppHeader({ current }: AppHeaderProps) {
  return (
    <SiteHeader
      /**
       * The lockup goes to search, not to `/`. It is the mock up's own target
       * (`docs/design/jobhunt-app-shell.html` line 451) and the honest one: a
       * signed in person clicking the logo wants the product, not the pitch.
       */
      homeHref="/search"
      homeLabel="JobHunt home"
      navigation={
        <>
          <Button
            variant="tertiary"
            size="sm"
            href="/search"
            current={current === "search"}
          >
            Search
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            href="/profile"
            current={current === "profile"}
          >
            Profile
          </Button>
        </>
      }
      action={
        /*
         * AC-21: the existing Server Action, which returns the person to `/`.
         * A plain form submit, so it works with JavaScript switched off and
         * nothing here crosses the client boundary. `COPY-7` is reused verbatim
         * from the health page's own control, which AC-22 removes now that sign
         * out lives above it.
         */
        <form action={signOut}>
          <Button type="submit" variant="tertiary" size="sm">
            Sign out
          </Button>
        </form>
      }
    />
  );
}

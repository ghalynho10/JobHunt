import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "./logo";
import { tv } from "./tv";

/**
 * The header chrome, and nothing else (spec 0008, AC-3).
 *
 * CHROME ONLY, AND THE LIST IS CLOSED: a home lockup, a navigation slot, an
 * action slot, and the layout that holds the three. It imports nothing from
 * `src/features/`, so the design system gains no feature dependency and spec
 * 0005's charter for this directory holds. The sign out form is a feature's
 * code and is passed in through `action`, never rendered here.
 *
 * IT HOLDS NO ROUTING LOGIC AND READS NO PATHNAME. Everything that varies
 * between one page and another arrives as children, which is what lets the same
 * component serve the marketing pages and the signed in shell without learning
 * anything about either.
 *
 * SEPARATED BY TONE, NOT BY A LINE. It sits on `surface-sunken` over the page's
 * `paper` ground, so the boundary is a background change and needs no bottom
 * border. That is spec 0005's primary divider mechanism applied to the one
 * boundary that is not between two `Section`s.
 */

interface SiteHeaderProps {
  /**
   * Where the lockup goes. The marketing pages send it to `/`; the signed in
   * shell sends it to `/search`, following the mock up's own lockup target.
   */
  readonly homeHref: string;
  /**
   * The lockup's accessible name. The link carries it, so the logo inside stays
   * decorative and is not announced twice.
   */
  readonly homeLabel: string;
  /**
   * The navigation slot. `undefined` renders no `nav` element at all, rather
   * than an empty landmark for a screen reader to announce and find nothing in.
   */
  readonly navigation?: ReactNode;
  /**
   * Layout for the navigation slot itself, for the one caller that needs it.
   *
   * The entry page hides its in page anchors below `md` (spec 0006, AC-4) and
   * this is how it says so. Merged through `tv`, so `hidden md:flex` replaces
   * the slot's own `flex` rather than fighting it, which a plain string join
   * would get wrong.
   */
  readonly navigationClassName?: string;
  /** The right hand control: a sign in door on marketing, sign out in the shell. */
  readonly action?: ReactNode;
}

/** The one row layout both the navigation slot and the right hand cluster use. */
const slot = tv({ base: "flex items-center gap-4 sm:gap-6" });

/**
 * The header every page in this product wears.
 *
 * NO HAMBURGER, NO DRAWER, NO TAB BAR, AT ANY WIDTH (AC-4). The shell has two
 * navigation items and one action, which fits at 320 pixels, so the machinery
 * that usually hides them buys nothing and costs a client boundary.
 */
export function SiteHeader({
  homeHref,
  homeLabel,
  navigation,
  navigationClassName,
  action,
}: SiteHeaderProps) {
  return (
    <header className="bg-surface-sunken/85 sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        {/* The link carries the name, so the logo inside it stays decorative. */}
        <Link
          href={homeHref}
          aria-label={homeLabel}
          className="text-primary-800 inline-flex items-center"
        >
          {/*
           * THE MARK BELOW `sm`, THE LOCKUP ABOVE IT, AND THIS IS A MEASURED FIX
           * RATHER THAN A PREFERENCE (spec 0008, AC-4). The lockup renders 190
           * pixels wide. At 320 pixels that leaves 82 for everything else once
           * the 48 pixels of padding are taken, and the signed in cluster needs
           * 168 while the marketing one needs 120. Both overflowed, measured in
           * a real browser at 320 by 800 on 2026-08-31.
           *
           * The marketing header only escaped this before because its right hand
           * control was the word "Sign in"; the door's "Open JobHunt" is wider,
           * so this feature would have introduced overflow on `/` as well. One
           * rule in the shared chrome fixes both, and swapping to the mark is
           * what a mark is for.
           *
           * Both are rendered and one is hidden in CSS, because choosing between
           * them in JavaScript would need a client boundary and `/sign-in` may
           * not have one. Each is decorative and `aria-hidden` from the icon set
           * itself, so the duplicate is never announced: the link's own label is
           * the accessible name.
           */}
          <Logo variant="mark" className="h-7 w-auto sm:hidden" />
          <Logo variant="lockup" className="hidden h-7 w-auto sm:block" />
        </Link>

        <div className={slot()}>
          {navigation === undefined ? undefined : (
            <nav
              aria-label="Primary"
              className={slot({ className: navigationClassName })}
            >
              {navigation}
            </nav>
          )}

          {action}
        </div>
      </div>
    </header>
  );
}

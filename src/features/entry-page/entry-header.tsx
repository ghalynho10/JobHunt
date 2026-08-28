import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/**
 * The entry page's header (spec 0006, AC-4).
 *
 * NO CLIENT JAVASCRIPT, AND THEREFORE NO HAMBURGER. The prototype held a mobile
 * menu open with `useState`, which made the whole page a client component to
 * hold three in page anchors. Spec 0006 drops it: below `md` the anchors are
 * hidden and the sign in jump link stays, so nothing becomes unreachable and
 * the page ships as a pure server render. (Spec 0005 retired the scroll reveal
 * but left the menu open; the menu is this spec's own call, not a carry.)
 *
 * SEPARATED BY TONE, NOT BY A LINE. The header sits on `surface-sunken` over a
 * `paper` hero, so the boundary is a background change and needs no bottom
 * border. That is spec 0005's primary divider mechanism applied to the one
 * boundary that is not between two `Section`s, and it is what keeps the page at
 * the single hairline AC-3 allows.
 */
export function EntryHeader() {
  return (
    <header className="bg-surface-sunken/85 sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
        {/* The link carries the name, so the logo inside it stays decorative. */}
        <Link
          href="/"
          aria-label="JobHunt home"
          className="text-primary-800 inline-flex items-center"
        >
          <Logo variant="lockup" className="h-7 w-auto" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          <Button variant="tertiary" size="sm" href="#how-it-works">
            How it works
          </Button>
          <Button variant="tertiary" size="sm" href="#reasoning">
            The reasoning
          </Button>
          <Button variant="tertiary" size="sm" href="#about">
            About
          </Button>
        </nav>

        {/*
         * A real, working link at every width: it jumps to the sign in band,
         * which is somewhere that exists. The controls IN that band are not
         * links, because they have nowhere to go until feature 7 (AC-7).
         */}
        <Button variant="secondary" size="sm" href="#start">
          Sign in
        </Button>
      </div>
    </header>
  );
}

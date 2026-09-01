import Link from "next/link";
import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";

import { tv } from "./tv";

import { ExternalLinkIcon } from "./icons";

/**
 * The three action weights (spec 0005, AC-13, AC-15).
 *
 * Role mapping is `brand-tokens.md`'s, not invented here: filled `primary-800`
 * for the primary action (white text on it measures 10.47:1, and 10.13:1 on
 * paper), an outline for the secondary, and a text link for the tertiary.
 *
 * Focus is not styled here. `globals.css` draws one `:focus-visible` ring for
 * the whole product, so a button can never quietly ship without one, and a
 * future variant cannot forget to add it.
 */
const button = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-lg",
    "font-sans font-medium whitespace-nowrap",
    /**
     * NOT `transition-colors`. Tailwind v4 includes `outline-color` in that
     * shorthand, which fades the `:focus-visible` ring in over 150ms: a
     * keyboard user watches their focus indicator arrive instead of seeing it.
     * Measured in the browser, `transition-colors` resolves to a list ending
     * `outline-color, text-decoration-color, fill, stroke`. Naming the
     * properties keeps the hover fade and makes focus instant.
     */
    "transition-[color,background-color,border-color] duration-150",
    "motion-reduce:transition-none",
    "disabled:cursor-not-allowed disabled:opacity-55",
    /**
     * Forced colour modes strip author backgrounds, which would leave the
     * filled primary and the outline secondary looking identical. A border in
     * the system colour restores the boundary.
     */
    "forced-colors:border forced-colors:border-[ButtonBorder]",
  ],
  variants: {
    variant: {
      primary: "bg-primary-800 text-paper hover:bg-primary-900",
      secondary:
        "border border-line bg-surface text-ink hover:border-ink hover:bg-primary-50",
      /**
       * A text link, so it carries no box padding of its own beyond a touch
       * target. Underline on hover rather than always, because at this weight a
       * permanent underline competes with the primary action next to it.
       */
      tertiary:
        "text-primary-800 underline-offset-4 hover:underline hover:text-primary-900",
    },
    size: {
      /** The default. 44px tall at `md`, which clears the WCAG 2.2 AA target. */
      md: "px-5 py-2.5 text-body",
      sm: "px-3.5 py-2 text-small",
    },
  },
  compoundVariants: [
    /** The text link keeps a real touch target but no horizontal box padding. */
    { variant: "tertiary", size: "md", class: "px-0 py-2" },
    { variant: "tertiary", size: "sm", class: "px-0 py-1.5" },
  ],
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

type ButtonCommon = VariantProps<typeof button> & {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Overrides the accessible name when the visible label alone would not say
   * where the control goes ("Apply" on a card among twenty cards).
   */
  readonly label?: string;
};

/**
 * The acting shape: a real `<button>`, because a control that acts has to
 * respond to the space bar.
 */
type ButtonAsButton = ButtonCommon & {
  readonly href?: undefined;
  /** Defaults to `button`, never `submit`, so a stray control cannot post a form. */
  readonly type?: "button" | "submit";
  readonly disabled?: boolean;
  /** Nothing to leave the product for without an `href`. */
  readonly external?: never;
};

/**
 * The navigating shape: an anchor, because a control that navigates has to work
 * with middle click, copy link, and open in new tab.
 *
 * `disabled` IS FORBIDDEN HERE ON PURPOSE, and this is the whole reason the
 * props are a union rather than one flat object. HTML has no disabled anchor:
 * there is no attribute, `disabled:` styling never matches, and the link stays
 * clickable and in the tab order. The earlier flat type accepted `disabled`
 * beside `href`, type checked, and then dropped it, so a disabled "Apply" link
 * on an expired posting would have compiled, rendered as a live link, and
 * looked right in review. That is the silent failure AGENTS.md forbids.
 *
 * `never` makes the combination a compile error instead. A caller who wants a
 * link the reader cannot follow does not want a disabled link: they want no
 * link, so render the label as `Text` and say why it is unavailable.
 */
type ButtonAsLink = ButtonCommon & {
  readonly href: string;
  /**
   * Appends an external link marker and the security attributes. Set it
   * explicitly rather than sniffing the URL, so a relative href that proxies
   * offsite is still marked correctly.
   */
  readonly external?: boolean;
  /**
   * Turns off `next/link`'s prefetching for this one link.
   *
   * IT EXISTS FOR THE DOOR AT `/go` (spec 0008, AC-18). That route is a redirect
   * whose destination differs per visitor, so prefetching it would run the
   * landing rule on hover, before anyone asked to go anywhere. `false` stops
   * prefetching on entering the viewport AND on hover, per this version's own
   * `link.md`. Left unset everywhere else, where prefetching is the point.
   */
  readonly prefetch?: false;
  /**
   * Marks this link as the page the reader is already on, rendering
   * `aria-current="page"` (spec 0008, AC-5).
   *
   * PASSED IN, NEVER COMPUTED. No component here reads a pathname: the route
   * composing the navigation is the only thing that knows which page it is, so
   * it says so. That keeps the WCAG 2.2 AA commitment without a client boundary.
   */
  readonly current?: boolean;
  readonly disabled?: never;
  /** `type` is a button attribute; an anchor has no use for it. */
  readonly type?: never;
};

type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * A button, or a link that looks like one.
 *
 * Server component: it takes no `onClick`, because a click handler would drag
 * every page rendering it across the client boundary, and BINDING RULE 7 keeps
 * writes in Server Actions. A form submit uses `type="submit"` inside a form.
 */
export function Button(props: ButtonProps) {
  const { variant, size, label, className, children } = props;
  const classes = button({ variant, size, className });

  const content = (
    <>
      {children}
      {props.external === true ? <ExternalLinkIcon /> : undefined}
    </>
  );

  /**
   * `href` is the discriminant, so this narrows to `ButtonAsButton` and makes
   * `type` and `disabled` reachable. On the other side of the branch they are
   * `never`, which is what stops the anchor from being handed a state it cannot
   * express.
   */
  if (props.href === undefined) {
    return (
      <button
        type={props.type ?? "button"}
        disabled={props.disabled ?? false}
        aria-label={label}
        className={classes}
      >
        {content}
      </button>
    );
  }

  const { href, external = false, prefetch, current = false } = props;

  /**
   * `rel="noopener noreferrer"` on every external link: `noopener` closes the
   * `window.opener` handle the new tab would otherwise get on this page.
   */
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={classes}
      >
        {content}
      </a>
    );
  }

  /** Internal navigation goes through `next/link` so the route prefetches. */
  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-current={current ? "page" : undefined}
      aria-label={label}
      className={classes}
    >
      {content}
    </Link>
  );
}

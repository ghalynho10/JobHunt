import Link from "next/link";
import type { ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

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
    "transition-colors motion-reduce:transition-none",
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

type ButtonProps = VariantProps<typeof button> & {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Present means this renders as a link, absent means a real `<button>`. There
   * is no third state: a control that navigates is an anchor so it works with
   * middle click, and a control that acts is a button so it works with space.
   */
  readonly href?: string;
  /** Only meaningful without `href`. Defaults to `button`, never `submit`. */
  readonly type?: "button" | "submit";
  readonly disabled?: boolean;
  /**
   * Appends an external link marker and the security attributes. Set it
   * explicitly rather than sniffing the URL, so a relative href that proxies
   * offsite is still marked correctly.
   */
  readonly external?: boolean;
  /**
   * Overrides the accessible name when the visible label alone would not say
   * where the control goes ("Apply" on a card among twenty cards).
   */
  readonly label?: string;
};

/**
 * A button, or a link that looks like one.
 *
 * Server component: it takes no `onClick`, because a click handler would drag
 * every page rendering it across the client boundary, and BINDING RULE 7 keeps
 * writes in Server Actions. A form submit uses `type="submit"` inside a form.
 */
export function Button({
  variant,
  size,
  href,
  type = "button",
  disabled = false,
  external = false,
  label,
  className,
  children,
}: ButtonProps) {
  const classes = button({ variant, size, className });

  const content = (
    <>
      {children}
      {external ? <ExternalLinkIcon /> : undefined}
    </>
  );

  if (href === undefined) {
    return (
      <button
        type={type}
        disabled={disabled}
        aria-label={label}
        className={classes}
      >
        {content}
      </button>
    );
  }

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
    <Link href={href} aria-label={label} className={classes}>
      {content}
    </Link>
  );
}

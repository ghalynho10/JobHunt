/**
 * The icon set (spec 0005, AC-11). Plain SVG server components: no client
 * boundary, no icon library dependency, and no emoji or placeholder marks.
 *
 * All five are decorative by default and carry `aria-hidden`, because each one
 * sits beside text that already says what it means (a chip label, a provider
 * name, a link). An icon that ever stands alone as the only content of a
 * control is the caller's problem to label, on the control, not here.
 *
 * Size is a `className` the caller passes, defaulting to a value matched to the
 * text the icon sits next to; `currentColor` means an icon always inherits the
 * colour of that text rather than pinning its own, so the same icon works on
 * paper and on the dark sign in band without a variant.
 */

type IconProps = {
  /** Overrides the default size. Colour comes from `currentColor`, not here. */
  readonly className?: string;
};

/** Matched evidence: the filled half of the fill versus outline grammar. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className ?? "h-3 w-3 shrink-0"}
      aria-hidden="true"
    >
      <path
        d="M2.5 6.2 4.8 8.5 9.6 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A missing skill: the outline half of the grammar. Dashed, never red, per
 * `brand-tokens.md`. A gap is information, not an error.
 */
export function GapIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className ?? "h-3 w-3 shrink-0"}
      aria-hidden="true"
    >
      <circle
        cx="6"
        cy="6"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeDasharray="2 1.6"
      />
    </svg>
  );
}

/** GitHub, one of the two OAuth providers feature 7 builds against. */
export function GitHubIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? "h-[18px] w-[18px] shrink-0"}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * Google, the other OAuth provider. The only icon here that keeps its own
 * colours: Google's brand guidelines require the four colour mark, so it does
 * not take `currentColor` and does not invert on the dark sign in band.
 */
export function GoogleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-[18px] w-[18px] shrink-0"}
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

/**
 * Marks a link that leaves the product, most often the real job posting on the
 * source site. Decorative: `Button` gives an external link its own accessible
 * name, so this never carries the meaning on its own.
 */
export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className ?? "h-3 w-3 shrink-0"}
      aria-hidden="true"
    >
      <path
        d="M4.5 2h5.5v5.5M10 2 5 7M8 8.5V10H2V4h1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

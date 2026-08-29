/**
 * The brand colours the social preview image draws with (spec 0006, AC-11).
 *
 * WHY THESE ARE LITERALS AND NOT TAILWIND CLASSES. The image is rendered by
 * Satori, which takes inline styles and never sees a stylesheet, so it cannot
 * resolve `bg-paper` or read a CSS custom property. The values therefore have to
 * be duplicated out of `src/app/globals.css`, and a duplicated value drifts.
 *
 * `og-tokens.test.ts` reads the real values out of `globals.css` and fails if
 * any of these five stops matching, which is the same guard `tv.test.ts` puts
 * between the type scale and the same file (spec 0006, AC-16). The guard cannot
 * prevent the drift, only catch it, so fix the CSS side first and copy here.
 */
export const OG_COLORS = {
  /** Page canvas. `--paper` */
  paper: "#fffafb",
  /** Body and headline text. `--ink` */
  ink: "#1a1a1a",
  /** Secondary text. `--muted` */
  muted: "#6b717e",
  /** The match chip fill, the one warm accent on the card. `--accent-300` */
  accent: "#fcd581",
  /** The mark, and the darkest brand tone. `--primary-800` */
  primary: "#194646",
} as const;

/**
 * The token name in `globals.css` behind each key above. The test walks this
 * map rather than a hand written list, so adding a sixth colour here without a
 * matching CSS token is itself a failure rather than an untested value.
 */
export const OG_COLOR_TOKENS: Readonly<Record<keyof typeof OG_COLORS, string>> =
  {
    paper: "--paper",
    ink: "--ink",
    muted: "--muted",
    accent: "--accent-300",
    primary: "--primary-800",
  };

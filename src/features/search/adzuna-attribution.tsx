import { ADZUNA_ATTRIBUTION_URL, ADZUNA_JOBSWORTH_URL } from "./adzuna";
import {
  ADZUNA_GREEN,
  ADZUNA_LOGO_VIEWBOX,
  ADZUNA_MARK_PATH,
  ADZUNA_MARK_VIEWBOX,
  ADZUNA_WORDMARK_PATH,
} from "./adzuna-logo-geometry";

/**
 * Adzuna's two required attributions (spec 0013, AC-6 and AC-7).
 *
 * THESE ARE LICENCE TERMS, NOT DESIGN. Adzuna's own terms of service, read
 * directly on 2026-09-04, require the "Jobs by Adzuna" attribution on every
 * displayed advert at no less than 116 by 23 pixels, and a separate Jobsworth
 * attribution wherever a predicted salary is shown. Both minimum sizes are set
 * here as real `min-width`/`min-height` floors rather than left to whatever the
 * type happens to measure, so a later type scale change cannot silently shrink
 * the app out of its terms.
 *
 * PER DISPLAYED LISTING, NEVER PER SCREEN (invariant 4). A screen with zero
 * listings shows no attribution at all, because there is nothing to attribute.
 */

/**
 * The Adzuna wordmark, as outlined vector.
 *
 * `role="img"` with a real label, because the word "Adzuna" in the required
 * phrase IS this image: a decorative, `aria-hidden` mark would leave the
 * attribution reading "Jobs by" to a screen reader.
 */
function AdzunaWordmark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox={ADZUNA_LOGO_VIEWBOX}
      role="img"
      aria-label="Adzuna"
      className={className}
    >
      <path d={ADZUNA_WORDMARK_PATH} fill={ADZUNA_GREEN} fillRule="evenodd" />
      <path d={ADZUNA_MARK_PATH} fill={ADZUNA_GREEN} />
    </svg>
  );
}

/**
 * The "Jobs by Adzuna" attribution one listing carries (AC-6).
 *
 * The word "Jobs" is a link to Adzuna, and the word "Adzuna" is the logo
 * image, also linked, exactly as the terms word it. "by" sits between them
 * unlinked and is the only part that is plain text.
 *
 * The two links are separate anchors rather than one wrapping both, because
 * the terms ask for each of the two elements to be linked, and one anchor
 * around the whole phrase would swallow "by" into the link text.
 */
export function AdzunaAttribution() {
  return (
    <span className="inline-flex min-h-[23px] min-w-[116px] items-center gap-1 font-sans text-caption text-muted">
      <a
        href={ADZUNA_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:underline"
      >
        Jobs
      </a>
      <span>by</span>
      <a
        href={ADZUNA_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center"
      >
        {/* 18px tall against a 970 by 255 canvas, so roughly 68px wide. */}
        <AdzunaWordmark className="h-[18px] w-auto" />
      </a>
    </span>
  );
}

/**
 * The Jobsworth attribution, shown beside a predicted salary and nowhere else
 * (AC-7).
 *
 * A SEPARATE, VISUALLY DISTINCT BLOCK, and the terms are why. Adzuna states
 * this one with a fixed URL and no "or relevant local domain" alternative, so
 * `ADZUNA_JOBSWORTH_URL` is fixed rather than derived from the country
 * constant. The `title` carries the mouseover text the terms specify.
 *
 * The icon is 20 by 20 exactly, which the terms name, so it is a fixed size
 * rather than a relative one.
 */
export function JobsworthAttribution() {
  return (
    <a
      href={ADZUNA_JOBSWORTH_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Salary estimate powered by Adzuna Jobsworth"
      className="inline-flex items-center gap-1.5 font-sans text-caption text-muted underline-offset-2 hover:underline"
    >
      <svg
        viewBox={ADZUNA_MARK_VIEWBOX}
        aria-hidden="true"
        className="h-5 w-5 shrink-0"
      >
        <path d={ADZUNA_MARK_PATH} fill={ADZUNA_GREEN} />
      </svg>
      <span>Adzuna Jobsworth</span>
    </a>
  );
}

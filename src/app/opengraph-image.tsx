import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import {
  LOCKUP_VIEWBOX,
  MARK_RECTS,
  MARK_SCALE,
  WORDMARK_OFFSET_X,
  WORDMARK_PATH,
} from "@/components/ui/logo-geometry";
import { OG_COLORS } from "@/features/entry-page/og-tokens";

/**
 * The social preview card (spec 0006, AC-11).
 *
 * Generated from code rather than committed as a picture, for the reason the
 * type scale is generated rather than hand written: a value duplicated into a
 * binary drifts silently, and code can be guarded (see `og-tokens.ts` and its
 * test). Next renders this once at build time and caches it, because nothing
 * here touches a request, so it costs nothing per view.
 *
 * The mark is drawn as inline SVG rectangles rather than loaded as an image
 * file, which is possible only because the JobHunt mark is five rectangles on a
 * 32 unit grid. If Satori (the renderer behind `ImageResponse`) ever rejects
 * the inline SVG, the decided fallback is to read `public/mark-512.png` off
 * disk and embed it as a data URI; that is recorded in spec 0006's follow up so
 * the build never has to stop and ask.
 */

/** Describes what the card actually renders, for anyone who gets the alt text instead of the image. */
export const alt =
  "JobHunt. Shows its work, not just a score. An example match of 8 out of 11 skills.";

/** The Open Graph standard card size. */
export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

const FONT_FILE = "assets/SpaceGrotesk-SemiBold.ttf";

/**
 * The typeface, read off disk as raw bytes.
 *
 * WHY THE EXPLICIT THROW. `next/og` bundles `Geist-Regular.ttf` and falls back
 * to it when no font is supplied, so a missing Space Grotesk file does NOT fail
 * the build: it quietly ships a card in the wrong typeface that looks fine to
 * anyone who does not know the brand. That is the "default that reads like
 * success" the project's error model forbids, so the absence is turned into a
 * loud failure here rather than left to a build step that will not fire.
 *
 * Spec 0006's API surface table describes this as the build failing loudly,
 * which is the intent; this function is what makes it true.
 */
function spaceGroteskSemiBold(): Buffer {
  const path = join(process.cwd(), FONT_FILE);

  try {
    return readFileSync(path);
  } catch (cause) {
    throw new Error(
      `The social preview image needs ${FONT_FILE}, which is missing. ` +
        `Without it next/og silently falls back to its bundled Geist and ships ` +
        `an off brand card. Download Space Grotesk (SIL Open Font License 1.1), ` +
        `save the SemiBold static TTF to ${FONT_FILE}, and commit its licence ` +
        `file beside it (spec 0006, AC-15).`,
      { cause },
    );
  }
}

/** The lockup's aspect ratio, from its own viewBox. */
const LOCKUP_RATIO = 484.26 / 71.4;

/**
 * The full lockup, mark plus wordmark, from the same geometry `Logo` draws.
 *
 * The wordmark is here rather than the mark alone because a link card is often
 * the first time someone sees this product: an unfamiliar bracket glyph
 * identifies nothing, while the wordmark says the name. It costs no font bytes,
 * because the wordmark is outlines rather than text.
 */
function Lockup({ height }: { readonly height: number }) {
  return (
    <svg
      viewBox={LOCKUP_VIEWBOX}
      height={height}
      width={height * LOCKUP_RATIO}
      fill={OG_COLORS.primary}
    >
      <g transform={`scale(${MARK_SCALE})`}>
        {MARK_RECTS.map((r) => (
          <rect
            key={`${r.x}-${r.y}-${r.width}-${r.height}`}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
          />
        ))}
      </g>
      <path transform={`translate(${WORDMARK_OFFSET_X} 0)`} d={WORDMARK_PATH} />
    </svg>
  );
}

/**
 * Every size here is a fixed pixel value, not a token.
 *
 * The page's display size is a `clamp()`, which Satori cannot resolve, and a
 * link card is read at a glance at a fixed size anyway, so there is nothing for
 * a responsive scale to do. Only the colours are shared with the app, and only
 * those are drift guarded.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: OG_COLORS.paper,
        padding: 80,
        fontFamily: "Space Grotesk",
      }}
    >
      <Lockup height={54} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: OG_COLORS.ink,
            /**
             * Caps the measure so the headline breaks after "work," rather than
             * orphaning the article ("not just a / score."). Satori has no
             * `text-wrap: balance`, so the break point is set by width.
             */
            maxWidth: 660,
          }}
        >
          Shows its work, not just a score.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 44,
          }}
        >
          <div
            style={{
              display: "flex",
              backgroundColor: OG_COLORS.accent,
              color: OG_COLORS.ink,
              fontSize: 34,
              padding: "10px 22px",
              borderRadius: 12,
            }}
          >
            8 / 11
          </div>
          <div
            style={{ display: "flex", fontSize: 30, color: OG_COLORS.muted }}
          >
            skills matched, and the three that are not
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Space Grotesk",
          data: spaceGroteskSemiBold(),
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}

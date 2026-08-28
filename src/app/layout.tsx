import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { canonicalSiteUrl } from "@/lib/origin";

import "./globals.css";

/**
 * The two locked faces (spec 0005, AC-2; `docs/design/brand-tokens.md` picks
 * them and forbids a third). Loaded through `next/font/google` so the files are
 * self hosted at build time: no request to a Google domain at runtime, and no
 * layout shift while a webfont swaps in.
 *
 * `variable` rather than `className` on each: the class goes on `<html>`, which
 * is `:root`, and `globals.css` maps these two variables into `--font-sans` and
 * `--font-mono` inside its `@theme` block. Nothing else should reference them
 * directly.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  /** 400 body, 500 and 600 for display and emphasis, per brand-tokens.md. */
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  /** 400 / 500 / 600, the weights brand-tokens.md reserves for mono. */
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * The site's link identity (spec 0006, AC-10 and AC-12).
 *
 * `metadataBase` is `canonicalSiteUrl`, which is the PRODUCTION origin in every
 * environment including locally, never `currentOrigin()`. That is spec 0002's
 * split: a canonical link or a preview image URL pointing at a branch
 * deployment is wrong, so a metadata check run on a preview shows production
 * links and is meant to.
 *
 * Set here rather than on the page because these are site wide defaults every
 * later route should inherit; `template` gives those routes the suffix for free
 * without each one restating the product name. The page at `/` takes the
 * `default`.
 *
 * `robots` stays off. This is a link people are sent, not a page search engines
 * should index, and it will stay that way at least until accounts open. The
 * social preview card is unaffected, because unfurlers read `og:` tags and are
 * not search crawlers; that is checked by hand on a real deployment rather than
 * assumed (spec 0006's follow up list).
 */
export const metadata: Metadata = {
  metadataBase: new URL(canonicalSiteUrl),
  title: { default: "JobHunt", template: "%s · JobHunt" },
  description:
    "Ranks real job openings against your profile and shows which skills matched, which are missing, and why. Not a score you have to take on trust.",
  robots: { index: false, follow: false },
  /** The card is 1200 by 630, so it should render large rather than as a thumbnail. */
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

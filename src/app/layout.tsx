import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

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
 * Feature 6 owns the real page title, description and social preview image.
 * Nothing here should pre-empt it.
 */
export const metadata: Metadata = {
  title: "JobHunt",
  description: "Job search with the ranking reasoning shown.",
  /** Not a public site. Feature 6 confirms this alongside the real metadata. */
  robots: { index: false, follow: false },
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

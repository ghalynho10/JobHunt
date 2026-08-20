import type { Metadata } from "next";

import "./globals.css";

/**
 * Deliberately plain. Feature 5 ports the seven token palette and the real
 * typography (Space Grotesk and JetBrains Mono), and feature 6 owns the page
 * title, description and social preview image. Nothing here should pre-empt
 * either of them.
 */
export const metadata: Metadata = {
  title: "JobHunt",
  description: "Job search with the ranking reasoning shown.",
  /** Not a public site. Feature 6 confirms this alongside the real metadata. */
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

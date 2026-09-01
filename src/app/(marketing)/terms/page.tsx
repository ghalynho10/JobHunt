import type { Metadata } from "next";

import { LegalDocument } from "@/features/legal/legal-document";
import { TermsDocument } from "@/features/legal/terms-document";

/**
 * The terms of use (spec 0009, AC-1, AC-17, AC-20).
 *
 * COMPOSITION ONLY, and a static prerender shipping no client JavaScript, for
 * the same reasons recorded on `/privacy`.
 */
export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The agreement for using JobHunt: what it is, what it does not promise, what you may not do with it, and who owns what you write.",
  /**
   * AC-17: indexable, the second half of the deliberate exception described in
   * `../privacy/page.tsx`. Google needs to reach this URL too before the OAuth
   * app can leave Testing.
   */
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of use"
      summary="The agreement between you and the person who runs JobHunt. Short, because a free tool run by one person does not need a long one."
    >
      <TermsDocument />
    </LegalDocument>
  );
}

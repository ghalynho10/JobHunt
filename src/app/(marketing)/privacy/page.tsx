import type { Metadata } from "next";

import { LegalDocument } from "@/features/legal/legal-document";
import { PrivacyNotice } from "@/features/legal/privacy-notice";

/**
 * The privacy notice (spec 0009, AC-1, AC-17, AC-20).
 *
 * COMPOSITION ONLY, the same rule the entry page's route follows. Every word is
 * in `src/features/legal/`, and the two lists it prints come from registries a
 * test binds to the schema and to `src/env.ts`.
 *
 * A STATIC PRERENDER SHIPPING NO CLIENT JAVASCRIPT (AC-1). Nothing on this page
 * reads the session, queries the database or opens a Sentry span: binding rule
 * 4 asks for a named span where a failure rate matters, and a static document
 * has no failure to rate.
 */
export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What JobHunt stores about you, which other companies see it, how long it is kept, and how to have all of it removed.",
  /**
   * AC-17: INDEXABLE, WHICH IS THE OPPOSITE OF EVERY OTHER ROUTE. The root
   * layout sets `index: false` site wide, and this page and `/terms` are the
   * two that deliberately opt back in.
   *
   * The reason is not search traffic. Google will not accept a privacy policy
   * URL it cannot reach and read, and the OAuth app stays capped at 100 users
   * for its whole lifetime until it can. A later reader could easily mistake
   * this asymmetry for drift, so it is written down here rather than inferred.
   *
   * Do not widen it. The two legal pages are the whole exception.
   */
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy notice"
      summary="What is stored about you, who else sees it, and how to have it all removed. Written from the code that stores it rather than from a template, so every claim here is one you can check."
    >
      <PrivacyNotice />
    </LegalDocument>
  );
}

import { AboutSection } from "@/features/entry-page/about-section";
import { EntryFooter } from "@/features/entry-page/entry-footer";
import { EntryHeader } from "@/features/entry-page/entry-header";
import { HeroSection } from "@/features/entry-page/hero-section";
import { HowItWorksSection } from "@/features/entry-page/how-it-works-section";
import { ReasoningSection } from "@/features/entry-page/reasoning-section";
import { SignInBand } from "@/features/entry-page/sign-in-band";

/**
 * The entry page (spec 0006). A public route: no session required, so it lives
 * in the `(marketing)` group whose layout does not check one.
 *
 * COMPOSITION ONLY. Every section is its own module and this file is the order
 * they run in, which is the one thing that cannot live in any of them. Read top
 * to bottom it is also the page's whole rhythm and background plan (AC-2, AC-3):
 *
 *   hero          generous   paper    no divider
 *   how it works  compact    sunken   no divider  (ground changed)
 *   the reasoning generous   sunken   HAIRLINE    (ground did not change)
 *   about         standard   paper    no divider  (ground changed)
 *   sign in       standard   dark     no divider  (ground changed)
 *
 * Exactly one hairline, and it is on the reasoning section. A second one
 * anywhere means the alternation above was edited without reapplying spec
 * 0005's adjacency rule.
 *
 * NO CLIENT JAVASCRIPT IN THIS TREE (AC-4), and nothing added here may
 * introduce it. The prototype was a client component to hold a mobile menu open
 * and to run a scroll reveal; both are gone, so this is a static prerender that
 * ships no bundle.
 */
export default function HomePage() {
  return (
    <>
      {/*
       * AC-5a: the in page anchors render on `/` and nowhere else, because `/`
       * is the only marketing page that has those sections.
       */}
      <EntryHeader navigation="anchors" />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <ReasoningSection />
        <AboutSection />
        <SignInBand />
      </main>
      <EntryFooter />
    </>
  );
}

import { EntryFooter } from "@/features/entry-page/entry-footer";
import { EntryHeader } from "@/features/entry-page/entry-header";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";

/**
 * The entry page (spec 0006). A public route: no session required, so it lives
 * in the `(marketing)` group whose layout does not check one.
 *
 * STATE OF THE BUILD: this is the Tracer Bullet thread from spec 0006's build
 * plan, step 2. Header, footer and metadata are real; the five body sections
 * arrive in steps 4 through 9. The point of landing it this thin is that the
 * whole link path (page renders, metadata resolves, the generated preview image
 * builds and unfurls) is proved on a real deployment before five sections are
 * stacked on top of it.
 *
 * No `"use client"` anywhere in this tree, and nothing added here may introduce
 * one (AC-4).
 */
export default function HomePage() {
  return (
    <>
      <EntryHeader />
      <main className="flex-1">
        <Section weight="generous" background="paper" divider="none">
          <Heading level={1}>Job search that shows its work.</Heading>
        </Section>
      </main>
      <EntryFooter />
    </>
  );
}

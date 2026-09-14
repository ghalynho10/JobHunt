import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { DEMO_COPY } from "@/features/demo/copy";
import { DemoCard } from "@/features/demo/demo-card";
import { DEMO_PERSONAS, parseDemoPersona } from "@/features/demo/personas";
import { readDemoResults } from "@/features/demo/queries";
import { EntryHeader } from "@/features/entry-page/entry-header";
import { isFailure } from "@/lib/result";

/**
 * The public demo (spec 0021, AC-1, AC-5, AC-10, AC-11, AC-12).
 *
 * NO SIGN IN, NO SESSION READ, NO REDIRECT (AC-1). This page never asks who is
 * reading it. It sits under `(marketing)` rather than `(app)` precisely so the
 * protected layout's session check is nowhere above it.
 *
 * IT SPENDS NOTHING (AC-2). One Postgres select against twelve fixed rows. No
 * Adzuna call, no model call, no usage gate, because there is no metered call
 * here to gate. A link to this page can be shared as widely as anyone likes and
 * the cost does not move.
 *
 * IT SHIPS NO CLIENT JAVASCRIPT. The profile switcher is two ordinary links and
 * everything else is server rendered, so this page keeps the contract `/` and
 * `/sign-in` hold and `/search` had to give up for the apply control.
 *
 * IT COMPOSES ITS OWN HEADER with an empty navigation slot, the same value
 * `/sign-in` and `/ui-preview` pass (spec 0008, AC-3a). A marketing layout
 * could not do it: a layout never learns the pathname, and this page must not
 * render the entry page's in page anchors, whose targets do not exist here.
 */
export const metadata: Metadata = {
  title: "Demo",
  description:
    "See how JobHunt ranks openings, on a fixed set of sample listings, with no sign up. The same listing scored for two different candidates.",
  /**
   * AC-11, STATED HERE RATHER THAN INHERITED, and the duplication is on
   * purpose. The root layout already sets `index: false` site wide, so this
   * page would be excluded today without this line. But that default is
   * explicitly temporary: `layout.tsx`'s own comment says it holds "at least
   * until accounts open", and `/privacy` and `/terms` have already opted back
   * in. When somebody flips the site wide default, every page that was relying
   * on it becomes indexable at once, silently. This page must not, so it says
   * so itself rather than depending on a decision another file is expected to
   * change.
   */
  robots: { index: false, follow: false },
};

export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const { persona } = await searchParams;

  /**
   * AC-5: parsed at this boundary, and anything that is not exactly one of the
   * two known slugs becomes the default rather than an error. The raw value is
   * never echoed back onto the page.
   */
  const active = parseDemoPersona(persona);
  const activeLabel =
    DEMO_PERSONAS.find((entry) => entry.slug === active)?.label ?? active;

  const results = await readDemoResults(active);

  return (
    <>
      <EntryHeader navigation="none" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>See it on sample results</Heading>

          <Text className="mt-3">
            This is what JobHunt shows after a search: each opening ranked
            against one candidate, with the skills that matched and the
            reasoning behind the band. Two listings below appear under both
            profiles, scored differently, because the score is about the person
            and not just the posting.
          </Text>

          {/*
           * AC-10, ABOVE THE RESULTS RATHER THAN BELOW THEM. A reader who
           * scrolls, reads three cards and leaves must have already passed
           * this sentence; a disclaimer under the fold is a disclaimer for
           * whoever was going to read the whole page anyway.
           *
           * A LEFT RULE AND NO BOX. A rounded, bordered container composed
           * here by hand is what `eslint.config.mjs`'s `no-restricted-syntax`
           * rule catches outside `src/components/ui/`, per spec 0005's
           * standard definition, and this note does not warrant a new design
           * system primitive of its own.
           *
           * NOT `role="alert"`. Nothing has gone wrong and nothing changed
           * after load; it is a standing fact about the page, so it reads in
           * document order like the rest of the prose.
           */}
          <div className="mt-6 border-l-4 border-primary-800 pl-4">
            <Text>{DEMO_COPY.banner}</Text>
          </div>

          {/*
           * AC-5's switcher. A `nav` with its own name, because two bare links
           * in a row tell a screen reader nothing about what switching does.
           */}
          <nav
            aria-label={DEMO_COPY.personaSwitcherLabel}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <Text as="span" variant="eyebrow">
              {DEMO_COPY.personaSwitcherLabel}
            </Text>

            {DEMO_PERSONAS.map((entry) =>
              entry.slug === active ? (
                /*
                 * THE ACTIVE PROFILE IS TEXT, NOT A LINK, and that is AC-5
                 * rather than a style choice. A link to the page you are
                 * already on is a control that does nothing, and it is one
                 * more stop in the tab order that spends a keyboard reader's
                 * time to arrive nowhere. `aria-current="page"` is what says
                 * which of the two this is.
                 */
                /*
                 * `aria-current` SITS ON A PLAIN `span` WRAPPING `Text`, NOT
                 * ON `Text` ITSELF, and this is a trap worth naming. `Text`
                 * accepts four props and forwards no others, so an
                 * `aria-current` passed to it is silently dropped. TypeScript
                 * does not catch that: it skips prop checking for any JSX
                 * attribute whose name contains a hyphen, so the first version
                 * of this typechecked, linted and rendered with the marker
                 * simply missing. Found by reading the served HTML.
                 */
                <span key={entry.slug} aria-current="page">
                  <Text as="span" variant="monoLabel" className="text-ink">
                    {entry.label}
                  </Text>
                </span>
              ) : (
                <Button
                  key={entry.slug}
                  variant="tertiary"
                  size="sm"
                  href={`/demo?persona=${entry.slug}`}
                >
                  {entry.label}
                </Button>
              ),
            )}
          </nav>

          <Heading level={2} className="mt-10">
            {`Ranked for the ${activeLabel.toLowerCase()} profile`}
          </Heading>

          {isFailure(results) ? (
            /*
             * AC-12. A NORMAL 200 AND A VISIBLE SENTENCE, never an empty list
             * and never a thrown error. An empty list would read as a working
             * product with nothing in it, which on this page would be the
             * worst possible first impression and would also be a lie.
             *
             * `role="alert"` here and not on the banner above: this one IS a
             * failure, and it is the same shape `/sign-in` uses for its own.
             * There is only ever one of these on the page, so the objection
             * that stops the real result cards using it does not apply.
             *
             * The failure is already reported to Sentry by `failure()` at the
             * point it happened, so nothing is logged again here.
             */
            <div role="alert" className="mt-6 border-l-4 border-red-700 pl-4">
              <Text>{DEMO_COPY.readFailed}</Text>
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {results.value.map((result) => (
                <li key={result.id}>
                  <DemoCard result={result} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </>
  );
}

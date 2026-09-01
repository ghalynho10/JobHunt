import type { ReactNode } from "react";

import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { EntryFooter } from "@/features/entry-page/entry-footer";
import { EntryHeader } from "@/features/entry-page/entry-header";

import { formatEffectiveDate } from "./publication";

/**
 * The shell both legal notices wear (spec 0009, AC-1, AC-16, AC-20).
 *
 * NO CLIENT JAVASCRIPT, EVER, IN THIS TREE (invariant 3). Both pages are static
 * prerenders that ship no bundle, the same contract spec 0006 AC-4 holds the
 * entry page to and spec 0007 holds `/sign-in` to. A document nobody interacts
 * with has nothing to gain from a client boundary and everything to lose.
 *
 * IT COMPOSES `EntryHeader` ITSELF RATHER THAN LEANING ON A LAYOUT, for the
 * constraint spec 0008 AC-3a records: a layout never learns the pathname, so it
 * could not know to render `navigation="none"` here and the entry page's in
 * page anchors on `/`. Reading the pathname to work around it would need client
 * JavaScript, which is the thing being avoided.
 *
 * THE PROSE IS HELD IN CONSTANTS, NOT WRITTEN INLINE. That is this repository's
 * existing convention (`about-section.tsx`, `hero-section.tsx`) and it is also
 * forced: `react/no-unescaped-entities` rejects a raw apostrophe in JSX text,
 * and a legal notice is mostly sentences with apostrophes in them.
 */

interface LegalDocumentProps {
  /** The document's own `h1`. There is exactly one per page (AC-20). */
  readonly title: string;
  /** The one sentence under the title, saying what this document is. */
  readonly summary: string;
  readonly children: ReactNode;
}

/** A full legal notice page: header, titled document, footer. */
export function LegalDocument({
  title,
  summary,
  children,
}: LegalDocumentProps) {
  return (
    <>
      {/* AC-5a: no in page anchors, because this page has none of those sections. */}
      <EntryHeader navigation="none" />

      <main className="flex-1">
        <Section weight="standard">
          {/*
           * `max-w-[65ch]` on the wrapper as well as on each paragraph. `Text`
           * already caps its own measure, but a heading does not, and a heading
           * running the full width of a 6xl column above a 65ch paragraph reads
           * as two different documents.
           */}
          <article className="max-w-[65ch]">
            <Heading level={1}>{title}</Heading>

            <Text className="mt-4">{summary}</Text>

            {/*
             * AC-16: the effective date, on both pages. It is what makes "the
             * version currently published" a checkable claim rather than a
             * phrase, since these notices change by being updated in place.
             *
             * `monoLabel` is the register for a literal the product states, and
             * a date is the example that variant names.
             */}
            <Text variant="monoLabel" className="mt-6">
              In effect from {formatEffectiveDate()}
            </Text>

            <div className="mt-12 flex flex-col gap-10">{children}</div>
          </article>
        </Section>
      </main>

      {/* AC-1: both notices carry the same footer as every other public page. */}
      <EntryFooter />
    </>
  );
}

interface LegalClauseProps {
  /** The clause heading, an `h2`, keeping the outline in order (AC-20). */
  readonly heading: string;
  readonly children: ReactNode;
}

/** One numbered-in-spirit clause of a notice: a heading and its body. */
export function LegalClause({ heading, children }: LegalClauseProps) {
  return (
    <section>
      <Heading level={2}>{heading}</Heading>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** A sub heading inside a clause, an `h3`, so the outline never skips a level. */
export function LegalSubheading({ children }: { readonly children: string }) {
  return (
    <Heading level={3} className="mt-2">
      {children}
    </Heading>
  );
}

/** Running prose: one paragraph per string, in order. */
export function Paragraphs({
  children,
}: {
  readonly children: readonly string[];
}) {
  return (
    <>
      {children.map((paragraph) => (
        <Text key={paragraph}>{paragraph}</Text>
      ))}
    </>
  );
}

/**
 * A plain bulleted list.
 *
 * `list-disc` with the marker outside the text column, so a wrapped item lines
 * up under its own first word rather than under the bullet.
 */
export function BulletList({
  children,
}: {
  readonly children: readonly string[];
}) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-2">
      {children.map((item) => (
        <Text as="li" key={item}>
          {item}
        </Text>
      ))}
    </ul>
  );
}

/**
 * An inline link inside running prose.
 *
 * A RAW ANCHOR RATHER THAN `Button`, deliberately. `Button` is the design
 * system's one sanctioned CONTROL, and it renders as one; a link sitting inside
 * a sentence is not a control and styling it as one would break the sentence in
 * half. The focus ring is not skipped by doing this: `globals.css` owns a single
 * `:focus-visible` ring for the whole document, so this anchor gets the same one
 * every control gets (AC-20).
 *
 * Underlined rather than coloured alone, because colour by itself is not a
 * distinction in a forced palette or to a reader who cannot separate the hues.
 */
export function InlineLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: string;
}) {
  return (
    <a
      href={href}
      className="text-ink underline decoration-from-font underline-offset-2"
    >
      {children}
    </a>
  );
}

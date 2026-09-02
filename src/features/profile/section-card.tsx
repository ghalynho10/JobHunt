import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";

/**
 * One profile section, as a card with its heading and its own control.
 *
 * ONE SHELL FOR THE FOUR SECTIONS, so they cannot drift into looking like four
 * different kinds of thing. It also fixes the heading level at 2 in one place,
 * which is what keeps the page's outline the single `h1` plus four peer `h2`
 * shape `COPY-2` describes and AC-17's heading pass checks.
 *
 * `flat` rather than `elevated`, matching the entry page's status card: these
 * are content blocks on one page, and nothing here is the page's claim. Spec
 * 0005's flat idiom is border led, so the hairline does the separating.
 */

interface SectionCardProps {
  /** The `h2`. One of `COPY-2`'s four, never invented at the call site. */
  readonly heading: string;
  /**
   * The section's own control, usually an Edit link. `undefined` while the
   * section is already open for editing: a control that reopens what is open is
   * a control that cannot do anything.
   */
  readonly control?: ReactNode;
  readonly children: ReactNode;
}

export function SectionCard({ heading, control, children }: SectionCardProps) {
  return (
    <Card tone="flat" as="section">
      <Card.Header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Heading level={2}>{heading}</Heading>
          {control}
        </div>
      </Card.Header>
      <Card.Body>{children}</Card.Body>
    </Card>
  );
}

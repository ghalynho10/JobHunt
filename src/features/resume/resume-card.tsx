import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Text } from "@/components/ui/text";
import { formatLongDate } from "@/lib/dates";
import { isFailure, type Result } from "@/lib/result";

import {
  READ_FAILURES,
  RESUME_CARD_EMPTY,
  RESUME_CARD_LINK,
  resumeCard,
} from "./copy";
import type { ResumeHistory } from "./queries";

/**
 * The resume card on `/profile` (spec 0024, AC-10).
 *
 * NO HEADING, ON PURPOSE (`COPY-25`). `/profile` is pinned at one `h1` and four
 * `h2` headings by spec 0010 AC-17 and `src/features/profile/copy.test.ts`, and
 * the card's own sentence already opens with "Resume:" (`COPY-12`).
 *
 * IT TAKES THE READ'S RESULT, NOT THE ROWS. The page does the reading, the same
 * as every other section there, and a failed read reaches this card as a
 * failure so only the card says so and the rest of `/profile` renders normally.
 *
 * RENDERED ONLY ONCE A PROFILE ROW EXISTS. The first run screen renders no
 * section card at all (spec 0010 AC-1), and this one joins that rule by being
 * composed only on the page's full view.
 */
export function ResumeCard({
  history,
}: {
  readonly history: Result<ResumeHistory>;
}) {
  return (
    <Card tone="flat">
      <ResumeCardBody history={history} />
    </Card>
  );
}

function ResumeCardBody({
  history,
}: {
  readonly history: Result<ResumeHistory>;
}) {
  /**
   * `COPY-29`. No link beside it: the card cannot say which state the resume
   * is in, and `COPY-26`'s two labels each claim one.
   */
  if (isFailure(history)) return <FieldError>{READ_FAILURES.card}</FieldError>;

  const newest = history.value.versions[0];

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <Text>
        {newest === undefined
          ? RESUME_CARD_EMPTY
          : resumeCard(
              newest.versionNumber,
              formatLongDate(newest.createdAt) ?? newest.createdAt,
            )}
      </Text>
      <Button variant="tertiary" href="/resume">
        {newest === undefined
          ? RESUME_CARD_LINK.empty
          : RESUME_CARD_LINK.existing}
      </Button>
    </div>
  );
}

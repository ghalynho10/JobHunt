/**
 * Formatting two features share for the same listing values (spec 0014).
 *
 * WHY THESE LEFT `src/features/search/result-card.tsx`. `/search` renders a
 * live listing and `/applications` renders the stored snapshot of one, and both
 * must render the same pay and the same posted date the same way. A second copy
 * in the applications feature would be two implementations of one rule, and the
 * rule is load bearing: spec 0013 AC-7 and spec 0014 AC-7 both turn on a
 * predicted figure never reading like a stated one.
 *
 * NEITHER TAKES A `Listing`, and that is the point. They take the narrowest
 * shape they actually read, so a stored `application` row satisfies them without
 * being mapped back into a shape it is not. A `Listing` parameter would have
 * forced the applications feature to fake one.
 *
 * STORE RAW, FORMAT AT RENDER (`AGENTS.md`). Both of these run at render time
 * against raw stored values. Nothing here is ever written to the database.
 */

/**
 * What `salaryText` needs to know, and nothing more.
 *
 * A live `Listing` and a stored `application` row both satisfy it structurally.
 */
export interface SalaryFigures {
  readonly salaryMin: number | undefined;
  readonly salaryMax: number | undefined;
  /** Present exactly when either figure is (spec 0003, AC-9). */
  readonly salaryCurrency: string | undefined;
}

/**
 * The salary line, or `undefined` when no figure was stated at all.
 *
 * Returns `undefined` rather than a placeholder, so the row disappears instead
 * of claiming a figure this app does not have (spec 0013, invariant 7). A dash
 * beside "Salary" reads as real information about the pay; an omitted row reads
 * as what it is, which is that the source did not say.
 *
 * The `(estimated)` label is deliberately NOT added here. It is the caller's
 * job, because the caller is the one that also has to render the Jobsworth
 * attribution beside it, and the two must never come apart.
 */
export function salaryText(figures: SalaryFigures): string | undefined {
  if (figures.salaryCurrency === undefined) return undefined;

  const format = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: figures.salaryCurrency,
      maximumFractionDigits: 0,
    }).format(amount);

  if (figures.salaryMin !== undefined && figures.salaryMax !== undefined) {
    return `${format(figures.salaryMin)} to ${format(figures.salaryMax)}`;
  }

  if (figures.salaryMin !== undefined)
    return `from ${format(figures.salaryMin)}`;
  if (figures.salaryMax !== undefined)
    return `up to ${format(figures.salaryMax)}`;

  return undefined;
}

/**
 * The posted date, computed at render from the raw timestamp.
 *
 * Returns `undefined` rather than a placeholder when the timestamp is absent
 * or unparseable, so the row disappears instead of claiming a date this app
 * does not have.
 *
 * @param now Passed in rather than read here, so the relative date has one
 * source per render and a test can state what "now" is instead of racing the
 * clock.
 */
export function relativePostedAt(
  postedAt: string | undefined,
  now: Date,
): string | undefined {
  if (postedAt === undefined) return undefined;

  const posted = new Date(postedAt);

  if (Number.isNaN(posted.getTime())) return undefined;

  const elapsedMs = posted.getTime() - now.getTime();
  const elapsedDays = Math.round(elapsedMs / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  /**
   * Days, and hours only inside the first day. Adzuna's `created` is a
   * posting date, so a finer unit would be precision this app cannot stand
   * behind, and a coarser one would collapse "today" and "last week".
   */
  if (Math.abs(elapsedDays) >= 1) {
    return `posted ${formatter.format(elapsedDays, "day")}`;
  }

  const elapsedHours = Math.round(elapsedMs / 3_600_000);
  return `posted ${formatter.format(elapsedHours, "hour")}`;
}

/**
 * The date an application was recorded, as an absolute date.
 *
 * DELIBERATELY NOT RELATIVE, unlike the posted date above (spec 0014, AC-18).
 * "applied 3 days ago" is useful for about a week and useless afterwards, and
 * an applications list is an archive that is read months later. The posted date
 * stays relative because its whole meaning is freshness.
 *
 * Returns `undefined` on an unparseable value rather than rendering the raw
 * string, on the same reasoning as `relativePostedAt`.
 */
export function appliedOnText(appliedAt: string): string | undefined {
  const applied = new Date(appliedAt);

  if (Number.isNaN(applied.getTime())) return undefined;

  return `applied ${new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(applied)}`;
}

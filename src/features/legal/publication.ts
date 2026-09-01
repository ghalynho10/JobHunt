/**
 * Who publishes these two notices, how to reach them, and when the current text
 * took effect (spec 0009, AC-8, AC-11, AC-16).
 *
 * ONE HOME FOR THE FACTS BOTH PAGES STATE. The contact address appears on the
 * privacy notice three times and on the terms once, and the effective date
 * appears on both. Written here rather than in the prose so the four cannot
 * drift into disagreeing about the same fact, which is the failure shape
 * `hero-section.tsx` already shipped once with a hand written count.
 */

/** The service these notices govern (AC-11). */
export const SERVICE_NAME = "JobHunt";

/**
 * The person responsible for the data, and where they live (AC-11).
 *
 * Named rather than described as a company, because there is no company. A
 * privacy notice that implies an entity that does not exist is the first
 * factual error a reader can check.
 */
export const RESPONSIBLE_PARTY = "Ghaly Nicolas Jules";

/** The country the responsible party is resident in (AC-11, and AC-12's transfer picture). */
export const RESPONSIBLE_PARTY_COUNTRY = "the United States";

/**
 * The published address for deletion and data requests (AC-8, AC-9).
 *
 * A REAL MAILBOX, NOT A PLACEHOLDER. Invariant 4: an address on a permanent
 * public page that nobody reads is a silent failure, which this project's rules
 * forbid. Delivery was configured and verified on 2026-09-01, and `verify.md`
 * re confirms it rather than trusting the date, because an address that stops
 * delivering does so without telling anyone.
 */
export const CONTACT_EMAIL = "contact@usejobhunt.dev";

/**
 * The date the currently published text took effect (AC-16).
 *
 * UPDATED BY HAND, and only when the text changes materially. AC-15 settles
 * that the notices change by being updated in place with this date bumped,
 * because there is no email capability to give advance notice with, and AC-16
 * makes continued use the acceptance mechanism. Bumping it for a typo would
 * make the date meaningless, which is the one thing that stops it being useful.
 *
 * Stored as the raw ISO date and formatted at render, per the project's store
 * raw rule.
 */
export const EFFECTIVE_DATE = "2026-09-01";

/**
 * The effective date as a reader sees it, for example `1 September 2026`.
 *
 * `en-GB` with an explicit UTC time zone: the date is a published fact, not a
 * moment in the reader's day, so it must read the same in every time zone. A
 * naive `new Date("2026-09-01")` parses as midnight UTC and would print the
 * previous day for any reader west of Greenwich.
 */
export function formatEffectiveDate(isoDate: string = EFFECTIVE_DATE): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

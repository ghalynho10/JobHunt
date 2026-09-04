import type { UsageGateReason } from "./gate";

/**
 * The usage gate's five sentences (spec 0011, `## Copy`).
 *
 * WRITTEN BY THE ENGINEER, USED VERBATIM. Every string below is copied
 * character for character from what the engineer gave `/develop`, mirroring
 * `src/features/auth/copy.ts`: the spec says in terms that `/develop` must
 * not invent or reword any of them, so a change here is a spec change first,
 * not an edit.
 *
 * FEATURE 10 OWNS THE REASON CODE AND ITS SENTENCE; RENDERING IT IS FEATURE
 * 11'S WORK, since this feature ships no search UI itself. `SENTENCES` is
 * exported directly, unlike `auth/copy.ts`'s private map, because there is no
 * raw, unparsed value to classify here: `checkUsageGate()` already returns a
 * validated `UsageGateReason`, so a caller indexes straight into this map.
 */
export const SENTENCES: Readonly<Record<UsageGateReason, string>> = {
  /**
   * `COPY-1`. Names the window (a week) and implies it resets, without
   * stating the exact day, per the spec's own guidance for this slot.
   */
  account_week_cap_reached:
    "You've used your search allowance for this week. It resets at the start of next week.",
  /**
   * `COPY-2`. LEADS WITH "for everyone, not just you", per the spec's own
   * guidance: the remedy is "try again tomorrow", and the sentence must not
   * suggest it was the person's own usage that caused it. That framing is
   * load bearing, not a style choice.
   */
  global_day_cap_reached:
    "Search has hit its daily limit for everyone, not just you. Try again tomorrow.",
  /**
   * `COPY-3`. THE SAME "for everyone, not just you" framing as `COPY-2`, for
   * the same reason. The remedy here is materially longer, and the sentence
   * deliberately does not promise a specific reset date.
   */
  global_month_cap_reached:
    "Search has hit its monthly limit for everyone, not just you. It will be a while before it's available again.",
  /**
   * `COPY-4`. A DELIBERATE, OPERATOR INITIATED PAUSE, AND THE SENTENCE SAYS
   * SO ("That is deliberate, not a fault"). This is the whole reason spec
   * 0011 splits `kill_switch_engaged` from `kill_switch_unavailable`
   * (`COPY-5`) rather than collapsing them into one "search is down" reason:
   * a flip a human chose and a read that broke are different events, and only
   * one of them is the system working as intended. A later edit that merges
   * these two reasons back into one should have to see why they were split.
   */
  kill_switch_engaged:
    "Search is switched off at the moment. That is deliberate, not a fault, and it will be turned back on.",
  /**
   * `COPY-5`. THIS ONE ADMITS SOMETHING IS WRONG, unlike `COPY-4`, and claims
   * no reset time on purpose: unlike a deliberate pause, nobody knows when a
   * broken read will be fixed, and promising one would be a claim the code
   * cannot back up.
   */
  kill_switch_unavailable:
    "Search isn't working right now, and the reason isn't clear yet. Nothing you did caused this. Try again later.",
};

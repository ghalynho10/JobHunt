import "server-only";

import {
  readOwnProfile,
  readProfileSections,
} from "@/features/profile/queries";
import { isFailure } from "@/lib/result";

import { boundProfile, type ScoringProfile } from "./rubric";

/**
 * Whether this caller can be scored at all, and what to score them against.
 *
 * THREE OUTCOMES, NOT TWO, because a profile that could not be read is a
 * different thing from a profile with nothing in it and the reader has to be
 * told which happened (`AGENTS.md`: a failure is never a default that reads
 * like success). Collapsing `unavailable` into `thin` would tell somebody with
 * a full profile to go and fill it in, during a database outage.
 */
export type ScoringProfileOutcome =
  | { readonly kind: "score"; readonly profile: ScoringProfile }
  | { readonly kind: "thin" }
  | { readonly kind: "unavailable" };

/**
 * The AC-7 gate: read the caller's own profile and decide whether scoring runs
 * (spec 0015).
 *
 * A PROFILE WITH ZERO SKILLS AND ZERO WORK HISTORY IS NEVER SCORED. There is
 * nothing to compare a posting against, so twenty model calls would each spend
 * budget to invent a judgment out of an empty profile, and every one of the
 * five bands would be a claim the app cannot stand behind. Either section on
 * its own is enough: skills with no work history, or work history with no
 * skills, both score normally.
 *
 * IT LAYERS ONTO SPEC 0008'S LANDING RULE, IT DOES NOT WIDEN IT (scope.md's own
 * constraint, recorded from spec 0008 on 2026-08-31). `landing_rule.decide`
 * reads profile row existence and nothing else, deliberately, so one place
 * decides where a signed in visitor lands. This gate lives at a caller of that
 * rule, on `/search`, and changes what that page renders rather than where the
 * visitor ends up: a thin profile still lands on `/search`. Teaching the
 * landing rule about profile sufficiency instead is how it becomes the
 * onboarding flow `docs/app-shell-direction.md` ruled out.
 *
 * `record_not_found` IS `thin`, NOT `unavailable`. No profile row at all is
 * zero skills and zero work history by definition, which is exactly the state
 * this gate exists to catch, and `readOwnProfile()` reports a missing row as an
 * expected failure rather than an outage.
 *
 * THE TWO READS RUN IN SEQUENCE, NOT CONCURRENTLY. `readProfileSections()`
 * documents that it is called only once `readOwnProfile()` has resolved a row,
 * and the second read is three concurrent queries of its own, so the cost of
 * honouring that is one round trip on a page that has already made an outbound
 * HTTP call to Adzuna.
 */
export async function readScoringProfile(): Promise<ScoringProfileOutcome> {
  const profile = await readOwnProfile();

  if (isFailure(profile)) {
    return profile.kind === "record_not_found"
      ? { kind: "thin" }
      : { kind: "unavailable" };
  }

  const sections = await readProfileSections();

  if (isFailure(sections)) return { kind: "unavailable" };

  if (
    sections.value.skills.length === 0 &&
    sections.value.experience.length === 0
  ) {
    return { kind: "thin" };
  }

  return {
    kind: "score",
    profile: boundProfile(profile.value, sections.value),
  };
}

import "server-only";

import type { CookieMethodsServer } from "@supabase/ssr";

import type { Listing } from "@/features/search/adzuna";
import { callTier } from "@/lib/ai/client";
import { isFailure, success, type Result } from "@/lib/result";
import type { UsageGateReason } from "@/lib/usage-gating/gate";

import {
  SCORING_SYSTEM_PROMPT,
  buildScoringPrompt,
  fitScoreSchema,
  normalizeFitScore,
  type FitScore,
  type ScoringProfile,
} from "./rubric";

/**
 * One listing's outcome: a score, a gate refusal, or a failure.
 *
 * THE THREE ARE STRUCTURALLY DISTINCT, not three readings of one shape (spec
 * 0015, key invariants, extending spec 0012's own). A refusal is a `Result`
 * success carrying `allowed: false`, so the usage gate working exactly as
 * designed never lands in `ai.call_tier`'s failure ratio, and the UI can render
 * a cap at page level (AC-11) while rendering a vendor error on one card
 * (AC-10) without either having to guess which happened.
 */
export type ScoreOutcome = Awaited<ReturnType<typeof scoreListing>>;

/**
 * Score one listing against one bounded profile (spec 0015, AC-3, AC-5).
 *
 * EXACTLY ONE `callTier("ai_scoring", …)` PER LISTING, NEVER BATCHED (AC-3).
 * That is spec 0012's settled call shape and it is not a performance oversight:
 * one call per listing is what lets `usage_cap` count real work, what lets one
 * listing fail without taking the other nineteen with it (AC-10), and what
 * keeps a single prompt small enough to stay inside `ai_scoring`'s own output
 * ceiling. `scoreListings()` fires these concurrently; it does not merge them.
 *
 * NO SPAN OF ITS OWN, DELIBERATELY. `callTier()` already opens `ai.call_tier`
 * as its first statement, and this function adds a prompt string and a filter
 * around it and nothing else that can fail on its own. A second name here would
 * split one operation's failure ratio across two denominators, the same reason
 * spec 0010 gives for `profile.save_work_experience` covering two operations
 * under one name. The batch's own span is `scoring.score_listings` (AC-14).
 *
 * THE GATE IS `callTier()`'S, NOT THIS FUNCTION'S. `checkUsageGate()` verifies
 * the caller through `getClaims()` before any vendor is reached, so a signed
 * out caller gets `session_missing` and OpenAI is never called. Nothing here
 * needs its own auth check, and adding one would be a second answer to a
 * question already answered.
 *
 * @param profile The caller's own profile, already bounded by `boundProfile()`.
 * @param listing One listing `searchListings()` parsed in this same render.
 * @param cookieAdapter The same test seam `callTier()` exposes, absent in every
 * real caller.
 */
export async function scoreListing(
  profile: ScoringProfile,
  listing: Listing,
  cookieAdapter?: CookieMethodsServer,
): Promise<
  Result<
    | { readonly allowed: true; readonly value: FitScore }
    | { readonly allowed: false; readonly reason: UsageGateReason }
  >
> {
  const result = await callTier(
    "ai_scoring",
    fitScoreSchema,
    buildScoringPrompt(profile, listing),
    {
      system: SCORING_SYSTEM_PROMPT,
      ...(cookieAdapter === undefined ? {} : { cookieAdapter }),
    },
  );

  /** A failure and a refusal both pass straight through, unchanged. */
  if (isFailure(result) || !result.value.allowed) return result;

  /**
   * AC-5: the vendor's answer is filtered against the caller's own skill names
   * BEFORE it leaves this function, so nothing downstream has to remember to do
   * it. `profile.skills` is the bounded list that actually entered the prompt,
   * which is the right comparison set: it is every name the model could have
   * legitimately echoed back.
   */
  return success({
    allowed: true,
    value: normalizeFitScore(result.value.value, profile.skills),
  });
}

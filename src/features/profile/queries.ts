import "server-only";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { PROFILE_FAILURES } from "./failures";
import { REMOTE_PREFERENCES } from "./schemas";

/**
 * Spec 0003: the caller's own profile, read through the real server client under
 * a real policy.
 *
 * This is the deployed end to end proof. It proves six things connect at once
 * (the framework, the client, the session, row level security, the deployment,
 * the error path), against a real product table. It took that job over from a
 * throwaway scaffold read, which is why the proof never went dark when the
 * scaffold was removed.
 */

/**
 * Binding rule from spec 0001: nothing untrusted enters the application
 * unparsed. The row is parsed rather than type asserted, because a wrong
 * declared type is exactly what the compiler cannot catch (AC-15).
 *
 * `z.uuid()`, TIGHTENED FROM `z.guid()` BY SPEC 0004 (AC-6). `profile.id` is the
 * auth user id, and the two synthetic users used to carry ids whose RFC version
 * and variant nibbles were wrong (`1111-1111-…`, `2222-2222-…`). Postgres stored
 * them happily and `z.uuid()` would have refused them, rendering
 * `response_malformed` on the deployed page for exactly the fixtures AC-14 is
 * proved against, so this had to stay at the looser `z.guid()` until the pool
 * was re-minted. Feature 8 re-minted it, so this now checks the version and
 * variant nibbles too and a malformed id can no longer reach the application
 * unnoticed. `test/integration/fixtures.test.ts` holds the pool to the same
 * standard, against the real rows, so the two can never drift apart again.
 */
const profileSchema = z.object({
  id: z.uuid(),
  full_name: z.string().min(1),
  /**
   * Both are nullable columns, and both are mapped to `undefined` here rather
   * than carried as `null`, per the project rule preferring `undefined` in a
   * union. The mapping happens once, at the boundary, so nothing downstream has
   * to handle two kinds of absent.
   */
  location: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
  summary: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
});

/**
 * The caller's own profile, as it exists AFTER the parse above.
 *
 * INFERRED FROM THE SCHEMA RATHER THAN WRITTEN OUT, and that is the load
 * bearing part. A hand written shape can drift from what is actually parsed,
 * and a wrong declared type is precisely what no strictness flag disagrees
 * with: it is the shape of the reference project's anchor bug that spec 0001
 * names, and the reason spec 0003 AC-15 asks for a parse at the boundary rather
 * than a type assertion. Inferring it means this type cannot disagree with the
 * parse that produces it.
 *
 * Being the output side of the transform, `location` and `summary` are
 * `string | undefined` here and never `null`, so a caller handles one kind of
 * absent rather than two.
 */
export type Profile = z.infer<typeof profileSchema>;

/**
 * Reads the signed in caller's own profile.
 *
 * Returns `record_not_found` as an EXPECTED failure when the caller has no
 * profile row yet, which is an ordinary state before feature 9 builds the form
 * that creates one. It is a visible failure rather than an empty render,
 * because an empty render is indistinguishable from success with nothing to
 * show (AC-14).
 */
export async function readOwnProfile(): Promise<Result<Profile>> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement of the
   * operation, before any early return or guard clause. If it opened later, a
   * total failure would produce no spans, the failure ratio would have no
   * denominator, and the alert would stay silent through exactly the outage it
   * exists to catch. The name is registered in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "profile.read", op: "db.query" },
    async (): Promise<Result<Profile>> => {
      const supabase = await createClient();

      /**
       * The protected layout's redirect only changes the response it sends;
       * this page still renders concurrently underneath it, so an
       * unauthenticated request reaches this call regardless. Verifying the
       * caller here, the same guarantee every Server Action already carries
       * per binding rule 6, stops the pointless read and reports the outcome
       * as the expected thing it is rather than as `database_unavailable`.
       *
       * BINDING RULE 5: `getClaims()` reaches out to Supabase's JWKS endpoint
       * and can throw on a genuine service failure, distinct from the
       * returned `error`, which means an invalid, expired, or absent session.
       * Only the latter is an expected, everyday outcome.
       */
      const claimsAttempt = await attempt(
        {
          kind: "external_service_failed",
          message: "Could not verify the session.",
        },
        () => supabase.auth.getClaims(),
      );

      if (isFailure(claimsAttempt)) return claimsAttempt;

      const { data: claims, error: claimsError } = claimsAttempt.value;

      if (claimsError || !claims) {
        return failure({
          kind: "session_missing",
          severity: "expected",
          message: "No session is present for this read.",
        });
      }

      /**
       * NO `eq` FILTER ON THE CALLER'S ID, AND THAT IS THE POINT. The policy is
       * what confines this select to the caller's own row (spec 0003, Value
       * sourcing: "selected by policy"). Adding an application side filter
       * would make this read look correct even if the policy were broken, and
       * silently remove the thing AC-3 exists to prove.
       */
      const { data, error } = await supabase
        .from("profile")
        .select("id, full_name, location, summary")
        .maybeSingle();

      if (error) {
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "Could not reach the database.",
          context: { code: error.code, hint: error.hint },
          cause: error,
        });
      }

      if (data === null) {
        /**
         * Expected, not broken: row level security returns no rows rather than
         * an error when a policy does not match, and a signed in user with no
         * profile yet is an ordinary state until feature 9. Saying so out loud
         * is the point, and AC-14 requires this exact path to be visible.
         */
        return failure({
          kind: "record_not_found",
          severity: "expected",
          message: "No profile exists for this user yet.",
        });
      }

      const parsed = profileSchema.safeParse(data);

      if (!parsed.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "The profile row did not match the shape we parse.",
          context: { issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      return success(parsed.data);
    },
  );
}

/**
 * Whether the caller has a profile row at all (spec 0008, AC-7, AC-7a).
 *
 * A SEPARATE READ FROM `readOwnProfile()` ON PURPOSE, and the separation is the
 * whole point of the criterion. `readOwnProfile()` treats an absent row as
 * `record_not_found`, an EXPECTED failure that still reports to Sentry and still
 * marks the `profile.read` span failed. That is right for a page whose job is to
 * show the profile, and wrong here: a first time sign in has no row by
 * definition, so reusing it would put the most ordinary event in the product
 * into the failure ratio feature 9 will alert on.
 *
 * SO AN ABSENT ROW RETURNS `false` AND BUILDS NO `failure()`. Nothing is being
 * hidden: an absent row is not a failure, it is the answer.
 *
 * A GENUINE QUERY ERROR IS STILL A FAILURE (AC-7a). The narrow exemption above
 * is for the absent row and nothing else. Collapsing an error into `false` would
 * land a visitor on `/profile` during a database outage as though their profile
 * were merely empty, which is exactly the default that reads like success the
 * error model forbids.
 *
 * IT OPENS NO SPAN OF ITS OWN, deliberately. It is only ever called inside
 * `landing_rule.decide`, so its failures already have a denominator there.
 * Reusing `profile.read` would merge two operations under one name and undo what
 * this function exists for.
 *
 * THE `eq` FILTER IS PRESENT HERE AND ABSENT IN `readOwnProfile()`, which is a
 * real difference and not an oversight. That read proves the policy works, so an
 * application side filter would make it look correct even if the policy were
 * broken. This one is called from route handlers deciding where to send a
 * visitor whose id the caller has already resolved from verified claims, so
 * naming the row makes the subject of the read explicit rather than ambient.
 * Row level security still confines it either way.
 *
 * @param userId The caller's own id, from claims that have already been verified.
 * @returns `true` when a row exists, `false` when none does, or a failure.
 */
export async function hasProfileRow(userId: string): Promise<Result<boolean>> {
  const supabase = await createClient();

  /** BINDING RULE 5: the database driver may throw rather than return. */
  const attempted = await attempt(
    {
      kind: "database_unavailable",
      message: "Could not check whether a profile exists.",
    },
    /**
     * `async` so the awaited value is the response rather than the builder:
     * PostgREST's builder is a thenable, not a `Promise`, so returning it raw
     * would not satisfy `attempt()`'s contract and its rejection would escape.
     */
    async () =>
      await supabase
        .from("profile")
        .select("id")
        .eq("id", userId)
        .maybeSingle(),
  );

  if (isFailure(attempted)) return attempted;

  const { data, error } = attempted.value;

  if (error) {
    return failure({
      kind: "database_unavailable",
      severity: "unexpected",
      message: "Could not check whether a profile exists.",
      context: { code: error.code, hint: error.hint },
      cause: error,
    });
  }

  /** No row is an answer, not a failure. This is AC-7's exemption, in one line. */
  return success(data !== null);
}

/**
 * A skill, as the page renders it (spec 0010).
 *
 * `id` IS CARRIED EVEN THOUGH THE SKILLS SECTION EDITS BY NAME. `profile_skill`
 * has no update path at all (spec 0003 gives it three policies, not four), so a
 * renamed skill is a delete plus an insert and the diff in `saveSkills` works on
 * names, not ids. The id is here because it is the stable React key for the
 * rendered list, which a name is not: two saves apart, the same name is a
 * different row.
 */
const skillSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});

export type Skill = z.infer<typeof skillSchema>;

/**
 * A work history entry, as the page renders it.
 *
 * The two dates stay the raw `YYYY-MM-DD` strings Postgres returns. They are
 * formatted at render by `formatMonth()` and read back into the edit form's two
 * selects by `monthOf()`, per `AGENTS.md`'s store raw and format at render rule.
 * An absent `ended_on` means the role is current (spec 0003's own reason for
 * having no `is_current` column).
 */
const workExperienceRowSchema = z.object({
  id: z.uuid(),
  company: z.string().min(1),
  title: z.string().min(1),
  location: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
  description: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
  started_on: z.string().min(1),
  ended_on: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
});

export type WorkExperienceEntry = z.infer<typeof workExperienceRowSchema>;

/**
 * The caller's stated search preferences.
 *
 * `minimum_pay` IS PARSED AS A NUMBER AND NEVER FORMATTED HERE. The column is
 * `numeric(12, 2)`, whose whole range is representable exactly in cents, and
 * formatting happens at render beside the currency it is paired with. Storing or
 * carrying it as a formatted string would be the thing `AGENTS.md` forbids.
 *
 * The pairing with `minimum_pay_currency` is guaranteed by the table's own
 * `job_preference_pay_paired` constraint, so nothing here has to defend against
 * an amount arriving without its currency.
 */
const preferencesRowSchema = z.object({
  desired_titles: z.array(z.string()),
  desired_locations: z.array(z.string()),
  /**
   * The four values the column's check constraint allows. Spec 0003 recorded
   * the cost of a check constraint over an enum type in terms: the generated
   * TypeScript is `string`, so the allowed values are named again in Zod and the
   * two can drift. This is that second naming, and it is the boundary that
   * catches the drift rather than passing it on as a widened type.
   */
  remote_preference: z.enum(REMOTE_PREFERENCES),
  minimum_pay: z
    .number()
    .nullable()
    .transform((value) => value ?? undefined),
  minimum_pay_currency: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
});

export type Preferences = z.infer<typeof preferencesRowSchema>;

/** The three sections that hang off a profile row. */
export interface ProfileSections {
  readonly skills: readonly Skill[];
  readonly experience: readonly WorkExperienceEntry[];
  /**
   * Absent until the preferences section is explicitly saved for the first time
   * (invariant 5, AC-10). `undefined` is a real state the page renders as "not
   * set yet", never a row full of defaults standing in for a choice nobody made.
   */
  readonly preferences: Preferences | undefined;
}

/**
 * The caller's skills, work history and search preferences (spec 0010).
 *
 * CALLED ONLY ONCE `readOwnProfile()` HAS ALREADY RESOLVED A ROW, and it does
 * not touch that function. `readOwnProfile()`'s `record_not_found` path marks
 * the `profile.read` span failed on purpose, and spec 0008 AC-7 already depends
 * on that span keeping its own failure ratio. Folding these three reads into it
 * would change what that ratio counts.
 *
 * NO `eq` FILTER ON ANY OF THE THREE, the same as `readOwnProfile()`. The
 * policies are what confine each select to the caller's own rows. An application
 * side filter would make all three look correct even if a policy were broken.
 *
 * THE THREE RUN CONCURRENTLY. They are independent selects on one connection's
 * worth of work, and running them in series would make the page wait three round
 * trips to show one screen.
 */
export async function readProfileSections(): Promise<Result<ProfileSections>> {
  /** BINDING RULE 4: the named span opens as the first statement. */
  return Sentry.startSpan(
    { name: "profile.read_sections", op: "db.query" },
    async (): Promise<Result<ProfileSections>> => {
      const supabase = await createClient();

      /** BINDING RULE 5: the database driver may throw rather than return. */
      const attempted = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () =>
          await Promise.all([
            supabase.from("profile_skill").select("id, name"),
            supabase
              .from("work_experience")
              .select(
                "id, company, title, location, description, started_on, ended_on",
              )
              /**
               * Current roles first, then most recent, then most recently
               * added. `nullsFirst` is what puts a role with no end date at the
               * top: an absent `ended_on` IS the current role.
               */
              .order("ended_on", { ascending: false, nullsFirst: true })
              .order("started_on", { ascending: false })
              .order("created_at", { ascending: false }),
            supabase
              .from("job_preference")
              .select(
                "desired_titles, desired_locations, remote_preference, minimum_pay, minimum_pay_currency",
              )
              .maybeSingle(),
          ]),
      );

      if (isFailure(attempted)) return attempted;

      const [skills, experience, preferences] = attempted.value;

      for (const response of [skills, experience, preferences]) {
        if (response.error) {
          return failure({
            kind: PROFILE_FAILURES.database_unavailable.kind,
            severity: PROFILE_FAILURES.database_unavailable.severity,
            message: PROFILE_FAILURES.database_unavailable.message,
            context: {
              code: response.error.code,
              hint: response.error.hint,
            },
            cause: response.error,
          });
        }
      }

      const parsedSkills = z.array(skillSchema).safeParse(skills.data ?? []);

      if (!parsedSkills.success) return malformed(parsedSkills.error);

      const parsedExperience = z
        .array(workExperienceRowSchema)
        .safeParse(experience.data ?? []);

      if (!parsedExperience.success) return malformed(parsedExperience.error);

      /**
       * `null` is the answer, not a failure: no row means the section has never
       * been saved. It is parsed only when there is something to parse.
       */
      const parsedPreferences =
        preferences.data === null
          ? undefined
          : preferencesRowSchema.safeParse(preferences.data);

      if (parsedPreferences !== undefined && !parsedPreferences.success) {
        return malformed(parsedPreferences.error);
      }

      return success({
        /**
         * ORDERED BY `lower(name)` IN THE APPLICATION, NOT IN THE QUERY, and
         * that is a limit of the transport rather than a preference. PostgREST
         * orders by columns, not by expressions, so `lower(name)` cannot be
         * asked for over the Data API. Ordering by `name` instead would sort
         * every capitalised skill above every lowercase one, which is a visibly
         * different list from the one the spec asked for. The sort is stable and
         * runs over one profile's own skills.
         */
        skills: [...parsedSkills.data].sort((left, right) =>
          left.name.toLowerCase().localeCompare(right.name.toLowerCase()),
        ),
        experience: parsedExperience.data,
        preferences: parsedPreferences?.data,
      });
    },
  );
}

/**
 * A row that did not match the shape this feature parses.
 *
 * One helper for the three reads, so all three report the same kind at the same
 * severity, exactly as `readOwnProfile()` reports its own (`response_malformed`,
 * unexpected). A wrong declared type is what no strictness flag disagrees with,
 * which is why every one of these rows is parsed rather than asserted.
 */
function malformed(error: z.ZodError): Result<never> {
  return failure({
    kind: PROFILE_FAILURES.response_malformed.kind,
    severity: PROFILE_FAILURES.response_malformed.severity,
    message: PROFILE_FAILURES.response_malformed.message,
    context: { issues: z.treeifyError(error) },
    cause: error,
  });
}

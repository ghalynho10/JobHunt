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

import { RESUME_FAILURES } from "./failures";

/**
 * The resume reads (spec 0024, Value sourcing: plain view, editor prefill,
 * resume card).
 *
 * ONE SPAN NAME, `resume.read`, FOR BOTH READS, told apart by a `read`
 * attribute (`history` or `version`), the same shape `profile.save_work_experience`
 * uses for its insert and update: one denominator for binding rule 4's ratio
 * rather than two half sized ones.
 *
 * NO `eq` FILTER ON THE CALLER, the same rule `readOwnProfile()` states. Row
 * level security confines every select to the caller's own rows; an application
 * side filter would make these reads look correct even with a broken policy.
 * The one `eq` below is on a version's own id, which names the row asked for,
 * not whose it is.
 *
 * THE CALLER IS VERIFIED HERE TOO, even though the protected layout already
 * did. The layout's redirect only changes its own response while this page
 * still renders beneath it, so the same reasoning `readOwnProfile()` gives
 * applies: verify, and report a missing session as the expected thing it is.
 */

/** One row of the version list: everything except the text itself. */
const versionSummarySchema = z
  .object({
    id: z.uuid(),
    version_number: z.number().int().positive(),
    created_at: z.string().min(1),
  })
  .transform((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    createdAt: row.created_at,
  }));

/** One version with its stored text. */
const versionSchema = z
  .object({
    id: z.uuid(),
    version_number: z.number().int().positive(),
    content: z.string(),
    created_at: z.string().min(1),
  })
  .transform((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    content: row.content,
    createdAt: row.created_at,
  }));

/** A version list row, as the page and the card render it. */
export type ResumeVersionSummary = z.infer<typeof versionSummarySchema>;

/** A version with its raw markdown, exactly as stored. */
export type ResumeVersion = z.infer<typeof versionSchema>;

/** The caller's whole resume history, as the plain view renders it. */
export interface ResumeHistory {
  /**
   * Every version, newest first, never capped (AC-6). The version count the
   * page shows is this list's length, which is `count(*)` over the caller's
   * rows by construction.
   */
  readonly versions: readonly ResumeVersionSummary[];
  /**
   * The current version with its text, or `undefined` when there is no
   * resume yet. "Current" is `MAX(version_number)`, computed at read time,
   * never a stored flag (spec 0024, State transitions).
   */
  readonly current: ResumeVersion | undefined;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** `getClaims()` inside the read, per binding rule 6's reasoning above. */
async function verifyCaller(client: Client): Promise<Result<true>> {
  /** BINDING RULE 5: `getClaims()` reaches the JWKS endpoint and can throw. */
  const attempted = await attempt(
    {
      kind: "external_service_failed",
      message: RESUME_FAILURES.read_unavailable.message,
    },
    () => client.auth.getClaims(),
  );

  if (isFailure(attempted)) return attempted;

  const { data, error } = attempted.value;

  if (error || !data) {
    return failure({
      kind: "session_missing",
      severity: "expected",
      message: RESUME_FAILURES.session_missing.message,
    });
  }

  return success(true);
}

/** A driver error on a read. */
function readUnavailable(error: {
  readonly code?: string;
  readonly hint?: string | null;
}): Result<never> {
  return failure({
    kind: RESUME_FAILURES.read_unavailable.kind,
    severity: RESUME_FAILURES.read_unavailable.severity,
    message: RESUME_FAILURES.read_unavailable.message,
    context: { code: error.code, hint: error.hint },
    cause: error,
  });
}

/** A row that did not match the shape this feature parses. */
function readMalformed(error: z.ZodError): Result<never> {
  return failure({
    kind: RESUME_FAILURES.read_malformed.kind,
    severity: RESUME_FAILURES.read_malformed.severity,
    message: RESUME_FAILURES.read_malformed.message,
    context: { issues: z.treeifyError(error) },
    cause: error,
  });
}

/**
 * The caller's resume history (AC-5, AC-6, AC-10).
 *
 * TWO READS IN SEQUENCE, NOT IN PARALLEL, and the order is the point. The list
 * comes first, then the text of the version the list says is newest, fetched
 * by that row's id. Running them side by side could pair a list ending at
 * version 6 with the text of version 5, if another tab saved between the two;
 * reading the text by id makes the page's "current" one version, not two.
 *
 * The version list carries no `content`: every version can hold 20000
 * characters, and only the current one is ever displayed.
 *
 * @param options.withContent `false` for the `/profile` card, which shows the
 * version number and date and never the text, so it skips the second read.
 */
export async function readResumeHistory(options: {
  readonly withContent: boolean;
}): Promise<Result<ResumeHistory>> {
  /** BINDING RULE 4: the named span opens as the first statement. */
  return Sentry.startSpan(
    { name: "resume.read", op: "db.query", attributes: { read: "history" } },
    async (): Promise<Result<ResumeHistory>> => {
      const supabase = await createClient();
      const caller = await verifyCaller(supabase);

      if (isFailure(caller)) return caller;

      const listed = await attempt(
        {
          kind: RESUME_FAILURES.read_unavailable.kind,
          message: RESUME_FAILURES.read_unavailable.message,
        },
        async () =>
          await supabase
            .from("resume_version")
            .select("id, version_number, created_at")
            .order("version_number", { ascending: false }),
      );

      if (isFailure(listed)) return listed;
      if (listed.value.error) return readUnavailable(listed.value.error);

      const versions = z
        .array(versionSummarySchema)
        .safeParse(listed.value.data ?? []);

      if (!versions.success) return readMalformed(versions.error);

      const newest = versions.data[0];

      if (newest === undefined || !options.withContent) {
        return success({ versions: versions.data, current: undefined });
      }

      const current = await selectVersion(supabase, newest.id);

      if (isFailure(current)) return current;

      return success({ versions: versions.data, current: current.value });
    },
  );
}

/**
 * One version by id, for the editor's `from` prefill (AC-6, AC-8).
 *
 * `undefined` WHEN NO ROW MATCHES, and that is an answer, not a failure: a
 * version that is someone else's is invisible to row level security, exactly
 * like one that never existed, and AC-8 renders both the same way. Nothing here
 * can tell a stranger which ids exist.
 *
 * @param versionId Already parsed as a uuid by the caller, so a malformed id
 * never reaches the database.
 */
export async function readResumeVersion(
  versionId: string,
): Promise<Result<ResumeVersion | undefined>> {
  return Sentry.startSpan(
    { name: "resume.read", op: "db.query", attributes: { read: "version" } },
    async (): Promise<Result<ResumeVersion | undefined>> => {
      const supabase = await createClient();
      const caller = await verifyCaller(supabase);

      if (isFailure(caller)) return caller;

      return selectVersion(supabase, versionId);
    },
  );
}

/** The select both reads above share, by a version's own id. */
async function selectVersion(
  supabase: Client,
  versionId: string,
): Promise<Result<ResumeVersion | undefined>> {
  const selected = await attempt(
    {
      kind: RESUME_FAILURES.read_unavailable.kind,
      message: RESUME_FAILURES.read_unavailable.message,
    },
    async () =>
      await supabase
        .from("resume_version")
        .select("id, version_number, content, created_at")
        .eq("id", versionId)
        .maybeSingle(),
  );

  if (isFailure(selected)) return selected;
  if (selected.value.error) return readUnavailable(selected.value.error);
  if (selected.value.data === null) return success(undefined);

  const parsed = versionSchema.safeParse(selected.value.data);

  if (!parsed.success) return readMalformed(parsed.error);

  return success(parsed.data);
}

import { describe, expect, it } from "vitest";

import { PROFILE_FAILURES } from "./failures";

/**
 * Spec 0010's `## Failure table`, as the table it is meant to be.
 *
 * WHY THIS IS WORTH A TEST. Binding rule 4 alerts on the SHARE of attempts at an
 * operation that fail, and Sentry groups those by the failure's kind. Six write
 * paths raising the same outcome at two different severities would split one
 * ratio in half and make the alert quieter exactly as the problem spread. The
 * table exists so no call site picks a severity in the moment, and these tests
 * are what stop a later reader from adding a row that quietly disagrees with the
 * spec.
 */

describe("every situation carries the kind and severity the spec fixed", () => {
  it.each([
    ["validation_failed", "validation_failed", "expected"],
    ["session_missing", "session_missing", "expected"],
    ["profile_missing", "record_not_found", "expected"],
    ["entry_missing", "record_not_found", "expected"],
    ["skill_conflict", "validation_failed", "expected"],
    ["database_unavailable", "database_unavailable", "unexpected"],
    ["response_malformed", "response_malformed", "unexpected"],
  ] as const)("files %s as %s / %s", (situation, kind, severity) => {
    const shape = PROFILE_FAILURES[situation];

    expect(shape.kind).toBe(kind);
    expect(shape.severity).toBe(severity);
  });

  it("groups the three record_not_found situations under one kind", () => {
    /**
     * The kind is what Sentry fingerprints on, so all three grouping together is
     * the intended behaviour, not an oversight. They stay separate KEYS because
     * each says something different to the reader; only the grouping is shared.
     */
    const notFound = ["profile_missing", "entry_missing"] as const;

    for (const key of notFound) {
      expect(PROFILE_FAILURES[key].kind).toBe("record_not_found");
    }

    expect(new Set(notFound.map((k) => PROFILE_FAILURES[k].message)).size).toBe(
      2,
    );
  });

  it("files a concurrent skill collision as a validation failure, never as an outage", () => {
    /**
     * Invariant 2. The submitted list is already deduplicated ignoring case, so
     * the only way to collide on `(profile_id, lower(name))` is another tab
     * writing the same name first. The database is working perfectly in that
     * moment, and filing it as `database_unavailable` would put an ordinary
     * concurrency outcome into the ratio that alerts on real outages.
     */
    expect(PROFILE_FAILURES.skill_conflict.kind).toBe("validation_failed");
    expect(PROFILE_FAILURES.skill_conflict.severity).toBe("expected");
  });

  it("keeps only genuine breakage at the unexpected severity", () => {
    /**
     * `expected` never means ignorable, it means the system worked and the
     * answer was no. Two situations here are real breakage and the rest are
     * answers, and getting that split wrong is how an alert either screams at
     * ordinary use or stays silent through an outage.
     */
    const unexpected = Object.entries(PROFILE_FAILURES)
      .filter(([, shape]) => shape.severity === "unexpected")
      .map(([key]) => key)
      .sort();

    expect(unexpected).toEqual(["database_unavailable", "response_malformed"]);
  });
});

describe("every message is safe to put in front of a reader", () => {
  const messages = Object.values(PROFILE_FAILURES).map(
    (shape) => shape.message,
  );

  it.each(messages)("says something a person can act on: %j", (message) => {
    expect(message.trim().length).toBeGreaterThan(0);
    expect(message).toMatch(/[.!?]$/);
  });

  it.each(messages)("leaks no identifier or driver detail in %j", (message) => {
    /**
     * These messages ARE rendered, unlike the auth ones, because each action
     * returns its message into its own form state. So the `Failure` contract's
     * "safe to show a user" is load bearing here rather than theoretical: no row
     * id, no email, no Postgres error code, no table name.
     */
    expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(message).not.toMatch(/@/);
    expect(message).not.toMatch(
      /\b(23505|23503|profile_skill|work_experience|job_preference)\b/,
    );
  });

  it("gives each situation its own wording, so the reader can tell them apart", () => {
    const messages = Object.values(PROFILE_FAILURES).map((s) => s.message);

    expect(new Set(messages).size).toBe(messages.length);
  });
});

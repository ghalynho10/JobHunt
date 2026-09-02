# Review, feat/profile-entry, 2026-09-02

**Reviewed by**: Claude Sonnet 5 (author on Claude Opus)
**Scope**: 51 files, branch vs `main` (merge base `d9aa5b6`)
**Verdict**: Approve with nits

## Summary

Feature 9 builds the first write path onto `profile`, `profile_skill`, `work_experience` and `job_preference`: six Server Actions, a URL-driven `/profile` page, and four new base components (`Field`, `Input`, `Textarea`, `Select`). The six actions consistently open their named span first, verify the caller independently, upsert identity and preferences to make double submission harmless, diff-and-order the skills write to protect against partial failure, and detect zero-row updates/deletes as failures rather than silent no-ops. Row level security is relied on correctly and consistently for every read and write that touches another table's rows. The Zod schemas mirror the real check constraints (including the `numeric(12,2)` pay pattern and the `^[A-Z]{3}$` currency check) and the base components meet the accessibility floor (real `<label>`, `aria-invalid`/`aria-describedby` pairing, non-colour error state, 44px targets). The one real gap is that `addWorkExperience`, unlike `saveIdentity` and `savePreferences`, has no idempotency protection against a double submission.

## Minor

### 🟡 `addWorkExperience` has no protection against a duplicate submission, `src/features/profile/actions.ts:459-540`

**Problem**: `saveIdentity` and `savePreferences` are both always an `upsert`, and the spec's own Value sourcing table explains why: "a repeated submission (a double click, or a back button resubmission) updates the same row instead of failing a second insert on the primary key." `addWorkExperience` is a plain `insert` with no equivalent guard. `ExperienceForm`'s submit button is disabled via `useActionState`'s `pending` flag (`src/features/profile/experience-form.tsx:184`), which covers the window after React registers the click, but not a double click faster than that render, a JavaScript-off double POST, or a client that resubmits the form (this page ships client JavaScript by design, but nothing stops the no-JS path spec 0010 explicitly still supports).

**Why it matters**: Two clicks in quick succession, or a resubmission, create two identical `work_experience` rows for the same role. `work_experience` has no uniqueness constraint on `(profile_id, company, title, started_on)`, so nothing in the database catches it either. It is a data-quality issue rather than a security one, but it is exactly the kind of thing feature 14's scoring reads later, and the spec explicitly reasoned about this failure mode for the other two upsert-based actions without carrying the same reasoning to this one.

**Suggested fix**: Either accept this as a known, documented gap (the way the spec calls out other tradeoffs in `## Consequences`), or add a lightweight guard, for example a client-side one-shot disable set synchronously on submit before `pending` updates, or a short-lived idempotency key threaded through the hidden fields the way `entry_id` already is.

## Strengths

- The zero-row detection on `updateWorkExperience`/`deleteWorkExperience` uses `{ count: "exact" }` rather than `.select()`, exactly as invariant 4 specifies, and both are backed by a real integration test that breaks the delete call at the driver boundary via a `Proxy` over the real Supabase client rather than a stub that assumes its own conclusion (`test/integration/profile-actions.test.ts:141-235`).
- The skills diff (`saveSkills`, `src/features/profile/actions.ts:255-398`) reads current state once, computes insert/delete sets case-insensitively against the real unique index shape, and writes insert-before-delete so a mid-save failure never loses a skill the caller already had. The concurrency exemption for a diff-computed delete (invariant 4's carve-out) is applied correctly and only there, never to the entry-addressed update/delete.
- `entry-gone` handling for a malformed, stale, or spoofed work history id is done twice, independently: `page-state.ts` catches a non-uuid at the URL boundary, and `experience-section.tsx` separately resolves the id against the caller's own RLS-scoped `entries` list before ever building an edit or delete form, so a well-formed id belonging to someone else can never reach a form pre-filled with somebody else's data.
- Every insert/update/delete correctly omits an application-side `profile_id` filter and leans on the `using`/`with check` policies alone, consistent with `AGENTS.md`'s "row level security is the real guarantee" rule and with `readOwnProfile()`'s existing pattern; this was checked table by table (`profile`, `profile_skill`, `work_experience`, `job_preference`) against the real policies in `20260825162457_data_model.sql` and none of them is wrong.
- The four new base components correctly restrict themselves to `tv` from `./tv.ts`, share one `controlSurface` definition rather than drifting per control, and encode the invalid state as a border-weight change plus `aria-invalid` rather than colour, matching `brand-tokens.md`'s closed palette.
- `next.config.ts`'s `NEXT_DIST_DIR` escape hatch is opt-in only (absent unless the env var is set, so the key does not even exist in the config object otherwise) and is well commented as a deliberate, narrow test accommodation rather than a silent production behaviour change.

## Test coverage

Strong. The skills partial-write, the zero-row update/delete, the stale/malformed/spoofed entry id, the caller-with-no-session path, and the pay/currency boundary values (`9999999999.99` accepted, `10000000000.00` rejected, an amount without a currency rejected and vice versa) are all exercised with real assertions against real behaviour rather than mocked expectations. The AC-14 no-browser Server Action drive is a genuine HTTP round trip through a real `next dev` instance. The one gap is the double-submission path on `addWorkExperience` described above, which has no test because the code has no behaviour to test yet.

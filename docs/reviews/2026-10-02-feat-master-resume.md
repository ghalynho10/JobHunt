# Review, feat/master-resume, 2026-10-02

**Reviewed by**: Claude Sonnet 5 (author on unspecified prior model)
**Scope**: 44 files (plus pnpm-lock.yaml), branch vs `main` (pull request #160)
**Verdict**: Approve with nits

## Summary

This change adds the master resume feature exactly as spec 0024 describes it: an append-only `resume_version` table with withheld `update`/`delete` privileges, a Server Action that turns a unique-constraint violation into a named conflict rather than a `Failure`, a shared markdown renderer locked down to a single `source` prop, and a client-side editor with a fixed dirty-check baseline. The migration, the Server Action, the Zod parse ordering (normalise line breaks, then blank, then length), and the integration test's privilege and conflict assertions are all correct and match the spec's invariants precisely. The one real gap is accessibility: the AC-9 conflict state renders with no live-region announcement, so a screen reader user who submits into a conflict is not told their save was refused. Everything else is minor polish.

## Major

### 🟠 The version-conflict state is not announced to assistive technology, `src/features/resume/resume-editor.tsx:129-148`
**Problem**: When `saveResumeVersion` returns `status: "conflict"`, the editor renders `conflictMessage(...)` inside a plain `<Text>` (no `role="alert"`, no `aria-live`) and the newer version's raw text inside a `<figure>`/`<pre>`. Compare this to every other outcome of the same action: a `failed` status either sets `state.message`, rendered through `<FieldError>` (which carries `role="alert"`, confirmed in `src/components/ui/field.tsx:67`), or sets `state.errors.content`, rendered through `Textarea`'s own `FieldError` (same `role="alert"`). The conflict branch is the one outcome of this action that produces neither: `conflictState()` in `src/features/resume/actions.ts:278-284` never sets `message`, so `resume-editor.tsx:119` (`state.message === undefined ? undefined : <FieldError>`) renders nothing.
**Why it matters**: AC-9 exists specifically because losing unsaved text silently is unacceptable, and AGENTS.md states accessibility is WCAG 2.2 AA on this loop. A sighted mouse user sees the new block appear after clicking Save; a screen reader user navigating linearly, or one who has moved focus elsewhere, gets no signal that the submit did anything other than nothing, and may re-click Save (which, since the hidden field now carries the conflict's `currentVersionNumber`, would actually proceed to save, masking the fact a conflict ever happened). This is 4.1.3 Status Messages territory, an AA criterion, and it is the one state in this feature that most needs an announcement.
**Suggested fix**: Give the conflict's message block the same `role="alert"` treatment the rest of the action's outcomes already get (reusing `FieldError` for `conflictMessage(...)`, or adding an explicit `role="alert"`/`aria-live="assertive"` wrapper), and consider moving focus to it, the same way a submit failure is already made findable by being inline above the field.

## Minor

### 🟡 GFM table and strikethrough syntax has no style mapping, `src/lib/markdown.tsx:90-123`
**Problem**: `remark-gfm` is added specifically for GitHub-flavoured markdown (tables, strikethrough, task lists, autolinks, footnotes), but `COMPONENTS` only maps headings, paragraphs, lists, links, blockquote, hr and inline code. There is no entry for `table`/`thead`/`tbody`/`tr`/`th`/`td`, `del`, or a task-list checkbox. Tailwind's own preflight (which this file's doc comment says it is deliberately working around for lists and headings) also strips default table borders and cell padding.
**Why it matters**: A reader who types a markdown table (plausible in a resume: a skills matrix, a certifications list) gets a GFM table parsed correctly but rendered with no visible structure, borderless and unspaced, which is unreadable rather than merely unstyled. This is a styling gap, not a safety regression: AC-13's three protections are untouched.
**Suggested fix**: Either add a minimal style mapping for `table`/`th`/`td` (and decide whether `del`/task-list checkboxes need one too), or confirm deliberately that GFM's only wanted feature here is autolinks/footnotes and tables are an accepted rough edge, worth a one-line note in the file's own doc comment either way.

### 🟡 Cancel is not disabled while a save is in flight, `src/features/resume/resume-editor.tsx:176-196`
**Problem**: `Button type="submit"` is given `disabled={pending}`, but the adjacent Cancel button carries no equivalent guard.
**Why it matters**: A reader who clicks Save and then, before the action resolves, clicks Cancel and confirms the "leave without saving" prompt navigates away while the save is still in flight server-side. The write itself is unaffected (it either lands or conflicts independently of the client), but the reader may believe their click on Save did nothing, when in fact two things are racing.
**Suggested fix**: Disable (or otherwise guard) Cancel while `pending` is true, matching Save's own treatment.

## Nits

- ⚪ `src/features/resume/resume-editor.tsx:140-146`: the conflict `<figure>` has no visible caption beyond the sentence above it via `aria-labelledby`; consider whether a sighted reader skimming quickly would also benefit from a visual label on the box itself (not required by the spec's `COPY-24` decision, just worth a second look alongside the Major above).
- ⚪ `package.json`: `react-markdown`/`remark-gfm` pull in roughly 80 transitive packages (verified against the `pnpm-lock.yaml` diff: `mdast-util-*`, `micromark-*`, `hast-util-*`, `unist-util-*`, etc.), not a handful. All are the standard, actively maintained `unified`/`remark` ecosystem with no postinstall scripts or unusual permissions found, and the caret pinning (`^10.1.0`, `^4.0.1`) matches this project's existing convention for every dependency except `zod`. Not a problem, just worth recording accurately if this count is quoted anywhere outside this diff.

## Strengths

- The migration (`supabase/migrations/20260930120000_resume_version.sql`) and its integration test (`test/integration/resume-actions.test.ts`) are exemplary: the test checks all eight table privileges Postgres actually has (not just the four a policy could govern), confirms RLS is both enabled and forced, and proves the cascade, the conflict, and the restore-is-not-a-false-conflict case against the real stack.
- `src/lib/markdown.tsx`'s safety model is genuinely locked down: `MarkdownText`'s only prop is `source`, so no caller can reach `rehypePlugins`, `urlTransform`, or `disallowedElements` to reverse AC-13, and `markdown.dom.test.tsx` proves its checks can fail first (against a naive stand-in) before trusting their silence against the real renderer.
- The line-break normalisation fix (`line-breaks.ts`, applied at both the save parse and the seed) and its regression tests (`schemas.test.ts`, `resume-editor.dom.test.tsx`) correctly round-trip through the real save schema rather than asserting against hand-written `\n`-only fixtures, which is exactly what would have hidden the original bug.
- `previousVersionNumber`'s single source of truth (the editor's load-time `MAX(version_number)`, or the conflict's own reported number on resubmit) is implemented exactly as AC-9 specifies, and the integration test's restore-then-save case proves it against the real database rather than only in isolation.

## Test coverage

Coverage is thorough and specific to this branch's real risk areas: the render-safety proof is a real DOM parse with a provably-failing control case; the line-break fix has both a unit test on the schema and a DOM test proving the dirty-check round trip; the privilege and RLS checks query every relevant Postgres privilege rather than a convenient subset; and the conflict/restore sequence is exercised against the real stack in order, matching how two tabs would actually race. Nothing in the diff appears to have skipped its own test: the two findings above are read/accessibility-review observations, not coverage gaps a test would have flagged, since this project's accessibility contract is reviewed by eye per the Tooling section (`jsx-a11y` strict catches static violations, not missing live-region semantics).

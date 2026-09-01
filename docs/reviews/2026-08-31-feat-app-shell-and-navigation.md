# Review, feat/app-shell-and-navigation, 2026-08-31

**Reviewed by**: Claude Sonnet 5 (author on Claude Opus)
**Scope**: 49 files, branch vs `main` (merge base `2536e23`)
**Verdict**: Approve with nits

## Summary

This is spec 0008 (app shell and navigation) built end to end: three placeholder routes under `(app)`, a chrome-only `SiteHeader` primitive composed per-page on both the marketing and signed-in sides, a landing rule keyed on profile-row existence, and a three-hop deep-link return mechanism (request header → query parameter → cookie). I read every load-bearing file named in the brief plus the tests that exercise them, and specifically tried to break `src/lib/return-path.ts` as an open-redirect validator. It held against every variant I tried, including several not in its own test file (double-dot-slash normalization tricks, double-percent-encoding, literal vs. percent-encoded backslashes, C0 control smuggling). The two deliberate asymmetries called out in the brief (`/go` vs. the `/sign-in` bounce on an errored session read; `/profile` vs. `/search` on an absent vs. errored profile read) are both implemented the right way round, with tests that name the asymmetry explicitly. `src/proxy.test.ts` is untouched (confirmed via `git diff --stat`), and its two binding-rule-6 assertions still hold against the widened `src/proxy.ts`. The AC-3a per-route header composition (revision 5's fix) is real: all four `(app)` routes compose `AppHeader` themselves, and `shell.test.ts` specifically guards against two routes claiming the same `current` value. I found one genuine defect, a self-contradicting doc passage left over from the PENDING→AMENDED edit, and a couple of nits. Nothing here blocks merge.

## Minor

### 🟡 Stale "pending" prose survives the amendment, `docs/specs/0001-stack-and-architecture/index.md:137`

**Problem**: The amendment blockquote's header was changed from "AMENDMENT PENDING... (status Proposed)" to "AMENDED... which is Accepted and shipped", but the very next clause in the same sentence still reads: "it says pending because neither has landed: today the proxy still does nothing else, and no route handler reads user data." That statement is now false on both counts — the proxy does echo the pathname header, and `/go` and `/auth/callback` do read `public.profile`. The paragraph also still says "The proxy **will** also echo..." and "**will be** the first route handlers" in future tense, describing something that has already shipped.

**Why it matters**: This is the spec that binding rule 6 lives in, and a future reader (human or agent) checking "is this rule actually amended and in effect" hits a sentence that says the opposite of the heading two words earlier. The equivalent passages in specs 0006 and 0007 (also touched by this same find-and-replace pass) were updated cleanly with no such leftover — this one file has residue.

**Suggested fix**: Drop or rewrite the "it says pending because..." clause and switch the two "will" verbs to past/present tense now that the feature is Accepted and shipped, matching how the 0006/0007 supersession notes read.

## Nits

- ⚪ `src/lib/return-path.ts:79-83`, `REFUSED_TARGETS` is compared against `url.pathname` with exact, case-sensitive string equality, so `/Sign-In` or `/SIGN-IN` would not be caught by the loop-prevention list (though it is not an open-redirect risk — it stays same-origin — at worst it's a functional loop if the router happens to resolve case-insensitively, which Next's App Router does not by default, so this is very low practical risk).
- ⚪ `docs/specs/0008-app-shell-and-navigation/index.md:255`, follow-up item correctly flags that `app-header.tsx` and `layout.tsx` both still say "AC-3a needs a dated amendment" when revision 5 *is* that amendment — already tracked as open follow-up, not a new finding, just confirming it's real and still there in the current code (`src/features/app-shell/app-header.tsx:21`, `src/app/(app)/layout.tsx:21`).

## Strengths

- `src/lib/return-path.ts`'s validator checks both the *input* (leading `//`, backslash, control characters, scheme) and the *output* of URL normalization (re-checking `resolved.startsWith("//")` after resolving `.`/`..` segments), which is exactly what defeats the classic `/a/..//evil.com` dot-segment bypass — and the module's own test suite names that exact case rather than leaving it implicit.
- The AC-10/AC-10a header-snapshot bug (`src/proxy.ts`, headers re-derived after the cookie-set loop rather than hoisted) is non-obvious, correctly implemented, and locked by a real integration test (`test/integration/return-path-refresh.test.ts`) that ages a real session, drives a real refresh, and asserts both the pathname header and the refreshed cookie survive together — not two tests that could each pass while the other silently regresses.
- The two specced asymmetries (door vs. bounce on an errored session read; absent-row vs. errored-read in the landing rule) are each implemented correctly and each carries a test whose comment explicitly names the asymmetry and why it isn't a bug, which is exactly the kind of thing that gets "fixed" into a regression by a later reader without that context.

## Test coverage

Coverage is thorough and behavior-focused throughout: the return-path validator's hostile-string tests go beyond the spec's own floor (covering the pre/post-decode tab trick and the dot-segment normalization trick with explicit intermediate assertions showing *why* each is dangerous), the proxy refresh is proved against a real aged session rather than a mock that would encode the same assumption as the code under test, and `shell.test.ts` specifically guards the "route ships a copy-pasted wrong `current` value" failure mode that a per-component test structurally cannot catch. I did not find untested branches in the changed logic — every AC-14a/AC-15/AC-17a/AC-20 branch I traced by hand had a corresponding test.

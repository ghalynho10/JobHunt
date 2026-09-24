# Review, feat/chip-input-for-skills-titles-locations, 2026-09-24

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 16 files, branch vs main (merge base 4bd591a)
**Verdict**: Approve with nits

## Summary

This change replaces the one line per line textarea for skills, desired titles and desired locations with a chip control: type a value, press Enter, it becomes a removable chip. The design system change in `chip.tsx` stays a handler free server component, all interactivity moves into a new client component `chip-field.tsx`, and the two Server Actions, the parsing, and the `FormData` contract are untouched. The engineering is careful and the acceptance criteria are, with one exception, actually implemented as claimed, not just described. I read every changed file in full, ran `pnpm test` (1424 passing), `pnpm tsc --noEmit` and `pnpm lint` (both clean), and independently verified the two trickiest mechanisms in the diff (the capture phase submit guard's reliance on `stopPropagation`, and the `pendingRemoval` type invariant) against the actual compiler and jsdom rather than trusting the comments. One of those checks found a real gap between a stated invariant and the type that is supposed to enforce it. The rest of the findings are minor.

## Minor

### 🟡 `pendingRemoval` is not actually prevented from being `true` without `action`, `src/components/ui/chip.tsx:91-99`
**Problem**: `ChipAsEditable` declares `action?: ReactNode` and `pendingRemoval?: boolean` as two independent optional fields. Nothing in the type ties them together. I confirmed this directly: `Chip({ state: "editable", children: "x", pendingRemoval: true })` (no `action` at all) compiles cleanly under this project's own `tsc --noEmit`, with no `@ts-expect-error` needed, while a genuinely bad property on the same call (`bogusProp`) is correctly rejected in the same compile, so the checker is engaged and this really is a hole, not a fluke of my test setup.
**Why it matters**: Both the doc comment on `pendingRemoval` ("Cannot be `true` without `action` also set, so a pending state can never exist on a chip with no control to act on it") and spec 0023 AC-9 / Build plan step 2 assert this is enforced. It is not. `chip-field.tsx`, the only current caller, always passes both together, so nothing breaks today, but `chip.tsx` is explicitly the sanctioned, reusable design system surface ("a future editable list control elsewhere in the product can reuse it"), and `chip.test.ts`'s compile time suite has no case for this specific combination, so a future caller could ship a chip that visually reads as pending removal with no control to act on it, and nothing would catch it at review or compile time.
**Suggested fix**: Either split `ChipAsEditable` further (`{ action: ReactNode; pendingRemoval?: boolean } | { action?: undefined; pendingRemoval?: false }`) so the invariant is real, or soften the doc comment and the spec text to say the pairing is a convention, not a compiler guarantee, and add the missing `@ts-expect-error` case (or its positive counterpart) so a future change to either the type or the comment is caught.

### 🟡 Scope's test count is off by one, `docs/scope/scope.md:471`
**Problem**: The row states "1425 unit tests" passing. `pnpm test` on this branch reports 1424.
**Why it matters**: Minor on its own, but this project's own reflexes are explicit that a number should be checked against the parts that sum to it rather than trusted, and this is the kind of small drift that compounds when scope.md is read later as a source of truth for what shipped.
**Suggested fix**: Re-run `pnpm test` and correct the number, or note it was approximate.

## Nits

- ⚪ `src/features/profile/chip-field.tsx:91-125`, the duplicate check runs before the length check in `evaluateCandidate`. In practice this can never surface a wrong message (a case insensitive duplicate of an already-valid chip cannot itself be over the length cap), but a comment noting the check order is deliberate would save a future reader from re-deriving that.
- ⚪ `src/features/profile/chip-field.dom.test.tsx:450-467`, the submit-blocking test attaches its mock "React would run this" listener directly on the `<form>` itself, whereas the real mechanism this guards against (per AC-8's own text) is React's action dispatch listening on the root container, an ancestor of the form, not the form element. I verified in this project's own jsdom that a capturing listener's `stopPropagation()` does suppress a same node bubble listener registered afterward, so the test is not vacuous and would fail if `stopPropagation()` were removed, but it is a slightly different node than production, worth a one line comment saying so.

## Strengths

- The AC-4 hydration narrowing (build step 11) is a genuine, well evidenced engineering call: `committed` seeds once from the `initialValues` prop via `useState`'s initializer, and the mount effect shrinks to a single, correctly justified `setMounted(true)` with a documented `eslint-disable-next-line react-hooks/set-state-in-effect`. This is the right use of that escape hatch, not a workaround.
- The capture phase submit guard, the two step Backspace state machine, and the two `aria-live` regions are all implemented exactly as specced and are covered by tests that exercise real DOM events (`dispatchEvent`, native value setters bypassing React's patched setter) rather than calling handlers directly, which is why they would actually fail if the underlying behavior regressed.
- `limits.ts` staying import free, and `copy.ts`'s message functions being shared verbatim by both `chip-field.tsx` and `schemas.ts`, closes the exact "client and server can disagree" gap the spec calls out, and `schemas.test.ts`'s unchanged byte for byte assertions prove the extraction lost nothing.

## Test coverage

Thorough and mapped to specific acceptance criteria, not just present. `chip-field.dom.test.tsx` drives real `keydown`, `paste`, `focusout` and `submit` events against a real DOM (via `react-dom/client` plus `act`), and the unmounted branch is proven with `renderToStaticMarkup`, which is the correct tool since `useEffect` never runs there. `skills-form.dom.test.tsx` and `preferences-form.dom.test.tsx` correctly test the one thing `chip-field.dom.test.tsx` cannot: that each form actually wires `maxCount`, the field name, and the AC-12 label text, rather than assuming a form that forgot `maxCount` would still pass. The one real gap is the `chip.tsx` type invariant above, which has no test because the type itself does not hold; everything else new in this diff is covered by a test that would fail if the behavior regressed.

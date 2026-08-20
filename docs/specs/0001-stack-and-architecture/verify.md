# Verify: Stack & architecture · spec 0001 · updated 2026-08-20

_All steps below ran and passed on 2026-08-20 via `/check verify`._

_Steps derived from the scope's Done when clause and spec 0001's follow-up.
`/check verify` runs these; `/test` locks the durable ones._

Spec 0001 is a decision spec, so it carries no numbered acceptance criteria. The
criteria referenced below are the clauses of the feature's Done when line.

- **DW-1** an empty scaffold boots locally
- **DW-2** it passes a clean build
- **DW-3** a protected page reads one row from Supabase through the real server client and renders it
- **DW-4** proving the framework, client, session, policy and error path all connect
- **DW-5** per user isolation holds, an authenticated request only ever reaches its own rows
- ~~**DW-6** the deployment half of DW-4~~ moved to feature 3 on 2026-08-20. Feature 1's Done when no longer claims it, and feature 3's Done when now requires re running this thread against the live URL.

## Setup

Docker must be running. Then `pnpm db:start`, `pnpm db:reset`, `pnpm dev`.

## UI / manual

- [x] Visit `/` → the page renders and the sign in link is reachable → DW-1
- [x] Visit `/health` while signed out → redirects to `/sign-in` rather than rendering an empty page → DW-4
- [x] Sign in at `/sign-in` as `dev-one@example.test` / `devpassword123` → lands on `/health` showing dev-one's row with its id and created time → DW-3, DW-4
- [x] Sign out, then sign in as `dev-two@example.test` / `devpassword123` → `/health` shows a **different** row. Same row for both users means the policy is not working → DW-5
- [x] Sign in with a wrong password → the form shows a visible error, never a blank success → DW-4
- [x] Delete one user's row (`delete from public.scaffold_check where user_id = '2222...'`), reload `/health` as that user → renders "No row is visible to this user", kind `record_not_found`, severity `expected`. Restore with `pnpm db:reset` → DW-4

## Commands

- [x] `pnpm typecheck` → no output, exit 0 → DW-2
- [x] `pnpm build` → compiles clean; `/health` listed as dynamic (`ƒ`), Proxy listed → DW-2
- [x] `pnpm db:reset` → migration `20260820041006_scaffold_check` applies, seed inserts two users and two rows → DW-3
- [x] `pnpm exec supabase db advisors --local --level warn` → no issues found → DW-5
- [x] Sign in via the auth API as each seeded user and query `scaffold_check` with that token → exactly 1 row each, and each user's own → DW-5
- [x] Query `scaffold_check` with the publishable key and no session → `permission denied for table scaffold_check`, not an empty array → DW-5

## Acceptance-criteria coverage

- DW-1 … covered by the `/` step
- DW-2 … covered by `pnpm typecheck` and `pnpm build`
- DW-3 … covered by the dev-one sign in step and `pnpm db:reset`
- DW-4 … covered by the signed out redirect, the dev-one render, the wrong password step and the deleted row step
- DW-5 … covered by the dev-two step, the per token queries, the anonymous query and the advisors run
- DW-6 … **moved to feature 3.** No longer part of this feature's contract. Feature 3 re runs these steps against the live URL.

## Known gaps

- The password sign in these steps drive is development only and is hard blocked
  elsewhere. Feature 7 replaces it with real Google and GitHub OAuth, and these
  steps have to be rewritten against that when it does.
- `scaffold_check` is a scaffold table, not product data. Feature 4 removes it,
  and this file goes with it.

---

# Verify: Coding standards & tooling · feature 2 · updated 2026-08-20

_Feature 2 has no spec of its own: spec 0001 deferred the linter and formatter
choice to it (binding rule 8), and root `AGENTS.md` `## Tooling` records the
answer, so the steps live here beside that deferral. They were all exercised
during the `/develop tooling` build; the boxes stay unticked for `/check verify`
to run them fresh._

Feature 2 carries no numbered acceptance criteria either. The criteria below are
the clauses of its Done when line, plus the two binding rules the linter exists
to enforce.

- **T-1** root `AGENTS.md` reflects the real stack
- **T-2** lint runs clean on the scaffold
- **T-3** format runs clean on the scaffold
- **T-4** type checking runs clean on the scaffold
- **T-5** a pre commit hook runs clean, and blocks a commit that is not clean
- **T-6** binding rule 8: accessibility is enforced at `jsx-a11y` level
- **T-7** binding rule 1: `src/lib/supabase/secret.ts` cannot be imported from `src/app`

## Commands

- [ ] `pnpm lint` → no output, exit 0 (the script carries `--max-warnings=0`, so a warning fails too) → T-2
- [ ] `pnpm format:check` → `All matched files use Prettier code style!` → T-3
- [ ] `pnpm typecheck` → no output, exit 0 → T-4
- [ ] `SKIP_ENV_VALIDATION=true pnpm build` → compiles clean, same route table as feature 1 → T-2, T-4
- [ ] Write `src/app/__probe.tsx` containing `<img src="/x.png" />`, then `pnpm exec eslint src/app/__probe.tsx` → error `jsx-a11y/alt-text`, not a warning → T-6
- [ ] Add `<div onClick={() => {}}>x</div>` to the same probe → errors `jsx-a11y/click-events-have-key-events` and `jsx-a11y/no-static-element-interactions` → T-6
- [ ] Add `import { createSecretClient } from "@/lib/supabase/secret";` to the same probe → error `@typescript-eslint/no-restricted-imports` naming binding rule 1 → T-7
- [ ] Change that line to `import type * as S from "../lib/supabase/secret";` → the same error still fires, since a type only import and a relative path must not slip through → T-7
- [ ] Put the same import in a file under `src/features/` and lint it → clean, because the allow list in binding rule 1 lives outside `src/app` → T-7
- [ ] Delete the probe file afterwards → `git status` clean → T-6, T-7

## Pre commit hook

- [ ] `git config core.hooksPath` → `.husky/_` → T-5
- [ ] Stage a file with an accessibility error and run `git commit` → lint-staged fails, the commit is refused, and the working tree is reverted to its original state → T-5
- [ ] Stage a clean file and run `git commit` → lint-staged passes, `tsc --noEmit` runs, the commit lands → T-5
- [ ] Read root `AGENTS.md` `## Tooling` → the tools named there are the tools actually installed, and no line still says they do not exist yet → T-1

## Acceptance-criteria coverage

- T-1 … covered by the `AGENTS.md` read step
- T-2 … covered by `pnpm lint` and `pnpm build`
- T-3 … covered by `pnpm format:check`
- T-4 … covered by `pnpm typecheck` and `pnpm build`
- T-5 … covered by the three pre commit hook steps
- T-6 … covered by the two probe steps for `jsx-a11y`
- T-7 … covered by the three probe steps for the secret key import

## Known gaps

- The pre commit type check reads the working tree, not the staged index, because
  `tsc` has no per file mode that still honours `tsconfig.json`. A commit built
  with `git add -p` can pass a check the committed snapshot would fail. CI runs
  the same commands on the real commit and is the backstop.
- CI builds with `SKIP_ENV_VALIDATION=true`, because it holds no Supabase keys.
  That proves the code compiles, not that a real environment is valid. Feature 3
  owns the deployed build with real values and must never set that flag.
- The linter is pinned to ESLint 9. ESLint 10 is out, but `eslint-plugin-react`,
  `eslint-plugin-jsx-a11y` and `eslint-plugin-import` still declare a peer range
  ending at 9, so 10 would install with unmet peers. Revisit once those plugins
  ship support.
- No test job in CI. Feature 8 chooses the test runners; adding one earlier would
  pick the runner by accident.

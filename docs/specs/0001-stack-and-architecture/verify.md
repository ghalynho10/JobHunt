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

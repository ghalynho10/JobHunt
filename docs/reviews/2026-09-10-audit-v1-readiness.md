# Audit: is JobHunt honestly "v1"? · 2026-09-10

_Requested before calling this project v1 publicly (resume, portfolio, interviews). Every claim below
is labelled. Nothing rests on "the docs say so": where a document is the only source, it is labelled
**RECORDED** and named with its date and file, never **VERIFIED**._

**Label meanings**

| Label | Means |
|---|---|
| **VERIFIED** | I ran the command in this session, or read the exact line. The command or the file:line is shown. |
| **RECORDED** | A committed artifact (spec, `verify.md`, experiment file, report) states it. I read that artifact and cite it, but the underlying observation was somebody else's and I did not reproduce it. |
| **INFERRED** | My judgment from verified facts. Marked every time. |

**Not run, by instruction**: `pnpm eval` and anything setting `TEST_LIVE_MODEL_CALLS_ENABLED`. Not because
of cost (a full run is cents) but because a fresh run produces evidence this audit has no time to reason
about, and `control-one-gap` currently passes at the minimum 3-of-5 margin, so a re-run could contradict
the record spec 0018 already argued through. Section 8 reports the recorded results instead.

**Environment at audit time**: local Supabase stack up (12 containers, `supabase_db_jobhunt` "Up 4 days
(healthy)"), Vercel CLI authenticated, production reachable.

---
## 1. How model calling is actually built

### Every AI/model dependency, exactly as declared

From [package.json](../../package.json), read in full. **VERIFIED.**

| Declared | Resolved on disk | Where |
|---|---|---|
| `"ai": "^7.0.93"` | `7.0.93` | dependencies |
| `"@ai-sdk/openai": "^4.0.59"` | `4.0.59` | dependencies |
| `"@ai-sdk/google": "^4.0.64"` | `4.0.64` | dependencies |

Resolved versions read with `node -p "require('./node_modules/<pkg>/package.json').version"`. **VERIFIED.**

That is the complete list. There is **no** `openai` package, no `@anthropic-ai/sdk`, no
`@openai/agents`, no LangChain, no LlamaIndex, no `@ai-sdk/provider` (the type it needs is named
locally instead — see `TierConfig.providerOptions` at [tiers.ts:56-62](../../src/lib/ai/tiers.ts#L56-L62)).
`@ai-sdk/provider` is **NOT INSTALLED**. **VERIFIED** by the same command.

### The actual import statements

There are exactly two files under `src/` that import either package. **VERIFIED** —
`grep -rn 'from "ai"\|from "@ai-sdk' src/ test/` returns, excluding comments:

- [src/lib/ai/tiers.ts:3-5](../../src/lib/ai/tiers.ts#L3-L5)
  ```ts
  import { createGoogle } from "@ai-sdk/google";
  import { createOpenAI } from "@ai-sdk/openai";
  import type { LanguageModel } from "ai";
  ```
- [src/lib/ai/client.ts:5](../../src/lib/ai/client.ts#L5)
  ```ts
  import { NoObjectGeneratedError, generateObject } from "ai";
  ```

Nothing under `test/` imports either. **VERIFIED** by the same grep.

### What the routing layer actually does

`src/lib/ai/` is 5 files, 917 lines including tests (`wc -l`, **VERIFIED**): `tiers.ts` (198),
`client.ts` (157), `failures.ts` (41), plus two test files.

**`tiers.ts` is a closed two-entry lookup table.** `type Tier = "ai_scoring" | "ai_check"`
([tiers.ts:14](../../src/lib/ai/tiers.ts#L14)). Each entry fixes a vendor, a model id, `temperature`,
`maxOutputTokens`, `maxRetries`, `timeoutMs`, and optional `providerOptions`. The two providers are
constructed once at module scope with keys passed explicitly from `src/env.ts` rather than left to
the packages' implicit `process.env` read ([tiers.ts:68-71](../../src/lib/ai/tiers.ts#L68-L71)).
Current mapping, **VERIFIED** by reading the file:

| Tier | Vendor | Model | temperature | maxOutputTokens | maxRetries | timeoutMs |
|---|---|---|---|---|---|---|
| `ai_scoring` | OpenAI | `gpt-5.6-luna` | unset | 2048 | 0 | 30,000 |
| `ai_check` | Google | `gemini-3.5-flash-lite` | 0 | 512 | 0 | 20,000 |

`ai_scoring` additionally sets `providerOptions: { openai: { reasoningEffort: "medium", store: false } }`.

**`client.ts` is one exported function, `callTier()`, 157 lines.** What it adds on top of
`generateObject`:

1. **A named Sentry span as its literal first statement** — `Sentry.startSpan({ name: "ai.call_tier", ... })`
   at [client.ts:58-60](../../src/lib/ai/client.ts#L58-L60), before the usage gate is consulted, so a
   total outage of either the gate or a vendor still leaves a denominator. This is the repo's binding rule 4.
2. **An atomic Postgres budget check before the vendor is reached** — it wraps the vendor call in
   `withUsageGate(tier, …)`. A refusal comes back as `success({ allowed: false, reason })`, never a
   `Failure`, so the budget working as designed cannot pollute the span's failure ratio.
3. **Error classification into the project's `Result` type.** `generateObject` throws one error class
   whether the vendor call failed or its answer missed the schema, so `classify()`
   ([client.ts:148-156](../../src/lib/ai/client.ts#L148-L156)) is a pure exported function splitting that
   into `response_malformed` vs `external_service_failed`. Exactly one `failure()` call follows.
4. **Two diagnostic span attributes** — `stage: "vendor"` (to tell this router's
   `external_service_failed` apart from the usage gate's use of the same kind nested in the same call)
   and `truncated: true` when the error is a `NoObjectGeneratedError` with `finishReason: "length"`.
5. **A fresh `AbortSignal.timeout()` per call**, built from the tier's `timeoutMs` rather than stored —
   the comment at [tiers.ts:40-45](../../src/lib/ai/tiers.ts#L40-L45) records why a module-scope signal
   would already read expired.
6. **The caller supplies the Zod schema**, and the parsed type comes back. The caller never names a
   vendor or a model.

### What a dedicated agent framework would have provided that this doesn't

**INFERRED**, but from a specific reading of what is absent:

- **No agent loop.** Every call is a single-step `generateObject`. No tool calling, no multi-turn
  planning, no step limit, no `stopWhen`. `tiers.ts:152-157` records the consequence explicitly:
  `store: false` is safe here precisely *because* there is no multi-step generation to carry encrypted
  reasoning items across.
- **No tool definitions, no tool-result handling, no MCP.** There is nothing for a model to call.
- **No conversation or thread state.** Scoring is stateless per render. No `previousResponseId`, no
  conversation object.
- **No handoffs, sub-agents, guardrail primitives, or tracing UI.** Observability is the project's own
  Sentry spans, registered by hand in [docs/observability/spans.md](../observability/spans.md).
- **No retry/backoff policy.** `maxRetries: 0` is fixed deliberately, because `usage_cap`'s dollar
  ceilings assume one vendor call per gated call.
- **No streaming.** `generateObject` only.

What the project built *instead of* a framework, and what a framework would not have given it: the
budget choke point, the span-first rule, the `Result` error model, and the single-file vendor map. Those
are project-specific invariants, not framework features.

### The architectural guard

[src/lib/ai/tiers.test.ts:132-212](../../src/lib/ai/tiers.test.ts#L132-L212). **VERIFIED** by reading
it and by independently re-running its logic.

What it enforces: it walks the real `src/` tree (recursive `readdirSync`), keeps `.ts`/`.tsx`, drops
`.test.ts`/`.test.tsx`, strips block and line comments from each file, then fails if any file other
than `src/lib/ai/tiers.ts` and `src/lib/ai/client.ts` matches any of four regexes for the package set
`(@ai-sdk/[^"']+|ai)`:

```
from\s+["']PKG["']          import x from "ai"
import\s+["']PKG["']        import "ai"            (side effect)
import\s*\(\s*["']PKG["']   await import("ai")
require\s*\(\s*["']PKG["']  require("ai")
```

Two things make it non-trivial:

- **The bare `ai` package is in the offender set, not just `@ai-sdk/`.** The test's own comment
  ([tiers.test.ts:144-152](../../src/lib/ai/tiers.test.ts#L144-L152)) records that the original guard
  matched only `@ai-sdk/`, which let a file write `import { generateObject } from "ai"` and call it on
  `TIERS.ai_scoring.model` — already an exported live model instance — skipping `callTier()`,
  `withUsageGate()`, and every fixed generation parameter. Corrected 2026-09-06 by `/check review`.
- **It guards against vacuousness** with `expect(files.length).toBeGreaterThan(20)`.

**I re-ran its logic independently** (own script, own walk of `src/`): 127 non-test source files; the
only two matching files are `src/lib/ai/client.ts` and `src/lib/ai/tiers.ts`. Against synthetic inputs
the four regexes caught all five real import forms and correctly did **not** match `from "zod"`,
`from "aircraft"`, or `from "./ai"`. **VERIFIED.**

**Two real limits of the guard, both VERIFIED:**
- It walks `src/` only. Nothing stops a file under `test/` from importing `ai` directly. Today none
  does, but that is a fact about the tree, not an enforced rule.
- It excludes `*.test.ts` from the scan, so a test file inside `src/` could import `ai` too.

A second, independent guard exists at the lint layer for a different package: a
`@typescript-eslint/no-restricted-imports` override blocks `src/lib/supabase/secret.ts` from
`src/app/**`. That one is ESLint, not a test. **VERIFIED** in [AGENTS.md](../../AGENTS.md)'s Tooling
section and by `pnpm lint` exiting 0.

### Plain, accurate summary

> JobHunt calls models through **Vercel AI SDK 7** (`ai@7.0.93`) with the two **direct provider
> packages** `@ai-sdk/openai@4.0.59` and `@ai-sdk/google@4.0.64`. There is no agent framework and no
> vendor base client. Every call is a **single-step `generateObject`** with a caller-supplied Zod schema.
>
> On top of that sits a ~350-line, hand-written **two-tier router**: one file (`tiers.ts`) is the only
> place a vendor, model id, or generation parameter exists, and one function (`callTier()` in
> `client.ts`) is the only door through. That function opens a named Sentry span as its first statement,
> charges an atomic Postgres budget check before any vendor is reached, and converts a thrown
> `generateObject` error into one of two classified failure values. A unit test walking the real source
> tree forbids every other file under `src/` from importing `ai` or any `@ai-sdk/*` package, in all four
> import forms.
>
> Accurate words for this: **a tiered model-call router / choke point over the AI SDK's direct provider
> clients.** Not an agent, not an agent framework, not a vendor SDK wrapper.

---
## 2. Does the project define "v1," and is it met?

### The only definition of "v1" in the repo, quoted verbatim

[docs/scope/scope.md:502](../scope/scope.md), under `## Standing rules this scope was written under`.
**VERIFIED** by reading the line:

> - **The v1 completion test.** v1 is done when a user can enter a profile, search, see ranked results
>   with the reasoning shown, click through to apply, and record that they applied. Check every proposed
>   addition against this, not against whether it is individually reasonable.

That is the whole definition. **VERIFIED**: a grep for `v1` across `docs/scope/scope.md` and every
`docs/specs/*/index.md` returns no second definition; all other hits are uses of the term (features
deferred "out of v1", "WCAG 2.2 AA on the v1 loop", "no transactional email in v1"), not definitions.

There is no acceptance-criteria-style v1 gate, no checklist, and no release criteria document.

### Exact totals

Counted mechanically from the `## At a glance` table with
`awk -F'|' '/^\| [0-9]+ \|/ {print $4"="$5}' docs/scope/scope.md | sort | uniq -c`. **VERIFIED.**

| Phase | Done | Planned | Total |
|---|---|---|---|
| Foundation | 10 | 0 | 10 |
| Slice 1: Core loop thread | 4 | 0 | 4 |
| Slice 2: Ranking | 6 | 0 | 6 |
| Slice 3: Search depth | 0 | **2** | 2 |
| Slice 4: Tracking depth | 0 | **1** | 1 |
| v1.5 | 0 | 10 | 10 |
| **Total** | **20** | **13** | **33** |

No feature is `in-progress`, `existing`, or `dropped`. **VERIFIED.**

[docs/overview.md:134](../overview.md) independently states "Twenty of thirty three features are done",
matching. **VERIFIED.**

### Every `planned` feature, and which section it sits in

**VERIFIED** by reading the section headings in `docs/scope/scope.md` and the position of each row
relative to the `## v1.5` heading at line 377.

| # | Feature | Section in scope.md | Original v1 phase, or v1.5/Deferred? |
|---|---|---|---|
| 18 | Structured search filters | `## Slice 3: Search depth` (line 357) | **Original v1 slice** |
| 19 | Listing data quality | `## Slice 3: Search depth` | **Original v1 slice** |
| 20 | Guided application capture | `## Slice 4: Tracking depth` (line 370) | **Original v1 slice** |
| 22 | Discard with reason | `## v1.5` | v1.5 |
| 23 | Applications dashboard | `## v1.5` | v1.5 |
| 24 | Master resume | `## v1.5` | v1.5 |
| 25 | Resume tailoring per job | `## v1.5` | v1.5 |
| 26 | Profile depth & completeness | `## v1.5` | v1.5 |
| 27 | Auth remainder | `## v1.5` | v1.5 |
| 28 | Spend visibility & gating polish | `## v1.5` | v1.5 |
| 29 | Product analytics | `## v1.5` | v1.5 |
| 30 | Company research, lite | `## v1.5` | v1.5 |
| 31 | Seeded demo account | `## v1.5` | v1.5 |

All three of features 18, 19 and 20 are tagged `· needs a decision` — they have no spec at all, only an
unticked `- [ ] Design it (spec): /architect …` box. **VERIFIED.**

### The plain statement the prompt asked for

**Two original v1 slices contain unbuilt features. Slice 3 (features 18 and 19) and Slice 4 (feature 20)
are entirely unbuilt and entirely undesigned.** The scope document places them above the `## v1.5`
heading, so by the document's own structure they are v1 work, not post-v1 work. Nothing in the repo
reclassifies them.

**The tension is real and the scope document contains both sides of it.** The line-502 completion test is
satisfied by Slices 1 and 2 alone — profile, search, ranked results with reasoning, click through, record.
That test is also explicitly framed as the thing to check additions *against*, i.e. as a minimum bar.
Meanwhile the slice structure says v1 has four slices and two of them are empty. **INFERRED**: the honest
reading is that the *core loop* is complete and the *planned v1 scope* is 20 of 23 features. Calling the
whole thing "v1 complete" requires either doing features 18-20 or moving them into v1.5 on the record.
Nobody has done the second, and doing it silently in a resume bullet is the thing to avoid.

What Slice 3 and Slice 4 would actually add, from their own `Done when` clauses (**VERIFIED**, read
at scope.md:359-373): filters for seniority/remote/job type/salary/recency with URL-reflected state;
duplicate collapsing, single-figure salary rendering, and outlier handling on incoming listings; and a
guided question flow on marking a job applied. Feature 18's note also records an unresolved cost
question nothing today satisfies — "a repeat search does not wipe the visible results" — with the
measurement behind it: every request carrying `q` or `where` spends one gate check and one Adzuna call,
a browser back navigation included.

---
## 3. Deployment and environments

### How many environments and projects

**Three environments, two hosted Supabase projects, one Vercel project, one Sentry project.**
**VERIFIED** against live state, not only against the spec.

| Environment | Application | Database | Reachability |
|---|---|---|---|
| Local | `pnpm dev` on `localhost:3000` | Local Supabase in Docker | the engineer's machine |
| Preview | every branch that is not `main` | hosted **development** Supabase project | behind Vercel Authentication |
| Production | `main` | hosted **production** Supabase project | public |

Live confirmations:
- `vercel ls` returns one project, `pgjules1996-6954s-projects/jobhunt`, with deployments tagged
  `Production` and `Preview` only. **VERIFIED.**
- Production Supabase project is `https://fvaaebmjrrrjxxnaiyrb.supabase.co`, read from
  `vercel env pull --environment=production`. A request to its `/auth/v1/health` with the publishable
  (anon) key returns `{"version":"v2.196.0","name":"GoTrue",…}` in 240 ms, so the production project is
  **awake, not paused**. **VERIFIED.** (The pulled env file was deleted immediately after reading the two
  non-sensitive values; no secret value was read or used.)
- Sentry: one organisation (`ghalys-org`), one project (`jobhunt`), environments separated by the
  `environment` tag rather than by separate projects. **RECORDED** —
  [docs/observability/README.md](../observability/README.md) and
  [spec 0002 index line 79](../specs/0002-deployment-and-environments/index.md); I cannot read Sentry.

### What triggers a migration to each

[.github/workflows/db-migrate.yml](../../.github/workflows/db-migrate.yml), read in full. **VERIFIED.**

| Target | Trigger | Steps |
|---|---|---|
| **Development** project | `pull_request` (`opened, synchronize, reopened`) | `supabase link --project-ref $SUPABASE_PROJECT_ID_DEV` → `supabase db push --yes` → ensure `psql` → `psql -v ON_ERROR_STOP=1 -f supabase/seed.sql` |
| **Production** project | `push` to `main` | `supabase link --project-ref $SUPABASE_PROJECT_ID_PROD` → `supabase db push --yes`. **No seed, ever.** |
| **Local** | `pnpm db:start` / `pnpm db:reset` | CLI applies migrations and the seed |

Two deliberate design points in that file, both **VERIFIED** by reading it:

- **Two jobs with hard-wired secrets, not one job choosing a target.** The header comment
  (lines 10-14) states why: a single job would need an expression to pick the project ref, and an unset
  production secret would quietly fall back to the development one, so a push to `main` would report
  success having applied nothing to production.
- **`concurrency: cancel-in-progress: false`** — a half-applied migration leaves a project in a state no
  file describes.

**One gap this workflow itself names** (lines 101-106, **VERIFIED**): Vercel and this workflow build the
same commit in parallel, so nothing enforces the expand-then-contract ordering. An additive migration
arriving late causes a brief self-healing error; a drop arriving early breaks running code with nothing
to catch it. That is written down, not hidden — but it is unenforced.

**The `usage_cap` rows ship by migration, not by seed.** I checked this specifically, because production
never runs `seed.sql` and a cap table with no rows would make `check_usage_gate` treat every call type as
misconfigured. `grep -n "insert into public.usage_cap" supabase/migrations/*.sql` returns two hits,
[20260902120000_usage_gating.sql:45](../../supabase/migrations/20260902120000_usage_gating.sql#L45) and
[20260906120000_model_client_router_usage_cap.sql:12](../../supabase/migrations/20260906120000_model_client_router_usage_cap.sql#L12);
`grep -n "usage_cap" supabase/seed.sql` returns nothing. **VERIFIED** — production gets its caps.

### What happens if a required secret or project-ref is missing

**It fails loudly, in three separate places. Each demonstrated, not assumed.**

**(a) A missing Supabase project ref in CI.** Each job guards it by hand:

```yaml
set -euo pipefail
test -n "$PROJECT_ID" || { echo "::error::SUPABASE_PROJECT_ID_DEV is not set"; exit 1; }
```

GitHub substitutes an *unset* secret as the empty string, so `set -u` alone would not catch it — hence
the explicit `test -n`. I ran that exact fragment:

```
$ bash -c 'set -euo pipefail; PROJECT_ID=""; test -n "$PROJECT_ID" || { echo "::error::SUPABASE_PROJECT_ID_DEV is not set"; exit 1; }; echo "REACHED PUSH"'
::error::SUPABASE_PROJECT_ID_DEV is not set
exit=1
```

`REACHED PUSH` is never printed and the job fails with a named GitHub annotation. **VERIFIED.**

**(b) A missing application secret at build time.** [src/env.ts](../../src/env.ts) validates the whole
contract with `@t3-oss/env-nextjs` at module scope. All eight server variables except `SENTRY_DSN`,
`DEV_SESSION_ENABLED` and `UI_PREVIEW_ENABLED` are `z.string().min(1)` — non-optional, so an absent or
empty value fails the build, not a request. `emptyStringAsUndefined: true` means an empty value in a
`.env` file counts as absent rather than as "set to nothing". **VERIFIED** by reading lines 12-95.

**(c) The Sentry DSNs are *conditionally* required, which is the interesting one.**
`createFinalSchema` ([src/env.ts:166-190](../../src/env.ts#L166-L190)) makes `SENTRY_DSN` and
`NEXT_PUBLIC_SENTRY_DSN` optional when `NEXT_PUBLIC_VERCEL_ENV` is absent (local work, a fresh clone)
and **required the moment the build is a Vercel deployment**, with a message naming spec 0002 AC-13. The
code comment states the failure it prevents: without this, a deployed build with no DSN succeeds and
ships with error reporting silently off. `isServer` is load-bearing there, since the client pass has no
server variables to demand. **VERIFIED** by reading it.

**The one documented escape hatch**: `skipValidation: process.env.SKIP_ENV_VALIDATION === "true"`,
which the comment restricts to the CI job that holds no secrets. `grep` of
[.github/workflows/ci.yml](../../.github/workflows/ci.yml) confirms the build job sets it and the
deploy path does not. **VERIFIED.**

### Live environment variable matrix

`vercel env ls` (authenticated session). **VERIFIED.** Every name required by `src/env.ts` is present in
both Production and Preview:

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` | ✅ Sensitive | ✅ Sensitive | |
| `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` | ✅ | ✅ | different projects per environment |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | ✅ | ✅ | AC-13 satisfied in both |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | ✅ = **`1`** | ✅ | production value read directly; binding rule 4 satisfied |
| `NEXT_PUBLIC_SITE_URL` | ✅ = `https://usejobhunt.dev` | ✅ | |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | ✅ | ✅ | |
| `OPENAI_API_KEY` | ✅ (5d ago) | ✅ (5d ago) | |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ (5d ago) | ✅ (5d ago) | |
| `UI_PREVIEW_ENABLED` | **absent** | ✅ | fails closed in production, by design |
| `DEV_SESSION_ENABLED` | **absent** | **absent** | fails closed everywhere deployed, by design |

Both absences match `src/env.ts`'s own `z.stringbool().default(false)` and its recorded decision that
`DEV_SESSION_ENABLED` is "no longer set on Vercel Preview". **VERIFIED** — the live matrix matches the
documented design with no drift.

---
## 4. Is the deployed site actually live and current?

### Live fetch of production

```
$ curl -s -o prod.html -D prod.headers -w "status=%{http_code} time_total=%{time_total}s size=%{size_download}\n" https://usejobhunt.dev/
status=200 time_total=0.278645s size=78740
```

Response headers, **VERIFIED**:

```
HTTP/2 200
server: Vercel
date: Thu, 10 Sep 2026 20:18:54 GMT
cache-control: public, max-age=0, must-revalidate
x-nextjs-prerender: 1
x-nextjs-stale-time: 300
x-vercel-cache: HIT
age: 3236
strict-transport-security: max-age=63072000
x-matched-path: /
content-length: 78740
```

Other live probes, all **VERIFIED**:

| URL | Status | Time | Result |
|---|---|---|---|
| `https://usejobhunt.dev/` | **200** | 0.279 s | 78,740 bytes of real HTML |
| `https://usejobhunt.vercel.app/` | **308** | 0.189 s | → `https://usejobhunt.dev/` — the old-host redirect spec 0007 AC-4 depends on is working right now |
| `https://usejobhunt.dev/sign-in` | **200** | 1.451 s | public |
| `https://usejobhunt.dev/profile` | **307** | 0.290 s | → `/sign-in?next=%2Fprofile` |
| `https://usejobhunt.dev/search` | **307** | 0.424 s | → `/sign-in?next=%2Fsearch` |
| `https://usejobhunt.dev/health` | **307** | 2.896 s | → `/sign-in?next=%2Fhealth` |

So the protected layout's session guard is live in production and the deep-link return path works.
**VERIFIED.**

### Is it serving the current `main`?

**Yes for `origin/main`; no for the local working copy, and both halves matter.**

I resolved the deployed commit directly rather than inferring it. `vercel inspect` gives the production
deployment id; the Vercel REST API then gives its git metadata:

```
$ vercel inspect https://jobhunt-fyzkdw6vk-pgjules1996-6954s-projects.vercel.app
    id       dpl_x3zFxHyFRbg7o76XofaCBoQCYMe9
    target   production
    status   ● Ready
    created  Thu Sep 10 2026 15:24:03 GMT-0400 [57m ago]
  Aliases
    ╶ https://usejobhunt.dev
    ╶ https://usejobhunt.vercel.app
    ╶ https://jobhunt-git-main-pgjules1996-6954s-projects.vercel.app

$ curl -H "Authorization: Bearer <cli token>" https://api.vercel.com/v13/deployments/dpl_x3zFxHyFRbg7o76XofaCBoQCYMe9
{
  "target": "production",
  "readyState": "READY",
  "created": "2026-09-10T19:24:03.803Z",
  "sha": "7a2c83cf12b436308b6db8f073326f7cee9564d4",
  "ref": "main",
  "msg": "Merge pull request #121 from ghalynho10/feat/cross-vendor-self-check\n\nfeat: check every claimed skill match on a second vendor"
}
```

**VERIFIED**: production serves commit `7a2c83c` (the PR #121 merge), from branch `main`, Ready, built
in 51 s, aliased to `usejobhunt.dev`. `git rev-parse origin/main` is `7a2c83c` — **production is exactly
`origin/main`, not a stale build.** The `age: 3236` on the HTML (54 min) is consistent with a deployment
57 min old; the page is a static prerender (`x-nextjs-prerender: 1`) served from CDN cache.

**But local `main` is 2 commits ahead of `origin/main` and unpushed.** `git rev-list --left-right --count
origin/main...HEAD` returns `0  2`. **VERIFIED.** Those two commits are `d6593ad`
(`docs(checkpoint): …`) and `2cb6bd1` (`docs(overview): bring the reference document up to the shipped
v1 loop`), touching only `docs/overview.md` (+50/-16) and `docs/session-notes.md` (+11/-2) —
`git diff --name-only origin/main..HEAD` returns exactly those two files. **VERIFIED.** So no code is
undeployed, but **the document that describes this project as a complete v1 loop exists only on this
machine.** If the portfolio story points at `docs/overview.md`, it is not yet public.

Production database also confirmed current: all nine `public` tables exist on the production project and
every one refuses an anonymous caller (section 5 and 8 below), so the migration workflow has been
reaching production. **VERIFIED.**

### Has a real person used the full flow end to end in an actual browser?

**No. Not on the deployed production site. This is the largest untested surface for a v1 claim, and it is
not a minor caveat.**

I looked for this specifically rather than assuming either answer. Here is everything I found, split into
what *has* been driven on deployed production and what has not.

**Driven against deployed production by a real person (RECORDED, with dates):**

- The **OAuth handshake**, 2026-08-31 — both Server Actions return a 303 to GoTrue carrying
  `redirect_to=https://usejobhunt.dev/auth/callback` with a PKCE verifier cookie with no `Domain`
  attribute, and production GoTrue accepts that redirect and forwards to both real client ids.
  [scope.md:141](../scope/scope.md).
- The **Google consent screen**, 2026-09-01 — reads "to continue to JobHunt" with the JobHunt mark, and
  Google itself surfaces links to `https://usejobhunt.dev/privacy` and `/terms`.
  [scope.md:186](../scope/scope.md). The Google app is therefore published out of Testing, so the
  100-user lifetime cap is lifted.
- The **rollback drill**, 2026-08-23 (section 5).
- The **link-unfurl check** on `usejobhunt.dev`, 2026-08-30.
- The **marketing and legal pages** — and by my own probes just now, the homepage, sign-in, and the three
  protected-route redirects.

**Driven in a real browser but against a LOCAL build, never deployed production
(RECORDED, and this is the whole v1 loop):**

- Feature 11 (job search & results list): "the whole thread driven in a real browser against the local
  stack and the real Adzuna API" — [scope.md:232](../scope/scope.md). **VERIFIED** quote.
- Feature 12 (apply redirect & application record): the three load-bearing steps are marked
  "**Production build**", which
  [spec 0014 verify.md:9](../specs/0014-apply-redirect-and-application-record/verify.md) defines as
  `pnpm build && pnpm start` on localhost, not the deployed environment: "Run `pnpm build && pnpm start`
  for those two." **VERIFIED** quote.
- Feature 14 (fit scoring): browser steps "Driven by the engineer in a real browser on 2026-09-07,
  signed in as `dev-one@example.test`" —
  [spec 0015 verify.md:22](../specs/0015-fit-scoring-with-shown-reasoning/verify.md). **VERIFIED** quote.
  `dev-one@example.test` is a minted local fixture identity on the reserved `.test` domain; no such
  account exists on production.
- Feature 17 (cross vendor self check): the one step that would have rendered a full scored-and-checked
  `/search` page in a browser was **descoped** (section 8), in favour of a targeted probe. The probe ran
  against the real vendors but from a test process, not a page.

**What that adds up to.** The sequence *profile save → search → 20 concurrent scores → 20 concurrent
cross-vendor checks → ranked render → apply → application row* has never run on `usejobhunt.dev`. It has
run, with real vendors and real Adzuna, on a local production build. **INFERRED**, from the absence of any
contrary record across `scope.md`, all 19 `verify.md` files, `docs/experiments/`, and
`docs/session-notes.md`.

**Why this specifically matters rather than being pedantic** (**INFERRED**):

1. Production is the only environment with the production Supabase project, the production OAuth
   redirect allowlists, and `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1`. A failure that only appears there
   has nowhere to be caught.
2. The production `usage_cap` rows have never been consumed by a real call, so the gate's production path
   is unexercised. **I could not verify this directly** — `usage_gate_counter` deliberately carries no RLS
   policy, so PostgREST cannot see it at all (spec 0011), and reading it needs the production secret key,
   which this audit did not use. The claim rests on the absence of any production loop run, not on a counter
   reading. To check it properly, read that table through `psql` against the production project.
3. The Sentry monitors' **`production` environment copies have never had a denominator** (section 5).
4. `docs/overview.md:136` describes this exact flow in the present tense — "a real person signs in with
   Google or GitHub on the live URL, fills in identity, skills, work history and preferences, searches
   real listings, and gets them back ranked…" — which reads as a record of it happening. It is a
   description of what the product does, and it is accurate as that; it is not evidence that it has.

**This is also the cheapest gap on the list to close.** One sign-in on `usejobhunt.dev` with a real
Google account, one profile, one search (1 of 2,000 monthly Adzuna calls), one apply. Roughly 20
`ai_scoring` + 20 `ai_check` calls, a few cents. It would simultaneously give the production Sentry
monitors their first real denominator.

---
## 5. Observability — tested, not inventoried

There are **six** monitoring mechanisms. I checked each for a correctness bug individually. **Three have
a real defect or a real blind spot, and one of those is load-bearing for the resume claim.**

### 5.1 Sentry metric monitor: `usage_gate.check` failure rate

**Supposed to detect**: the usage gate total-denial outage — the named risk the project was written
against, where every metered action is denied for every user for weeks while the absolute event count
stays tiny.

**Configuration** (**RECORDED**, [docs/observability/README.md](../observability/README.md) `## Alert rules`
and [docs/experiments/0011-usage-gating-and-kill-switch.md](../experiments/0011-usage-gating-and-kill-switch.md),
both 2026-09-03; I cannot read Sentry): dataset `Spans`, visualize `failure_rate()`, interval `1 day`,
High Above `0.2`, Medium Above `0.19`. Filters `span.description:usage_gate.check` **and**
`failure.kind is not session_missing`, so the numerator is `usage_gate_misconfigured`,
`database_unavailable` and `external_service_failed` only. One copy in `development`, one in `production`.

**Does it actually detect that?** **RECORDED as proven, in `development` only.** The forced-failure chain
is recorded link by link in the experiments file: a temporary `checkUsageGate("smoke_test_unknown")`
loaded through `/profile`, 25 `usage_gate_misconfigured` events, 25 `usage_gate.check` spans, 25 root
spans, grouped into one issue, threshold crossed, monitor's own next evaluation created a new issue, the
connected alert's "A new issue is created" trigger fired, a real email delivered to `mghalynho@gmail.com`.
Eight links, all on 2026-09-03.

**The subtle bugs I went looking for — three found, all already written down, which is to the project's
credit:**

1. **`/health` spans are discarded at ingest and the code looks perfectly correct.** Sentry's project
   inbound filter "Filter out health check transactions" throws away the whole `GET /health`
   transaction and every span nested in it, while error events on the same request arrive normally. The
   first smoke-test attempt read as "span never created" with 26 error events present and 0 of 10.2K
   spans matching. Ruled out by `debug: true` showing the span finishing correctly, no client-side drop,
   no `beforeSendTransaction`, no SDK filter list. **RECORDED** in full. Spec 0011 AC-11 now names
   `/profile` as the required route. I independently confirmed the route still exists and is still
   auth-gated: `curl https://usejobhunt.dev/health` → 307 to sign-in. **VERIFIED.**
2. **There is no attempt floor, so a single failure in a quiet day reads as 100% and fires.** AC-10
   specified "a ratio with an absolute attempt floor"; Sentry's Threshold form has no minimum sample
   count anywhere. The 1-day interval is the partial mitigation. **RECORDED**, verified in the form on
   2026-09-03. This is a **false-positive** bug, not a miss — the less dangerous direction, but it means
   the first real production failure of any kind will page.
3. **A metric monitor detects but does not notify.** Creating the monitor created no alert; the first
   firing produced a correctly-assigned Critical issue and delivered *nothing*, because Connected Alerts
   was empty. **RECORDED**, and the project's own note is the right one: "a paper review of the alert rule
   would pass it every time". An alert was attached by hand and delivery proven three ways.

**The blind spot I found that is NOT written down**: the `production` copies of both monitors have
**never had a denominator**. `failure_rate()` over zero spans is undefined, and nothing has ever called
`checkUsageGate()` on production (section 4). So the production monitors are configured-and-connected but
unexercised. The smoke test deliberately ran against `development` only, for a stated and correct reason
(Preview samples at 0.1). **INFERRED** from section 4's finding plus the experiments file's own scoping
sentence. This is not a configuration error; it is an untested instrument.

### 5.2 Sentry metric monitor: `kill_switch.read` failure rate

**Supposed to detect**: the kill switch read failing, which invariant 3 treats as "switched on" — i.e. all
gated calls stopped.

**Configuration**: same shape, filters `span.description:kill_switch.read` only. Numerator is its own
existing kinds (`database_unavailable`, `record_not_found`, `response_malformed`). **RECORDED**, same
sources.

**Does it actually detect that?** Partly. The alert *delivery* chain was proven on 2026-09-03 via the
`usage_gate.check` monitor. I found **no record of a forced `kill_switch.read` failure** producing a
`kill_switch.read` span that crossed its own threshold. The two rules were deliberately separated because
"a kill switch outage and a gate outage are different failures with different causes and different spans"
— and the separation means the gate's proof does not transfer. **INFERRED** from the absence in
`verify.md` and the experiments file. The mechanism is identical to the proven one, so the risk is low,
but "verified by a real forced failure" is true of one of the two rules, not both.

A genuinely nice property, **VERIFIED** by reading
[20260821120000_app_settings.sql](../../supabase/migrations/20260821120000_app_settings.sql) and
spec 0002's reasoning: `app_settings` has RLS enabled **and forced** with zero policies plus an explicit
`grant select to service_role`. Without that grant the read would be refused, and a refused read is
defined as "switched on" — so the switch would sit permanently engaged with the visible failure rendering
exactly as designed. The grant was written against the installed Supabase skill's own (incorrect)
description and then confirmed necessary on 2026-08-22 by
`has_table_privilege('service_role','public.scaffold_check','select')` returning false. Live now:
`select * from public.app_settings` returns `1 | f | 2026-09-10 20:19:42+00` — one row,
`kill_switch_enabled = false`. **VERIFIED.**

### 5.3 UptimeRobot monitor 1 — `https://usejobhunt.dev`

**Supposed to detect**: the site stops answering.

**Does it?** For that narrow question, yes — and the production origin answered my own probe 200 in
279 ms. **VERIFIED** that the target is public and returns 200.

**🔴 The correctness bug the prompt asked me to look for, and it is real**: the homepage is a **static
prerender served from Vercel's CDN** — `x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, `age: 3236`.
**VERIFIED** from the live headers. So this monitor reports "up" as long as Vercel's CDN can serve a
cached HTML file. It would report Up through:

- a paused or broken production Supabase project (the README names this one explicitly),
- both model vendors being down,
- Adzuna being down,
- `usage_cap` being misconfigured so every gated call is denied,
- a broken OAuth configuration, or
- every authenticated route returning 500,

because none of those touch `/`. The README names the database half of this blind spot honestly
("It watches Vercel, so it reports the site up while a database underneath it is paused") and the
protection half. It does **not** name the CDN-static half or the vendor half. The project's own reasoning
for watching `/` rather than a status route — "a route that only reports on itself proves less than the
page a visitor loads" — is sound in general but does not hold for a page that is a cached static file:
this page proves strictly less than a status route that touched the database would.

**What would close it** (**INFERRED**): a monitor on an unauthenticated route that actually reads
something. There is no such route today: `/health` lives inside `(app)` and is auth-gated (307 live), the
only two route handlers are `src/app/go/route.ts` and `src/app/auth/callback/route.ts` (`src/app/api/` does
not exist at all — `ls` returns "No such file or directory", **VERIFIED**), and `AGENTS.md`'s rule is that
route handlers under `src/app/api/` "may not read or write user data". So a public liveness route that
touched Postgres would need a spec decision, not just a file.

### 5.4 UptimeRobot monitor 2 — `https://usejobhunt.vercel.app`

**Supposed to detect**: the 308 redirect from the old host breaking. That redirect is load-bearing for
spec 0007 AC-4 — if the old host ever served the application again, a sign-in started there would write
the PKCE verifier on a hostname the callback never returns to and sign-in would fail at the exchange.

**🔴 It cannot detect that, and the project says so.**
[docs/observability/README.md](../observability/README.md), verbatim:

> **Known limitation on the second monitor, recorded rather than assumed fixed.** As configured it
> reports Up whether that host redirects or serves the application, so it cannot detect the one thing it
> was added for. The fix is to invert its expected status codes, so `200` counts as down and `3xx` as up.
> Until that is applied, the redirect is proved only by the manual `curl` step in spec 0007's
> `verify.md`, not by the monitor.

**VERIFIED** as a quote. **This is a monitor that has never been able to detect its own stated purpose,
and it is still in that state today.** I cannot read UptimeRobot's settings to confirm the inversion has
not since been applied, so the configuration claim is **RECORDED**, not VERIFIED. What I *can* verify is
that the redirect itself is healthy right now: `curl -I https://usejobhunt.vercel.app/` → `308`, location
`https://usejobhunt.dev/`. **VERIFIED, 2026-09-10.**

### 5.5 Supabase pause warnings

**Supposed to detect**: a free-plan project pausing for insufficient database activity.

**Mechanism**: Supabase's own email, roughly a week ahead, and nothing else. A keep-awake job was
considered and declined. **RECORDED**, [README.md](../observability/README.md) and
[spec 0002 index:282](../specs/0002-deployment-and-environments/index.md).

**Is it tested?** Spec 0002's verify line 201 lists AC-16 as "uptime monitor result plus both pause
emails", so **RECORDED** as both emails having been received. Not reproducible by me.

**The real current status, which I can check**: both projects are awake. Production GoTrue answered in
240 ms (section 3). The local stack's containers are up. **VERIFIED** for production; the development
project I did not probe.

**The blind spot, stated in the README and worth repeating**: production is the *more* exposed project,
because until real users exist nothing touches it, so it will pause while being perfectly healthy — and
monitor 5.3 would report the site Up throughout.

### 5.6 Sentry spend notifications

**Supposed to detect**: Sentry quota approaching exhaustion, because when the quota is gone both halves of
the failure-rate alert stop arriving and a silent alert looks exactly like a healthy application.

**Configuration**: Settings → Subscription → Manage spend notifications, owners and billing members at
80% of reserved volume. **RECORDED**. Spec 0002's own follow-up at index line 307 says the box
"stays open until the setting is actually confirmed on in the Sentry organisation" — and that box is
**still `- [ ]` unticked**, while verify.md line 201 lists AC-15 as met. **VERIFIED** that the two
disagree. So whether this is actually switched on rests on the verify line, not on the spec's own
confirmation box.

### 5.7 What is registered but not alerted on — the number that matters most

[docs/observability/spans.md](../observability/spans.md) registers **23 named spans**. Exactly **2** are
alerted on. **VERIFIED**: `grep -c "^| \`" docs/observability/spans.md` → 23; `grep -c "| Yes"` → 2.

The 21 unalerted spans include every operation in the AI pipeline and every write in the product:
`ai.call_tier`, `scoring.score_listings`, `search.run`, `application.record`, `application.remove`,
`profile.save_identity`, `profile.save_skills`, `profile.save_work_experience`,
`profile.save_preferences`, `auth.sign_in`, `auth.callback`, `door.decide`, `landing_rule.decide`, and
the read spans.

**And `scoring.score_listings` carries a trap its own row names**, quoted verbatim (**VERIFIED**):

> IT HAS NO FAILURES OF ITS OWN: every per listing outcome is a `Result` the batch collects rather than a
> throw, so this span's own failure ratio would read as zero through an outage where all twenty calls
> failed.

So if anyone ever builds a status-based alert on that span, it is guaranteed to be silent through a total
scoring outage. The row says the alert must be built on its attributes (`scored`, `refused`, `failed`,
`checked`, `checkSkippedEmpty`, `flagged`, `checkUnverifiable`) instead. **That alert does not exist.**
The attributes are recorded; nothing reads them.

I verified the attribute partition is genuinely enforced rather than merely asserted:
[score-listings.ts:144-160](../../src/features/scoring/score-listings.ts#L144-L160) narrows every variant
of `ListingOutcome["check"]` by name and exhausts the string side against `const exhaustive: never = check`
with **no cast anywhere** — so adding a fifth outcome fails `tsc`. **VERIFIED** by reading it, and
`pnpm typecheck` exits 0. (A stale comment four lines above still claims the *test* does this job; see
section 11.)

### Observability summary

| # | Mechanism | Detects its stated purpose? | Proven by a real forced failure? |
|---|---|---|---|
| 5.1 | Sentry `usage_gate.check` rate, `development` | Yes | **Yes**, 8-link chain, 2026-09-03 (RECORDED) |
| 5.1 | Sentry `usage_gate.check` rate, `production` | Configured, **zero denominator ever** | No |
| 5.2 | Sentry `kill_switch.read` rate | Presumed (same mechanism) | **No record of a forced `kill_switch.read` failure** |
| 5.3 | UptimeRobot → `usejobhunt.dev` | Only that the CDN serves a cached static file | Partly (real check results, 2026-08-30) |
| 5.4 | UptimeRobot → `usejobhunt.vercel.app` | **No — cannot, by its own record** | No |
| 5.5 | Supabase pause emails | Yes | RECORDED as both emails received |
| 5.6 | Sentry spend notifications | Presumed | No; spec 0002's own confirmation box still unticked |

---
## 6. What this actually costs to run

### Platform costs: zero, by design, on free tiers throughout

| Thing | Plan | Cost | Source |
|---|---|---|---|
| Vercel | **Hobby** | $0 | [spec 0002 index:288](../specs/0002-deployment-and-environments/index.md) — "pauses the whole project when free usage is exhausted. That is the intended hard stop" **RECORDED** |
| Supabase × 2 projects | **Free** | $0 | [spec 0002 index:282](../specs/0002-deployment-and-environments/index.md) **RECORDED**; the trade-off is pausing |
| Sentry | Free quota | $0 | **RECORDED**, with spend notifications at 80% |
| UptimeRobot | Free | $0 | [spec 0002 index:221](../specs/0002-deployment-and-environments/index.md) **RECORDED** |
| GitHub Actions | Free, public repo | $0 | repo made public 2026-08-22 to get branch protection **RECORDED** |
| Adzuna API | Free tier | $0 | limits 25/min, 250/day, 1000/week, 2500/month, fetched from their ToS — [spec 0013 rationale:66](../specs/0013-job-search-and-results-list/rationale.md) **RECORDED** |
| Domain `usejobhunt.dev` | registrar | not recorded anywhere in the repo | — |

**Every dollar this project spends is a model call.** Nothing else bills.

### Current caps, read live

From the running database (`docker exec supabase_db_jobhunt psql … 'select * from public.usage_cap'`).
**VERIFIED**, and these are the same values production holds because the rows ship by migration
(section 3):

| call_type | scope | period | cap |
|---|---|---|---|
| `job_search` | account | week | **25** |
| `job_search` | global | day | 66 |
| `job_search` | global | month | 2,000 |
| `ai_scoring` | account | week | **500** |
| `ai_scoring` | global | day | 1,320 |
| `ai_scoring` | global | month | 40,000 |
| `ai_check` | account | week | **500** |
| `ai_check` | global | day | 1,320 |
| `ai_check` | global | month | 40,000 |

The AI numbers are `job_search`'s × `RESULTS_PER_PAGE` (20), because the call shape is one `ai_scoring`
call **per listing**, and `ai_check` is sampled at 1.0 so every scored listing gets a check.
**VERIFIED** in [20260906120000_model_client_router_usage_cap.sql:1-11](../../supabase/migrations/20260906120000_model_client_router_usage_cap.sql).
`job_search`'s own 66/day and 2,000/month sit inside Adzuna's 250/day and 2,500/month. **VERIFIED** by
arithmetic against the ToS figures above.

### Current rates

**RECORDED**, [spec 0012 rationale:86-93](../specs/0012-model-client-router/rationale.md), prices
re-verified by the engineer 2026-09-06 against the vendors' own pages:

| Model | Input | Output |
|---|---|---|
| `gpt-5.6-luna` (`ai_scoring`) | $0.20 / MTok | $1.20 / MTok |
| `gemini-3.5-flash-lite` (`ai_check`) | $0.30 / MTok | $2.50 / MTok |

### Vendor spend so far

**I cannot read either billing dashboard** (no billing API access, and using the production keys for that
is outside what this audit needs). Everything here is **RECORDED** from the engineer's own dashboard reads,
with dates.

| Date | Vendor | Reading | Source |
|---|---|---|---|
| 2026-09-09 | OpenAI (`platform.openai.com`) | **7 requests, 8.404 K input tokens, $0.00** | [spec 0019 verify.md](../specs/0019-cross-vendor-self-check/verify.md), the dashboard-reconciliation step |
| 2026-09-09 | Google AI Studio, project Jobhunt | **12 requests, `gemini-3.5-flash-lite`, 100% success** | same |

Those two reads reconcile exactly against this repo's own counters including the two auth-failed calls
(14 `ai_check` consumed − 2 that never reached Google = 12; 7 `ai_scoring` consumed = 7 requests), which
the spec correctly flags as daily aggregates that corroborate the day but do not isolate the probe window.

**The larger spend is the eval harness, and its dollar figure is nowhere on record.** Counter readings
**RECORDED** in [docs/session-notes.md](../session-notes.md): `ai_scoring global month` stood at
**1,230 of 40,000** at the end of 2026-09-09, with ~195 calls spent on 2026-09-08 by eval runs alone.
**INFERRED**: at the spec's own derived per-call figure (~$73.60 / 40,000 = $0.00184), 1,230 calls ≈
**$2.26 lifetime `ai_scoring` spend**. An 80-call full eval run ≈ **$0.15**. That is the same order as the
engineer's own "about four cents" estimate and well under a dollar either way.

**🔴 A cost change nothing in the repo records.** `docs/session-notes.md` (written 2026-09-10) states:
"the tier move has a **cost side effect nothing else records: `ai_check` calls now cost money, where the
Free tier was $0**". The Google AI Studio account reads **Tier 1**, not Free, with
`gemini-3.5-flash-lite` rated 4,000 requests/minute. **VERIFIED** as a quote from the session notes; the
dashboard reading itself is **RECORDED**. Until now, every `ai_check` call was free. That changes the
arithmetic behind spec 0019's per-listing chaining and behind any future feature reusing the tier, and
no spec, scope row, or `tiers.ts` comment mentions it.

### What a normal week of real usage costs, at current rates

The project's own derivation (**RECORDED**, [spec 0012 rationale:99](../specs/0012-model-client-router/rationale.md)),
at the *global month* ceiling of 40,000 calls each:

> `ai_scoring` on GPT-5.6 Luna costs at most about **$73.60 a month** … and `ai_check` on Gemini
> 3.5 Flash-Lite costs at most about **$32 a month**, a combined worst case of about **$105.60 a month**.

And the honest footnote beside it (**VERIFIED** quote): the token counts behind that, "roughly 2000 input
and 500 output tokens for a scoring call … and 1000 input and 200 output tokens for a check call, remain
**placeholders reasoned from the shape of the task, not measured against a real prompt**", with
`ai_scoring`'s output adjusted to ~1,200 for billed reasoning tokens.

**One half of that placeholder is now measurable and is ~40% high.** 8,404 input tokens over 7
`ai_scoring` requests = **~1,200 input tokens per call**, against the ~2,000 placeholder. **VERIFIED**
arithmetic on the recorded dashboard figure. Output tokens remain unmeasured by anything.

**A normal week, per account, at the account weekly cap** — 25 searches × 20 listings = 500 `ai_scoring`
+ 500 `ai_check`. **INFERRED** from the spec's own per-call figures:

| | calls | per call | week |
|---|---|---|---|
| `ai_scoring` | 500 | ~$0.00184 | ~$0.92 |
| `ai_check` | 500 | ~$0.00080 | ~$0.40 |
| Adzuna, Vercel, Supabase, Sentry | — | $0 | $0 |
| **Total** | | | **~$1.30 / week / account at full cap** |

Substituting the measured 1,200 input tokens brings `ai_scoring` to ~$0.84, so **~$1.25/week**. A
realistic week — a handful of searches rather than 25 — is **cents**. The binding ceiling, if several
people used it hard, is the global day cap of 1,320 each: **INFERRED** ~$3.50/day ≈ **$105/month**, which
is exactly the spec's figure.

**🔴 The cost nobody can see from inside the system.** `grep -rn "usage.inputTokens\|totalTokens\|promptTokens" src/ test/`
returns exactly one hit, and it is a fixture value in `client.test.ts:90`. **VERIFIED.** The application
records **no tokens and no dollars anywhere** — `usage_cap.cap_value` counts *calls*, not spend, and
`usage_gate_counter` counts attempts and consumptions. So:

- The only spend visibility is two vendor dashboards, read by hand.
- Feature **28, "Spend visibility & gating polish"** — whose `Done when` begins "a user can see their own
  usage against their cap" — is `planned`, in **v1.5**. **VERIFIED** at [scope.md:413-416](../scope/scope.md).
- Spec 0012's own plan was that "feature 16's eval harness, once real prompts exist, is what should replace
  this placeholder with a measured number". The eval harness does not record tokens. **VERIFIED** — so
  that placeholder is still a placeholder, and the $105.60/month figure has never been checked against a
  real bill.

---
## 7. Full live test run and git state

### `pnpm test` (unit)

```
$ pnpm test
$ vitest run --project unit
 RUN  v4.1.11 /Users/ghaly/Documents/Work/Personal/jobhunt

 Test Files  89 passed (89)
      Tests  1221 passed (1221)
   Start at  16:18:02
   Duration  7.19s (transform 4.14s, setup 37.04s, import 9.05s, tests 3.71s, environment 947ms)
[exited with code 0]
```

**VERIFIED. 89 files, 1,221 tests, 1,221 passed, 0 failed, 0 skipped, exit 0.** Needs nothing running.

### `pnpm test:integration`

```
$ pnpm test:integration
$ vitest run --project integration --project integration-serial
 RUN  v4.1.11 /Users/ghaly/Documents/Work/Personal/jobhunt

 Test Files  23 passed | 2 skipped (25)
      Tests  132 passed | 8 skipped (140)
   Duration  26.47s
[exited with code 0]
```

**VERIFIED. 132 passed, 8 skipped, exit 0**, against the real local Supabase stack (12 containers up).

### Why the 8 tests and 2 files are skipped, traced individually

All eight sit behind `describe.skipIf(!liveModelCallsEnabled())`, gated on
`TEST_LIVE_MODEL_CALLS_ENABLED` — the flag the prompt forbade setting, because these spend real vendor
money. The gate is in [test/helpers/model-client.ts](../../test/helpers/model-client.ts): a
`z.stringbool().default(false)`, read at call time, where a malformed value is treated the same as unset —
"fail closed, never spend money on a value that does not clearly mean yes". **VERIFIED** by reading it.

| File | Skipped tests | Whole file skipped? |
|---|---|---|
| `test/integration/fit-scoring-live.test.ts` | 2 | **Yes** — no unconditional describe |
| `test/integration/model-client-router-live.test.ts` | 2 | **Yes** — same |
| `test/integration/fit-scoring-isolation-live.test.ts` | 3 | No — its cross-account isolation test runs unconditionally |
| `test/integration/cross-vendor-check-live.test.ts` | 1 | No — its pure `deriveTimeoutMs()` describe runs |
| **Total** | **8** | **2 files** |

2 + 3 + 1 + 2 = 8, and the two fully-gated files are the two reported skipped. The parts sum to the totals.
**VERIFIED** by `grep -n "describe\|it(" ` on each of the four files.

**No test anywhere is skipped for being broken, unfinished, or quarantined.** Every skip is the paid-call
flag. **VERIFIED** — `grep -rln "describe.skip\|it.skip\|skipIf\|runIf"` across `src/` and `test/` returns
only the live-call files, the helper, `test/helpers/model-client.test.ts`, two `score*.test.ts` (which use
`runIf`-adjacent helpers, not skips of their own), `model-client-router-usage-cap.test.ts`, and
`src/lib/supabase/secret.ts`.

### The other gates, exit codes captured individually

```
$ pnpm lint         → LINT_EXIT=0       (eslint . --max-warnings=0, no output)
$ pnpm typecheck    → TYPECHECK_EXIT=0  (next typegen && tsc --noEmit, "✓ Types generated successfully")
$ pnpm format:check → FORMAT_EXIT=0     ("All matched files use Prettier code style!")
```

**VERIFIED.** I re-ran all three capturing `$?` individually after a first attempt where a trailing `echo`
made the compound exit code meaningless — per this repo's own reflex about `||`/exit-status evidence.

### 🔴 Known-flaky test, named with its recorded rate

**`test/integration/landing-rule.test.ts`, failing case "sends a user with no profile row to /profile",
at roughly 13% — 2 failures in 15 full-suite runs.** **RECORDED**,
[docs/session-notes.md](../session-notes.md) (2026-09-10) and repeated in PR #121's body
([scope.md:342](../scope/scope.md)).

The recorded diagnosis, which is unusually good: the cause is a transient `hasProfileRow()` failure, which
[src/lib/landing-rule.ts](../../src/lib/landing-rule.ts) **deliberately** maps to `/search` under spec 0008
AC-7a (an errored read is not an empty profile). So the assertion cannot tell a real `/search` from a
fallback `/search` and only notices because the expected value happens to be the other one. It does not
reproduce in isolation (0 failures in 10 single-file runs), pointing at contention under full-suite load.
The `usage_cap` race hypothesis was **disproven by runtime per-file timing**, not by reading the config:
across five runs the `integration` project always finished before the first `integration-serial` file
started (gap 506-600 ms), no two serial files overlapped, and the two cap-mutating files never overlapped.
It belongs to spec 0008, not to feature 17, and is not in that branch's diff.

**My own sampling, and it proves nothing — which is the point.** I ran `pnpm test:integration` **six
times** in this session. **All six green**, 132 passed / 8 skipped every time, exit 0 every time.
**VERIFIED.** At a 13% per-run failure rate, six consecutive passes has probability 0.87⁶ ≈ **43%** — so my
clean sweep is the single most likely outcome and is *not* evidence the flake is gone. I am reporting it as
a sample, not as a refutation.

Two knock-on facts from the same record, both worth knowing:
- **The full logs of that investigation are gone.** They lived in a scratchpad directory that does not
  survive the session; the session-notes entry is all that is left. **VERIFIED** quote.
- The recorded cheap fix — have that test assert `capturedEvents()` alongside the path so the next
  occurrence names its own cause — **has not been applied**. `beforeEach` resets captured events and the
  failing case never reads them, so every occurrence still throws away its own explanation. **VERIFIED**
  that no such assertion exists in the file.

One further intermittency, unrelated to tests: **GitGuardian Security Checks reports `skipping` on some
PRs and `pass` on others with no configuration change** — skipped on PRs 18 and 92, passed on 19, 20, 40,
41, 94. PR 18 was the branch whose history was rewritten to remove a Supabase secret key that push
protection caught. **RECORDED**, [docs/session-notes.md](../session-notes.md). Still unexplained.

### Git state

| | |
|---|---|
| Current branch | `main` |
| Working tree | **clean** — `git status --short` returns nothing. **VERIFIED** |
| Total commits | **635** (`git rev-list --count HEAD`). **VERIFIED** |
| Local HEAD | `2cb6bd155c94f714d75ca2f6170874ea702ea157` — `docs(overview): bring the reference document up to the shipped v1 loop`, 2026-09-10 15:57 −0400. **VERIFIED** |
| `origin/main` | `7a2c83c` — `Merge pull request #121 …`, 2026-09-10 14:24 −0500. **VERIFIED** after `git fetch origin` |
| Ahead / behind | **2 ahead, 0 behind** (`git rev-list --left-right --count origin/main...HEAD` → `0 2`). **VERIFIED** |
| Unpushed content | `docs/overview.md`, `docs/session-notes.md` only — docs, no code. **VERIFIED** |
| Production deployment | `7a2c83c` = `origin/main`. **VERIFIED** via the Vercel API |
| Specs | **19 of 19 Accepted.** **VERIFIED** by reading every `docs/specs/*/index.md` `**Status**` line |

**Branch protection on `main`, read live** via `gh api repos/ghalynho10/JobHunt/branches/main/protection`.
**VERIFIED:**

```json
{ "required_pull_request_reviews": true,
  "required_status_checks": ["Lint, type check, build",
                             "Apply migrations (development)",
                             "Test (unit, then integration)"],
  "enforce_admins": true,
  "allow_force_pushes": false,
  "allow_deletions": false }
```

Three required checks including the full test job, administrators included, no force pushes, no deletion.
That is stronger than spec 0002 AC-12 recorded (it names only `Lint, type check, build`), so protection has
been tightened since. **INFERRED** consequence: the two unpushed commits sit on local `main` and will need a
pull request to land, which also conflicts with this repo's own standing rule that a branch named for the
commit type be created *before* the first commit ([docs/reflexes.md](../reflexes.md), 2026-08-30).

---
## 8. Re-verifying the current resume bullets, word for word

### Bullet 1

> "Built and deployed a multi-user job search platform end to end: OAuth sign-in (Google, GitHub), profile
> entry, real-time search against the Adzuna API, and application tracking, backed by a six-table Postgres
> schema under 23 row-level-security policies."

| Claim | Verdict | Evidence |
|---|---|---|
| "Built and deployed" | **VERIFIED** | Production serves `7a2c83c` at `https://usejobhunt.dev`, 200 in 279 ms (section 4) |
| "multi-user" | **VERIFIED, with a caveat below** | Per-user isolation is enforced in Postgres and proved in both directions against real minted sessions; the Google OAuth app is published out of Testing so the 100-user cap is lifted (RECORDED, 2026-09-01) |
| "end to end" | ⚠️ **Weaker than it sounds** | The loop is complete *in code* and has been driven end to end in a browser — against a **local** production build, never against `usejobhunt.dev` (section 4) |
| "OAuth sign-in (Google, GitHub)" | **VERIFIED** | `/sign-in` returns 200 live; both providers' Server Actions return 303 to GoTrue with `redirect_to=https://usejobhunt.dev/auth/callback` (RECORDED, 2026-08-31, on production); OAuth-only is the recorded decision, no password path exists |
| "profile entry" | **VERIFIED** | `src/features/profile/`, four save actions with their own spans; `/profile` live, 307 → sign-in |
| "real-time search against the Adzuna API" | **VERIFIED**, and "real-time" is defensible | `src/features/search/adzuna.ts`, `RESULTS_PER_PAGE = 20`, results are fetched per request and **never persisted** — a standing rule. Note: Adzuna returns only a 500-character description excerpt, never the full posting |
| "application tracking" | **VERIFIED, thin** | An `application` row is recorded and `/applications` lists it. That is the whole of tracking today — no statuses, no response rate, no dashboard (feature 23, v1.5), and the guided capture questions are feature 20, unbuilt |
| "**23 row-level-security policies**" | ✅ **VERIFIED EXACTLY — 23** | live query below |
| "**six-table** Postgres schema" | ⚠️ **Undercounts. The schema has 9 tables.** | live query below |

**The policy count, read live from the running database:**

```sql
select count(*) from pg_policies where schemaname='public';   -- 23
```

And every one enumerated, `tablename | policyname | cmd | roles`. **VERIFIED:**

| Table | Policies | Commands |
|---|---|---|
| `profile` | 4 | SELECT, INSERT, UPDATE, DELETE |
| `profile_skill` | **3** | SELECT, INSERT, DELETE — **no UPDATE, by design** (spec 0003 AC-4: "which has no update path by design") |
| `work_experience` | 4 | SELECT, INSERT, UPDATE, DELETE |
| `job_preference` | 4 | SELECT, INSERT, UPDATE, DELETE |
| `application` | 4 | SELECT, INSERT, UPDATE, DELETE |
| `application_answer` | 4 | SELECT, INSERT, UPDATE, DELETE |
| **Total** | **23** | all `to authenticated` |

4+4+4+4+3+4 = 23. The parts sum to the total. **VERIFIED.**

**The table count is where the wording is off.** `select tablename from pg_tables where schemaname='public'`
returns **nine** tables. **VERIFIED:**

| Table | RLS | Forced | Policies | What it is |
|---|---|---|---|---|
| `profile` | ✅ | ✅ | 4 | user data |
| `profile_skill` | ✅ | ✅ | 3 | user data |
| `work_experience` | ✅ | ✅ | 4 | user data |
| `job_preference` | ✅ | ✅ | 4 | user data |
| `application` | ✅ | ✅ | 4 | user data |
| `application_answer` | ✅ | ✅ | 4 | user data — **and nothing in the app reads or writes it** |
| `app_settings` | ✅ | ✅ | **0** | kill switch, one row, deliberately zero policies + `grant select to service_role` |
| `usage_cap` | ✅ | ✅ | **0** | the budget ceilings |
| `usage_gate_counter` | ✅ | ✅ | **0** | the atomic counters, deliberately invisible to PostgREST |

All nine have RLS **enabled and forced**. **VERIFIED.** The three zero-policy tables are deliberate (spec
0002 and spec 0011): RLS on with no policy denies everything to every policy-respecting role, which is why
`usage_gate_counter` cannot be read through the Data API at all.

So the honest reading of the bullet: **"six-table" is the count of user-data tables that carry the 23
policies, and that pairing is internally consistent** — it is the count every spec in the repo uses ("all
six tables", spec 0003 AC-1, spec 0007). But the *schema* is nine tables. `docs/overview.md:138` repeats
"six tables in Postgres", so the undercount is in the project's own prose too, not invented by the resume.

**🔴 One live verification on production, and an important nuance.** I probed the **production** database
as an anonymous caller with the publishable key across all nine tables. Every one refused:

```
profile  {"code":"42501","hint":"Grant the required privileges to the current role with:
          GRANT SELECT ON public.profile TO anon;","message":"permission denied for table profile"} [http=401]
… identical for all nine tables …
```

**VERIFIED, 2026-09-10, against production.** Two things that proves and one it does not:
- All nine tables exist on production, so migrations have reached it. ✅
- The **privilege** gate holds: `anon` has no grants. ✅
- It does **not** prove the 23 RLS policies, because in Postgres the table-privilege check fires *before*
  RLS is consulted — spec 0002 explains this exact distinction ("`BYPASSRLS` bypasses policies but not
  table privileges… two separate checks"). The policies need an *authenticated* caller to exercise, and
  that proof is `test/integration/isolation.test.ts` against the **local** stack with real minted sessions,
  checked for vacuousness by disabling RLS and watching four assertions fail (**RECORDED**, spec 0007
  rationale:7). Production's policy count rests on spec 0003's
  [verify-production.sql](../specs/0003-data-model/verify-production.sql) run on 2026-08-27 plus the fact
  that migrations are the only path in.

---
### Bullet 2

> "Proved the production safety net by breaking things on purpose: a forced-failure chain confirmed Sentry
> alerts fire end to end, a rollback drill recovered a broken deploy in under a minute, and a usage-gating
> function held exactly at its limit under concurrent load (15 accounts, cap of 5, exactly 5 allowed)."

**Claim A — "a forced-failure chain confirmed Sentry alerts fire end to end"**

**RECORDED and unusually well documented — but it was proved in the `development` environment, not
production.** [docs/experiments/0011-usage-gating-and-kill-switch.md](../experiments/0011-usage-gating-and-kill-switch.md),
2026-09-03. All eight links named individually:

forced failure (`usage_gate_misconfigured` via `/profile`) → span recorded (`usage_gate.check` in
`development`) → sampling captured (local rate 1.0) → fingerprint grouped → threshold crossed (>0.2) → new
issue created by the monitor's own next evaluation → connected alert's "A new issue is created" trigger
fired → real email delivered to `mghalynho@gmail.com`.

Delivery was proven **three** separate ways that day, and the distinctions are made carefully: the Send
Test Notification button; a genuine *resolve* transition (thresholds raised to 0.95/0.94, Sentry issue
**592127114** resolved at 21:49 local, recovery email delivered); and then the real **creation** delivery
with thresholds back at 0.2/0.19. The experiments file explicitly notes the first is a test button and the
second is not the trigger AC-11 names, so the claim rests on the third.

**What is accurate in the bullet**: "a forced-failure chain confirmed Sentry alerts fire end to end" — yes,
including the link most projects miss, that **a metric monitor detects but does not notify** and the first
firing delivered nothing until an alert was attached by hand.

**What the phrase "the production safety net" overstates** (⚠️): the chain ran against the development
Supabase project and the Sentry `development` environment. The scope row's own `Done when` says "in a
**non production** project" — **VERIFIED** quote, [scope.md:209](../scope/scope.md) — so this was the
specified behaviour, not a shortcut. But the `production` environment copies of both monitors have never
had a denominator (section 5.7). And the chain covers **2 of 23 registered spans**; nothing in the AI
pipeline, nothing in the search path, and no product write is alerted on at all.

**Claim B — "a rollback drill recovered a broken deploy in under a minute"**

**RECORDED**, [spec 0002 verify.md:167-169](../specs/0002-deployment-and-environments/verify.md),
2026-08-23, and it is a real drill on the live production origin rather than a simulation:

- A one-line PR (`f484d30`, merged as `61566f0`) made the homepage throw unconditionally, with
  `export const dynamic = "force-dynamic"` so the throw happened per request rather than failing the
  build — and the record notes that `pnpm build` *without* the dynamic export failed at
  `Error occurred prerendering page "/"` and never shipped, "confirming the forced dynamic export was
  necessary". That is the difference between proving CI catches bugs and proving the promote path recovers
  a live one.
- Break confirmed: `curl -I` returned a genuine `HTTP/2 500` within a minute of the merge.
- `vercel promote` of `dpl_H126wrYM2xrv5bBDHSfDqBCdbPD9`.
- Recovery confirmed two ways: `curl` returned 200 with the original markup, **and** `vercel inspect` read
  back that same deployment id — so the alias itself repointed rather than a stale cache serving old content.
- The throw was reverted in `5c00b20`.
- "Total window between merge and confirmed recovery: **under a minute**."

**Three honest qualifications** (⚠️, **INFERRED** from the record):
1. It ran against `usejobhunt.vercel.app`, before the custom domain moved (2026-08-30). Same project, same
   alias mechanism; a different hostname.
2. The fault was an unconditional throw on a static page, which is the easiest possible fault class. It
   does not exercise a partial failure, a bad migration, or a slow regression.
3. "Under a minute" is the engineer's own merge→confirmed-recovery window, not an instrumented timestamp
   pair. The promote step itself is near-instant (no build), so the figure is plausible; it is a reported
   window, not a measured interval.
4. The record and `docs/observability/README.md` both state plainly that **promoting does not undo a
   migration** — the database is not part of the deployment. So the drill proves code rollback, not
   recovery from a bad schema change.

**Claim C — "a usage-gating function held exactly at its limit under concurrent load (15 accounts, cap of
5, exactly 5 allowed)"**

**RECORDED and the numbers match exactly.** [spec 0011 verify.md:26](../specs/0011-usage-gating-and-kill-switch/verify.md),
2026-09-03, verbatim:

> Global windows: confirmed 2026-09-03 in two throwaway integration tests, **15 concurrent calls from 15
> distinct real accounts** against a dedicated call type with a global day **cap of 5**, then again with a
> global month cap of 5, each landing **exactly 5 allowed and 10 refused** with the matching reason, counter
> row `attempt_count: 15, consumed_count: 5` both times.

**VERIFIED** as a quote. "15 accounts, cap of 5, exactly 5 allowed" is word-for-word correct, and the
`attempt_count: 15, consumed_count: 5` pair is what makes it non-vacuous: the gate was genuinely consulted
15 times and admitted 5.

**Four things the bullet does not say, and one of them is worth knowing** (⚠️):
1. The drill ran against the **local** Supabase stack, not a hosted project.
2. It used a **dedicated test call type with an artificially lowered cap of 5** — not a production cap. The
   committed caps are 25 / 66 / 2,000 and 500 / 1,320 / 40,000.
3. The tests were **throwaway** and were deleted. What is committed and runs on every
   `pnpm test:integration` is the *account*-window equivalent: a 30-way burst against the real cap of 25
   landing exactly 25 allowed, in `test/integration/usage-gating.test.ts`. **VERIFIED** that this file
   exists and that the suite passes. So the account window is permanently regression-tested; the 15-account
   global-window result is a one-time observation with no standing test.
4. **The month run's first attempt returned one `database_unavailable`** from a transient local connection
   hiccup and passed clean on immediate retry. The record reads that as AC-14 firing correctly under real
   stress rather than as a defect, which is a fair call — but "held exactly at its limit" describes the
   passing run, not the first one.

---
### Bullet 3 — the eval harness

> "Built and verified an eval harness measuring real LLM scoring against an authored ground-truth set: 15
> of 16 pairs landed in their expected band, measuring consistency with the scoring rubric rather than
> independently validated accuracy. One correction came from fixing a wrong ground-truth entry, not the
> model."

**Nothing was re-run.** I read the recorded report files instead. They are in `test/eval/.output/`, which is
**gitignored** — spec 0018's `verify.md` copied the per-pair distributions into the spec precisely because
"a clean checkout or one housekeeping pass loses them and nobody could check this spec's reasoning
afterwards." The files happen to still be on this machine, so I read them directly and the spec's table
reconciles exactly against them.

**The three recorded runs, read from the JSON (`status` field per pair, not the `summary` line):**

| Report file | Started | Filter | Pairs run | Pass | Fail | Failing pairs |
|---|---|---|---|---|---|---|
| `2026-09-08T07-30-40.144Z.json` | 2026-09-08T07:28:28Z | none | 16 | **14** | 2 | `control-one-gap`, `key-domain-mismatch` |
| `2026-09-08T07-35-45.093Z.json` | 2026-09-08T07:33:31Z | none | 16 | **15** | **1** | `control-one-gap` |
| `2026-09-09T03-44-20.367Z.json` | 2026-09-09T03:43:48Z | `control-one-gap` | 1 (15 skipped) | **1** | 0 | — |

All three: `status: "completed"`, `model: "gpt-5.6-luna"`, `bandAnchorsHash: "1b45f524b356"`,
`incomplete: []`. **VERIFIED** by parsing the files.

**So "15 of 16 pairs landed in their expected band" is a real measured number — it is the 07:35 run.**
**VERIFIED.** The bullet is accurate and is not an inference from the 14-of-16 figure that
[scope.md:320](../scope/scope.md) records for the 07:30 run.

⚠️ **The one thing to know about that number**: the pair that failed in the 15-of-16 run is
`control-one-gap` — the very pair whose *expectation* was then corrected. Under today's committed
expectations, the 07:35 distributions would score **16 of 16**. And **no full 16-pair run has been taken
since the correction** — the confirming run on 2026-09-09 ran one pair and skipped fifteen. So "15 of 16"
describes a real run against a ground-truth set that no longer exists in that form. That is not a false
claim; it is a claim whose denominator has moved underneath it.

**"measuring consistency with the scoring rubric rather than independently validated accuracy"** —
✅ **VERIFIED, and this is the most defensible sentence on the resume.** It is almost verbatim what the
project itself records as a known scope limitation.
[spec 0016 index.md:182](../specs/0016-eval-ground-truth-set/index.md), verbatim:

> This set was authored by reading `BAND_ANCHORS` directly, never independently of it, which narrows what
> feature 16's harness can be said to prove. … The consequence is that feature 16's harness proves **the
> scorer reads `BAND_ANCHORS` the way a careful human reader of that same text would, not that
> `BAND_ANCHORS` reflects valid real world judgment about job fit.** Those are two different claims and
> only the first is under test today.

And the influence direction is established with git evidence rather than asserted: the anchors landed in
`e22ba02` (2026-09-06) and a `git log -S` on one anchor's own sentence returns only the creating commit, so
the anchors were never bent to fit the pairs — the pairs were written from the anchors. **RECORDED** in
[docs/experiments/0016-eval-ground-truth-set.md](../experiments/0016-eval-ground-truth-set.md).

**"One correction came from fixing a wrong ground-truth entry, not the model"** — ✅ **VERIFIED.** Spec 0018
is that review, and its conclusion is exactly this: `BAND_ANCHORS`, the anchor hash `1b45f524b356`, the
drift guard, `scoreListing()`, the response schema and every other pair's expectation are **unchanged**;
only `control-one-gap`'s `expectedBand` moved, from `good_match` to `possible_match`, argued from the
`possible_match` anchor text that already existed plus the posting's own sentence "What sets this role apart
is the infrastructure half". **VERIFIED** in [pairs.ts:117-127](../../src/features/scoring/eval/pairs.ts#L117-L127):
`expectedBand: "possible_match"`, no `acceptableBands`.

### The `control-one-gap` margin, from the committed record

**Current state: it passes, at exactly the minimum the harness accepts.**

**RECORDED**, [spec 0018 verify.md:43-45](../specs/0018-band-anchor-review/verify.md), and I confirmed it
against the report file (`distribution` field, not `summary`):

> `control-one-gap` distribution on the confirming run: **`good_match` 2, `possible_match` 3**, read from the
> report's `distribution` field. Run at **2026-09-09T03:44:20Z** against `gpt-5.6-luna`, anchor hash
> `1b45f524b356`, filter `control-one-gap`, 15 pairs skipped, status `completed`, exit 0. The pair
> **passes**, since `possible_match` is the strict majority and clears spec 0017's floor of 3 of 5.

**VERIFIED** — the JSON says `{"good_match":2,"possible_match":3}`, `status: "pass"`. And the spec's own
warning, verbatim:

> Read the split, not the verdict. … the actual margin is the minimum the harness accepts. **Two of five
> reruns still returned `good_match`, so the corrected expectation is confirmed but not by a wide result,
> and one rerun moving the other way would leave no majority at all.**

Full history of that pair's three runs ever taken: old expectation `good_match` lost **4-1**, then **5-0**,
then the corrected `possible_match` won **3-2**. So the old expectation has failed on all three runs, which
is the strong part of the argument; the new one holds by one rerun. ✅ **`control-one-gap` is still holding,
at 3 of 5.**

**A trap this project fell into once and now guards against, worth knowing because it is the reason to trust
these numbers**: the report's `summary` field reads `"possible_match, 5 of 5 succeeded"`, where `5 of 5` is
the **success denominator** (no rerun errored), not the count landing on that band. Reading it as a band
count produced a committed wrong claim in `scope.md` and framed spec 0018's whole first draft, caught by a
cross-check on another model. Every number above comes from `distribution`. **VERIFIED** — I parsed
`distribution` and `status`, never `summary`.

One extra datum from the reports nobody has written down: both full runs observed **all five bands**
(07:30: strong 35 / good 5 / possible 21 / weak 11 / not 8; 07:35: 35 / 4 / 21 / 8 / 12), against spec 0015
AC-2's bar of at least three of five, and both runs' `preferenceLeak` field reads
`{"kind":"consistent","band":"strong_match"}` — the preference-isolation check passed in both. **VERIFIED**
by parsing the files.

---
### Bullet 4 — the cross-vendor grounding check

> "Closed the remaining anti-fabrication gap with a cross-vendor grounding check: a second, independent
> vendor (Google Gemini) verifies every claimed skill against the real listing text before it's shown. A
> forced test proved it catches an invented skill (claimed COBOL where none existed) while leaving genuinely
> grounded skills untouched."

**Claim-by-claim:**

| Claim | Verdict | Evidence |
|---|---|---|
| "a second, independent vendor (Google Gemini)" | ✅ **VERIFIED** | `ai_check` is `googleProvider("gemini-3.5-flash-lite")` where `ai_scoring` is `openaiProvider("gpt-5.6-luna")` ([tiers.ts](../../src/lib/ai/tiers.ts)). A unit test reads the vendor off each model instance's own `provider` string and asserts they differ — not restated by hand ([tiers.test.ts:25-35](../../src/lib/ai/tiers.test.ts#L25-L35)) |
| "independent" | ✅ **VERIFIED**, structurally | The check reads the grounding rule from the **same exported constant** the scorer used (`SKILL_GROUNDING_CRITERION` in `rubric.ts`) and the **same** `buildListingBlock()`, so it judges the same claims under the same rule against the same text. Different vendor, different model, shared rule — which is the right kind of independence here |
| "verifies **every** claimed skill" | ⚠️ **Not every — and the exceptions are deliberate** | A check runs only when the score **succeeded and claimed at least one skill**. A score that failed or was refused dispatches no check (`skipped_no_score`); a score claiming zero skills dispatches no check (`skipped_no_skills`). **VERIFIED** in [score-listings.ts](../../src/features/scoring/score-listings.ts). So: every *claimed* skill on every *successfully scored* listing |
| "against the real listing text" | ✅ **VERIFIED**, with the honest limit | It is Adzuna's **500-character excerpt**, the same text the scorer saw — not the full posting. The check prompt is told what that means: "The posting text is an EXCERPT and may be cut off. A skill you cannot find is one you could not confirm, not one the posting rejected." ([check.ts](../../src/features/scoring/check.ts)) |
| "before it's shown" | ✅ **VERIFIED** | The check chains *after* the score and the page reorders once when every listing's score **and** check have both resolved |
| "catches an invented skill (claimed COBOL where none existed)" | ✅ **RECORDED**, against the real vendor | spec 0019 verify.md: `checkFitScore()` called with `["Go","PostgreSQL","COBOL"]` against a posting where COBOL appears nowhere, and "Google returned `ungroundedSkills: ["COBOL"]`" |
| "while leaving genuinely grounded skills untouched" | ✅ **RECORDED** | Same probe: the two genuinely grounded skills were left unflagged; separately the payments posting claiming Go, PostgreSQL and Kubernetes came back clean (`ungroundedSkills: []`) |
| "Closed the remaining anti-fabrication gap" | ⚠️ **Overstated as "closed"** | It closes the *skill-match* fabrication gap. The `reasoning` string the reader is shown is **not** grounded by anything — see below |

**Two design details that make this better than the bullet says** (both **VERIFIED** by reading `check.ts`):
- The schema asks for the skills that could **not** be grounded, not the ones that could. So a lazy or empty
  vendor answer produces the *clean* result — the same thing the reader saw before the feature existed —
  rather than stripping every chip off every card on a bad day.
- The vendor's answer is filtered back against the very list it was sent, reusing the scorer's own
  `keepOwnNames()`, so an invented name cannot *remove* a chip nobody disputed. The comment names why this
  matters more here than in the scorer: a removed chip leaves nothing behind to notice.

**And one thing the bullet should not claim**: the grounding rule is a **word-boundary** rule, not a
substring rule, and it got that wrong on first write. A Fable 5.1 review on 2026-09-09 caught the prompt
saying a skill "appearing as part of a longer phrase" counts as grounded — a substring rule that admits
"Java" grounded by "JavaScript", biasing the check *toward not flagging*. Fixed in `f0bbfb2`, and the prompt
now spells out both directions with examples. **VERIFIED** in the current prompt text and in the review file.

### Feature 17's verify.md checklist, shown rather than summarised

The prompt asked for the real checklist, not "verified". Here it is, from
[docs/specs/0019-cross-vendor-self-check/verify.md](../specs/0019-cross-vendor-self-check/verify.md).
**VERIFIED** by reading the file; the box states are quoted exactly.

**Headline the file gives itself:**

> **PASS, 2026-09-09.** Every acceptance criterion AC-1 through AC-13 is met; **23 steps ticked, 2 descoped
> by the engineer's decision (recorded as descoped, never as passed), 0 failing.**

**The 23 ticked `[x]` steps, by group:**

*Commands (9, all free)* — `pnpm test` green including `check.ts`'s units; `pnpm lint` + `format:check` +
`typecheck` clean; `rubric.ts`/`check.ts` read to confirm both prompts call the same exported
`buildListingBlock()`; `git grep SKILL_GROUNDING_CRITERION` showing one `export const` and both prompts
reading it; the post-parse filter confirmed to reuse `normalizeFitScore()`; `CHECK_SYSTEM_PROMPT` confirmed
to carry all three untrusted-input sentences; `tiers.ts` read for a distinct `ai_check.timeoutMs`;
`spans.md` read for all four new attributes and the partition identity; `git diff main` showing no new env
var and no new `DATA_RECIPIENTS` entry.

*Behavioural, free — constructed inputs, no vendor call (9)* — the invented-name filter; the **whole-render**
prompt comparison plus a leak list checking `191919` **and** `191,919`; the three untrusted-input sentences
broken on purpose; `matchedSkills: []` never dispatching a check and landing in `checkSkippedEmpty`; a
refused-or-failed score never dispatching a check; a vendor error **and** a real zeroed `ai_check` cap both
resolving to the unverifiable state; a flagged skill rendering `COPY-9`, dropping from the matched list, and
`COPY-11` above a byte-identical `reasoning`; every claimed skill flagged still showing the original band;
no-session returning `session_missing` before any vendor; and the `scored = checked + checkSkippedEmpty +
checkUnverifiable` identity broken on purpose and confirmed to fail by name.

*Behavioural, paid (4)* — the five-call latency measurement (928, 677, 684, 5905, 5272 ms); the AC-6
derivation confirming `timeoutMs: 20000`; the verify probe (2 `ai_scoring` + 2 `ai_check`); and the
dashboard reconciliation on both vendors.

**The 2 `[~]` DESCOPED steps, quoted in full:**

> - [~] **DESCOPED by the engineer on 2026-09-09, not blocked and not skipped by oversight.** Sign in with a
>   profile that has at least one skill → search `/search?q=engineer` → the result list appears in Adzuna's
>   original order with every card pending, then reorders exactly once when every listing's score and check
>   have both resolved, never card by card **[paid, up to 20 `ai_scoring` calls plus up to 20 `ai_check`
>   calls plus one Adzuna call]** → **AC-7**, **AC-12**. _The reason it was descoped: `/check verify` offered
>   a cheaper targeted probe against both real vendors instead, and the engineer chose it. The Adzuna weekly
>   cap is 25 and the one call this step spends buys the same wiring proof the probe already gives, since the
>   probe drives the real `scoreListings()` chain. **What this step alone would still add is the browser
>   half: the pending list, the single reorder, and the cards rendering in a real page.** That half currently
>   rests on 21 card tests and 63 page tests, each with its behaviour broken on purpose and observed to fail.
>   Run this step if that browser half is ever wanted; it was weighed and declined, not missed._
>
> - [~] **DESCOPED with the render step above, and its vendor half is separately proved.** On that same
>   render, find a card whose check flagged a skill → confirm the flagged skill is absent from the displayed
>   matched list, `COPY-9` names it, and `COPY-11` renders above the reasoning text **[paid, part of the same
>   render above]** → **AC-7**, **AC-13**. _Two reasons rather than one. First, it rides on the descoped
>   render. Second, and worth keeping even if that render is run later: **a flag is not guaranteed to occur
>   naturally**, since it needs the scorer to over claim AND the checker to disagree, so a full twenty card
>   render can legitimately produce zero flagged cards and leave this step unsatisfiable through no fault of
>   the code. The verify probe above forces the flag deliberately and observed Google return
>   `ungroundedSkills: ["COBOL"]`, so the vendor half of this step is proved; **what remains unobserved is
>   only `COPY-9` and `COPY-11` rendering on a real page**, which the card unit tests cover._

**What the descopes mean in one line**: the COBOL catch is proved against the real Google vendor, but
**nobody has ever seen a scored-and-checked `/search` page render in a browser** — not on production, not on
a local build. That half rests on 21 card tests and 63 page tests. The stated reasons are sound and the
descopes are recorded as descopes rather than passes, which is the right bookkeeping.

**Two further honest limits this file states about itself, both worth reading:**
- The `timeoutMs` sample is **five calls**, "which is a handful and not a distribution", with a spread from
  677 ms to 5,905 ms on identical input — so a slower tail than 5,905 ms "is entirely plausible".
- The dashboard reconciliation is **daily aggregates**, so it "corroborates the day and does **NOT** isolate
  the 23:10:25 to 23:10:38Z probe window. No claim of a windowed observation is made here." What carries the
  conclusion instead is that the arithmetic reconciles independently on both vendors *including* the two
  auth-failed calls. This is also, as the file says, **the only evidence in the checklist that comes from
  outside this repository** — every other cross-vendor signal is read from the project's own `tiers.ts` or
  its own database and "would look identical if the call had never left the machine."

---
## 9. What a skeptical senior engineer would criticise

Arguing the other side. "Nothing significant" would be the wrong answer; here are the things I would raise
in review, ordered by how much they would change my approval decision.

### Things I would not approve as written

**1. 🔴 The v1 claim skips two of its own slices, and the document structure says so.** Slice 3 and Slice 4
sit above the `## v1.5` heading and contain three unbuilt, *undesigned* features. Nobody has moved them. A
reviewer reading `scope.md` top to bottom sees a four-slice v1 with two slices empty. The line-502
completion test is framed as a bar to check additions *against* — a floor, not a definition of done. Calling
this "v1" publicly asks a reader to adopt the floor and ignore the structure. **The fix is trivial and takes
one commit**: either build 18-20, or move them into v1.5 with the reason on record. Doing neither and
relying on the floor is the part I would push back on.

**2. 🔴 The whole v1 loop has never run on the deployed site.** Section 4. Every browser verification of the
loop ran against `pnpm build && pnpm start` on localhost with `*.test` fixture identities. Production has
proved the OAuth *handshake* and the consent screen and nothing past them. In review I would call this the
single largest untested surface, and I would not accept "the local production build is the same code" —
because the things that differ are exactly the things that break: the production Supabase project, the
production redirect allowlists, `usage_cap` rows never consumed, `usage_gate_counter` never written, and
Sentry's `production` environment with zero spans ever. One sign-in and one search closes it for a few cents.

**3. 🟠 A monitor that cannot detect the thing it was created for, still in that state.** The second
UptimeRobot monitor exists to catch the `usejobhunt.vercel.app` → `usejobhunt.dev` 308 breaking, and as
configured reports Up whether that host redirects or serves the app. The fix is named in the README (invert
the expected status codes) and has not been applied. The project deserves credit for writing it down, but a
monitor that is documented as useless is still a monitor that is useless, and it is sitting in a directory
whose premise is that alerts are reviewable because they live in git.

**4. 🟠 The primary uptime monitor measures Vercel's CDN, not the application.** `/` is `x-nextjs-prerender: 1`
with `x-vercel-cache: HIT` and `age: 3236`. It will report Up through a paused database, both model vendors
down, Adzuna down, a misconfigured `usage_cap`, broken OAuth, or every authenticated route 500ing. The README
names the database half; it does not name that the page is a *cached static file*, which makes the project's
stated rationale ("a route that only reports on itself proves less than the page a visitor loads") backwards
here — this page proves strictly less than a status route that touched the database would. And no such route
exists, because `/health` is auth-gated and `src/app/api/` is forbidden from reading user data.

**5. 🟠 2 of 23 registered spans are alerted on, and the interesting 21 are the product.** `ai.call_tier`,
`scoring.score_listings`, `search.run`, `application.record` and all four `profile.save_*` writes have no
alert. `spans.md` records, for nearly every row, a variant of "Not yet. Worth an alert once the product has
real users." That is a defensible sequencing decision. It is not "a production safety net". And
`scoring.score_listings` carries a live trap: its own row says it has **no failures of its own**, so any
status-based alert built on it is guaranteed silent through a total scoring outage. The row says to alert on
its attributes instead. Nothing does.

### Over-engineered for a solo portfolio project

**6. The documentation-to-code ratio is extreme, and it has a cost.** Measured (`find … | xargs wc -l`,
**VERIFIED**): 18,902 lines of non-test TypeScript under `src/`, 17,205 lines of co-located tests, 11,686
lines under `test/`, 1,217 lines of SQL migrations — and **15,662 lines of Markdown under `docs/`**, of which
`docs/scope/scope.md` alone is 165 KB in 513 very long lines. Nineteen specs with `index.md` + `rationale.md` + `verify.md` each. Doc comments in
`tiers.ts` run to forty-line essays with `ALL CAPS` emphasis — the `ai_scoring` entry's comment is longer
than the entire `client.ts` function it configures. I think the *discipline* is genuinely unusual and worth
showing. But in review I would flag three real costs, and the repo itself already demonstrates all three:
- **Stale prose survives where stale code would not compile.** Section 11 lists three live examples, including
  the same wrong claim corrected in `spans.md` and left standing in `score-listings.ts`'s own comment.
- **The correction trail is now a load-bearing part of the reading.** Understanding why `ai_check`'s timeout
  is 20,000 requires reading a comment that cites five latencies, a derivation rule, an AC number, a spec
  follow-up and a gitignored artifact. That is excellent provenance and a real onboarding tax.
- **Claims are restated in many places and drift independently.** "Six tables" appears in spec 0003, spec
  0007 (twice), spec 0009 (twice), `docs/overview.md` and the resume. The schema is nine.

**7. Three `AGENTS.md` / reflex layers plus six context files.** `docs/reflexes.md`
is now 30+ standing rules, several of them about how to read a shell exit code. This is process for an
audience of one. **Counter-argument, and I think it wins**: the reflexes were each written after a real
escaped bug, and at least four of them caught real defects in later features. I would not cut it. I would
note that it reads as a lot for a reviewer arriving cold.

**8. A four-project Vitest workspace (`unit`, `integration`, `integration-serial`, `eval`) with a
`fileParallelism: false` project to serialise two cap-mutating files.** Correct, and earned — the serial
project exists because of a real race. Also: four test topologies for a project whose entire test suite runs
in 34 seconds.

### Thin

**9. "Application tracking" is one row and one list.** No status field, no response rate, no notes, no
discard. `application_answer` — four of the 23 RLS policies — is **referenced by nothing in the application**:
`grep -rn "application_answer" src/` returns hits only in `src/features/legal/stored-fields.ts`, the privacy
notice's field registry. **VERIFIED.** So 4 of the 23 policies guard a table the product never touches, and
`docs/overview.md` correctly calls it "the one table in the data model still unused". A reader hearing
"application tracking, backed by a six-table schema under 23 RLS policies" will picture more than exists.

**10. Search is title + location only.** No seniority, no remote, no salary, no job type, no recency — that
is all feature 18. And the known data-quality problems (the same job under different ids, a salary rendered
as a range from a number to itself, ungrounded outliers) are all feature 19, also unbuilt, and are all
*currently shipping to users*.

**11. The grounding check covers skill names and nothing else.** The `reasoning` string — the prose the reader
actually reads, addressed to them — is passed through **byte for byte** with no second-vendor check at all.
**VERIFIED**: `buildCheckPrompt(listing, claimedSkills)` receives only the skill names, and spec 0019 AC-13
requires the reasoning render byte-identical to the score's raw value. So "closed the remaining
anti-fabrication gap" closes the *skill-match* gap. The longest piece of model-generated text on the page is
ungrounded. That is a defensible scope choice; it is not a closed gap.

**12. The eval set is 16 pairs over 4 invented archetypes, and two of the 16 pass at 3-of-5.** Both
`control-one-gap` (after correction) and `weak-match-shallow-overlap` (07:35 run) sit at the minimum
majority. One rerun moving either way leaves no majority. The set also cannot be independent of the rubric by
construction, which the project states plainly — but the practical consequence is that "15 of 16 passed" is a
self-consistency measure on a 16-case authored set, not an accuracy number.

**13. There is no end-to-end test runner.** Playwright is the recorded choice and is not installed. Every
browser-level guarantee in this project — the single reorder, focus restoration across the reveal, the apply
flow not spending an Adzuna call — is proved by a person driving a browser once and writing down what they
saw. Those observations are unusually careful. They are also **not repeatable**, which is why the one known
flaky browser behaviour (below) has a 1-in-5 miss rate that nothing can regression-test.

### Claims that are weaker than they sound when stated plainly

| Stated | Weaker reading |
|---|---|
| "Built and deployed … end to end" | Deployed, yes. The end-to-end loop has been driven end to end **locally**, and on production only as far as the OAuth handshake. |
| "Proved the production safety net" | Proved the **development** Sentry environment's alert chain for **2 of 23** spans. The production monitors have never had a denominator. |
| "a rollback drill recovered a broken deploy in under a minute" | Recovered an unconditional throw on a static page by promoting the previous build, on the pre-domain-move hostname, timed by hand. Does not cover a bad migration, which the record says plainly promoting cannot undo. |
| "a usage-gating function held exactly at its limit under concurrent load" | True, on the local stack, against a **throwaway test call type with its cap lowered to 5**, in a test that was deleted. The committed standing test is the 30-way account-window burst. |
| "15 of 16 pairs landed in their expected band" | A real measured run — whose single failure is the pair whose expectation was then changed. No full-set run since. |
| "a second, independent vendor verifies every claimed skill" | Every claimed skill on every **successfully scored** listing, against a **500-character excerpt**, with skipped and unverifiable states that render identically to a reader. |
| "A forced test proved it catches an invented skill" | Proved against the real Google vendor from a **test process**. The rendering of that catch on a real page has never been observed; the render step was descoped. |
| "backed by a six-table Postgres schema" | Nine tables; six carry the policies; one of those six is unused by the application. |

### One thing I would defend against a skeptic

The project's habit of distrusting its own instruments is the most senior thing in it, and it has caught real
escaped bugs repeatedly: the `summary`-vs-`distribution` misread that produced a committed wrong claim; the
Prettier pass that silently invalidated a test's own proof *inside the commit that landed it*; the `|| echo`
pattern that reports a clean result for a mistyped path; the `191,919` comma that walked past a digit search
while all sixteen cases passed; the `.focus()` that updated `activeElement` without firing `focusin` and
produced four false failures. Those are all written down as standing rules with their evidence. A reviewer
should weight that heavily — it is rarer than any feature in the repo.

---
## 10. What this deliberately does not do, and why

These are the project's own stated, reasoned limitations, each with the actual recorded reason. A deliberate
limitation is a better answer than a gap — and these are genuinely named as limitations, with their reasoning,
not discovered by me. All **RECORDED**, with the source given.

### What the scoring sees, and what it therefore cannot say

**Scoring reads Adzuna's 500-character description excerpt, never the full posting.** Verified directly
against a recorded fixture. Spec 0015 decided to score the snippet **honestly** rather than fetch the full
posting, and the consequence is visible in the product's own vocabulary: `notMentionedSkills` replaces
"missing skills" and is labelled as *unconfirmed*, not as absent. The check vendor is told the same thing in
its prompt: "A skill you cannot find is one you could not confirm, not one the posting rejected."
[scope.md:282](../scope/scope.md), [spec 0015 rationale](../specs/0015-fit-scoring-with-shown-reasoning/rationale.md).

**Fetching the full posting is deferred, not closed.** Reason on record: it needs a headless browser this
project does not have, and a compliance judgment Adzuna's own terms do not resolve either way.
[scope.md Deferred](../scope/scope.md). A v2 alternative (JobsPipe, full posting text in the search response)
is verified in detail against their OpenAPI spec and terms and recorded — including the gap that their terms
do **not** address caching or storage, "a gap rather than a permission", which matters because this app stores
listing fields on `application` rows.

**The `reasoning` prose is not cross-checked.** The second vendor receives skill names only. Spec 0019 AC-13
requires the reasoning to render byte-for-byte identical to the score's raw value. So the grounding check
covers the chips, not the paragraph. **VERIFIED** by reading `check.ts` and the AC.

### What the eval set does and does not cover

**It measures rubric self-consistency, not accuracy.** Quoted in section 8. The set was authored by reading
`BAND_ANCHORS` directly and can never be independent of it; the influence runs one way (the anchors' text has
never changed) but the pairs came from the anchors. What would close it, on record: "a genuinely blind second
opinion, a person or a model scoring the same raw postings and profiles with `BAND_ANCHORS` withheld
entirely". Rewriting the existing set would not close it, since any rewrite inherits the same anchors. And
the reason nothing needs fixing now is stated: "the project holds no independent source of fit judgment to
check against, no real hiring outcomes and no outside recruiter panel".
[spec 0016 index:182](../specs/0016-eval-ground-truth-set/index.md).

**16 pairs, 4 fully fictional archetypes, no real person and no real employer.** Spec 0016 AC-1. Fixtures
carry no real personal data anywhere in this project, by standing rule, "even for convenience" — a rule
written because the reference project had a real personal email committed in tracked source.

**The `weak_match` / `not_a_match` boundary is undefined in `BAND_ANCHORS`, and is deliberately left
undefined.** Spec 0018's Finding 2: `key-domain-mismatch` split 3-2 then landed 5-0, which "is ordinary
variation on a boundary, not the signature of a rule the model cannot apply", and "a rule written now would
be written from one noisy pair, and a rule that lowers real users' bands deserves better evidence than that".
Recorded as an open gap in spec 0016 rather than closed. **This is the clearest example in the repo of
declining to fix something for a stated reason.**

**Per-pair variance is the honest measure for one pair, not a pass/fail.** `stability-probe-generic` is
generic boilerplate truncated at U+2026, and spec 0016 deliberately left what to do with it to feature 16
rather than treating it as an ordinary accuracy check.

### What has no production telemetry

**No product analytics at all.** Feature 29, `planned`, v1.5, `needs a decision`. Kept explicitly separate
from the applications dashboard because "the page never presents product analytics numbers as application
numbers". [scope.md:418](../scope/scope.md).

**No spend or token telemetry.** Feature 28, `planned`, v1.5. The app records no tokens and no dollars;
`usage_cap` counts calls. **VERIFIED** in section 6.

**21 of 23 spans have no alert**, each row carrying its own reason for why not yet. **VERIFIED** in section 5.7.

**Alert rule drift detection is a v1.5 item, explicitly.** Reason on record: "A scheduled diff proves the rule
exists, not that it fires, and costs a scheduler plus API credentials. Add it once the forced failure smoke
test has shown the alert works." [spec 0001 index:193](../specs/0001-stack-and-architecture/index.md) and
[scope.md Deferred](../scope/scope.md).

**`ai_check`'s own retention question has not been asked of Google.** Stated as a real open item in
`tiers.test.ts` rather than papered over with symmetry: `store` is an OpenAI Responses API option, Google's
provider does not accept it, and "copying it onto `ai_check` would send an unrecognised key to a different
vendor. `ai_check`'s own retention question is Google's to answer and has not been asked, which is a real open
item rather than something this test settles." **VERIFIED** quote from
[tiers.test.ts:85-90](../../src/lib/ai/tiers.test.ts#L85-L90).

### What was decided against building

| Not built | Reason on record |
|---|---|
| **Any billing** | Cost exposure handled by usage gating, not monetisation. Standing rule, [scope.md:511](../scope/scope.md) |
| **Email/password auth, password reset, account settings** | Pulls in a transactional email service and a verification flow OAuth alone does not need. Feature 27, v1.5 |
| **Persisting search results** | Avoids a staleness state machine. Accepted trade-off, named: jobs merely seen are not deduplicated against, to avoid a growing seen-jobs ledger. Standing rule |
| **An end-to-end browser runner** | Playwright is the recorded choice; it "arrives with the first feature that needs a browser, not as an empty config". `docs/overview.md` |
| **A lawyer's review of the terms and privacy notices** | "the only thing that manages legal risk rather than reducing factual error. Deferred as a reasonable call for a free portfolio project, **recorded so the deferral is a decision rather than an oversight**" |
| **Recording which terms version a person accepted** | Blocked by the marketing tree's no-client-JavaScript rule and by a `profile` row feature 9 creates |
| **Supabase Branching (a database per PR)** | "the best isolation answer available, rejected in spec 0002 **on cost alone** since it needs a paid plan" |
| **A Supabase keep-awake job** | Considered and declined; detection is Supabase's pause email |
| **An aggregate scoring deadline** | "trades completeness for responsiveness with no acceptance criterion requiring it, and an abandoned call still spends its `usage_cap` unit either way" |
| **A batched scoring call for all 20 listings** | Rejected with three traceable reasons: per-listing reasoning is what the `Done when` asks for; `generateObject`'s validation is all-or-nothing so one malformed field would fail all twenty; and the eval harness is inherently per-pair |
| **Retries on model calls** | `maxRetries: 0`, because the AI SDK's default of 2 would let one gated call spend three vendor calls while `usage_cap` read the same budget |
| **An in-app admin role** | The v1 actor model is "authenticated user" and "demo account" only; no role-permission matrix to test |
| **Route handlers reading user data** | Binding rule: `src/app/api/` exists for callers with no session cookie, and spec 0001 defines no authorisation rule for that case |
| **The Supabase MCP server** | Permitted only under all five conditions of spec 0001 binding rule 7; not connected |

**One honest self-assessment I would quote back to anyone**: when spec 0009 shipped the privacy notice before
features 11, 13 and 14 existed, it recorded that the third-party list would therefore be incomplete on the day
it shipped, named the reason ("a privacy notice that silently stops matching where data actually goes is worse
than one written later"), and made each later feature responsible for adding itself. That is a limitation
named in advance with a mechanism attached, which is the difference between a deliberate limitation and a gap.

---
## 11. Anything new, unresolved, or quietly broken

There is no prior full-project audit in `docs/reviews/` — the twenty files there are `/check review` and
`/check verify` outputs for individual features. The most recent is
[2026-09-09-feat-cross-vendor-self-check.md](2026-09-09-feat-cross-vendor-self-check.md). So "since the last
audit" is read here as: since that review, plus anything in `scope.md` and the commit log not yet surfaced.

Seventeen commits landed from 2026-09-09 16:53 to 2026-09-10 15:57. **VERIFIED** by `git log`.

### Open items, every one I found

**1. 🔴 A stale claim survives in code that was corrected in the docs.**
[src/features/scoring/score-listings.ts:106-109](../../src/features/scoring/score-listings.ts#L106-L109) says:

> The identity is also what would catch a fifth outcome being added here later and not being tallied, which is
> the way a partition silently stops partitioning.

[docs/observability/spans.md](../observability/spans.md)'s `scoring.score_listings` row corrects exactly that
claim, dated 2026-09-10: "this row used to add that the identity would also catch a fifth per listing outcome
being added later and tallied nowhere. **It would not, and could not**, because a test can only construct
variants that already exist." The correction landed in `spans.md` and the same wrong sentence is still in the
source file's own doc comment, four lines above the `const exhaustive: never` that actually does the job.
**VERIFIED** both sides. Harmless to runtime; exactly the "a comment claiming a proof it cannot make" shape
`docs/reflexes.md` exists to stop.

**2. 🔴 `scope.md` records the Gemini tier as Free, and it is Tier 1.** [scope.md:342](../scope/scope.md)
(feature 17's `Document it` box) states the concurrency question "stated as confirmed rather than inferred now
the AI Studio dashboard shows this project on **Free**". [docs/session-notes.md](../session-notes.md)
(2026-09-10) closes that question as dead: "The AI Studio Rate Limit page reads **Tier 1**, not Free, and
`gemini-3.5-flash-lite` is rated **4,000 requests per minute** (peak usage so far: 5)". **VERIFIED** that the
two files contradict each other. The session note names two places carrying the stale framing — the review file
and PR #121's body — and **misses the third, `scope.md:342`**, which is the one a later session is most likely
to read as current.

**3. 🔴 `ai_check` now costs money and nothing records it.** Same session note: "the tier move has a cost side
effect nothing else records: `ai_check` calls now cost money, where the Free tier was $0". No spec, no scope
row, and no comment in `tiers.ts` mentions it. This changes the arithmetic behind spec 0019's per-listing
chaining and behind any future feature reusing the tier. **VERIFIED** that `tiers.ts` is silent on it.

**4. 🟠 The reviewer's suggested fix for that finding is half-applied.** The review asked to "Confirm the AI
Studio project's tier and its RPM limit for this model, **and record the figure beside `ai_check` in
`tiers.ts`** the way `timeoutMs` is now recorded." The tier was confirmed (Tier 1, 4,000 rpm, peak 5). It is
recorded in a session-notes file that `/checkpoint` ages out, not in `tiers.ts`. **VERIFIED** — the 4,000 rpm
figure appears nowhere in `src/`.

**5. 🟠 `landing-rule.test.ts` flakes at ~13%, with its own investigation logs lost.** Section 7. Six green
runs in this session prove nothing (43% likely at that rate). The recorded cheap fix — assert
`capturedEvents()` alongside the path so the next occurrence names its own cause — is not applied, so every
occurrence still discards its own explanation. Belongs to spec 0008.

**6. 🟠 A browser behaviour with an unexplained 1-in-5 miss rate, under a ticked box.** Spec 0015 AC-17's
"brought into view" clause (WCAG 2.2, Focus Not Obscured): four passes in five observed runs; the single miss
left the restored control at `top: 1359` in a 953 px viewport with `scrollY` unmoved, and **has never been
reproduced**, including by immediately re-running its own script. `verify.md`'s step is ticked on the four
passes. **RECORDED**, [docs/session-notes.md](../session-notes.md). The note's own judgment is the right one:
"the criterion it serves … does not tolerate a one in five miss either." Nothing can regression-test it,
because no browser runner is installed.

**7. 🟠 Feature 14's `Verify it` box is deliberately unticked under a `done` row**, with 4 of 43 steps open:
two need a real screen reader (AC-16's busy and re-rank announcements), one needs a listing whose excerpt
states a visa sponsorship stance (structurally rare given a 500-character excerpt), and one is "unrunnable as
written, because AC-17 rule 3's stated rationale names a mechanism the app does not use". **VERIFIED** at
[scope.md](../scope/scope.md). The bookkeeping is honest; the items are open.

**8. 🟠 Three reflex candidates recorded but not written into `docs/reflexes.md`**, all from 2026-09-09-10.
**VERIFIED** in [docs/session-notes.md](../session-notes.md):
- the **UTC day roll** — a date-keyed counter returns zero rows when the UTC day has rolled (20:00 local) and
  zero rows reads exactly like zero calls; **three instances**, two on one day;
- **`console.log` swallowed by the Vitest reporter**, which lost a five-call paid measurement run whole and
  made the money be spent twice;
- **`git checkout --` on an untracked file** silently does nothing and exits clean, so a deliberate test break
  was "reverted", reported success, and stayed in the file.

These are exactly the class of rule this project's reflexes exist for, and each already cost something real.

**9. 🟡 Spec 0002's own AC-15 confirmation box is still unticked** while `verify.md` lists AC-15 as met — the
Sentry spend-notification setting "stays open until the setting is actually confirmed on in the Sentry
organisation". **VERIFIED** that the two disagree. Section 5.6.

**10. 🟡 No forced-failure record for `kill_switch.read`.** Section 5.2. Its alert rule exists and is
connected; the forced-failure proof is the gate's, and the two were deliberately separated because they are
different failures.

**11. 🟡 The production Sentry monitors have never had a denominator.** Section 5.7. Not a misconfiguration;
an unexercised instrument. Closed by the same one sign-in that closes item 13.

**12. 🟡 GitGuardian reports `skipping` intermittently with no configuration change** — skipped on PRs 18 and
92, passed on 19, 20, 40, 41, 94. PR 18 is the branch whose history was rewritten to remove a Supabase secret
key. Still unexplained. **RECORDED**.

**13. 🟡 Two unpushed docs commits**, including the `docs/overview.md` rewrite that is the project's own
"this is a complete v1" statement. Section 7. It exists on one machine.

**14. 🟡 `docs/overview.md:138` says "six tables in Postgres"; there are nine.** Section 8. The same undercount
appears across specs 0003, 0007 and 0009 and in two `.sql` verification scripts — `grep -rln "six tables" docs/`
returns nine files besides this audit. **VERIFIED.** Internally consistent (it is the count of policy-carrying
user-data tables) and wrong as a statement about the schema.

**15. 🟡 Auto-merge is disabled on this repository** (`gh pr merge --auto` fails with
`enablePullRequestAutoMerge`), confirmed on PRs 119 and 121, and the session note says this durable fact "still
has found no home in scope, a spec or `docs/reflexes.md`" — `AGENTS.md`'s Git block says nothing about it.
**RECORDED**.

### Things that LOOK open and are actually closed — worth not re-investigating

**VERIFIED** from [docs/session-notes.md](../session-notes.md)'s `## Ruled out` section:

- **Twenty concurrent Gemini calls exhausting a rate limit** — closed as dead 2026-09-10, not deferred: Tier 1
  at 4,000 rpm against a worst case of 20, half a percent of the limit. "Do not reopen." But the review file
  and PR #121 still carry it as the one open finding, **and so does `scope.md:342`** (item 2).
- **"Per-account usage counters are never written"** — raised 2026-09-07, disproven the same session. Account-
  scoped rows are created on the first account-scoped call of the period; once enough calls landed they read
  `job_search account week` 26 against a cap of 25 and the gate correctly refused. "The gate works; do not
  re-investigate."
- **The production `database_unavailable` escalation** — the "Supabase Data API switched off for a minute"
  hypothesis was rejected (the error was a Postgres grant hint naming `anon` on one table, and the timing did
  not line up). ⚠️ **The underlying issue is not recorded as resolved anywhere** — only this one hypothesis is
  ruled out. It is the only production-side error this audit found any trace of, and it has no open item
  tracking it. Worth a look in Sentry.

### Local state worth knowing before any further verification

**RECORDED** in [docs/session-notes.md](../session-notes.md), counters read through `pg` directly: the seeded
local development account is **over both of its account-week caps** — `job_search account week` **58 of 25**
and `ai_scoring account week` **815 of 500**, both at their committed cap values, so the overage is spent
attempts, not a raised cap left behind. Any further local `/search` verification will be refused with the
allowance sentence rather than returning results until the week rolls, unless a cap is raised and restored. A
probe reusing that identity would be refused before reaching a vendor, and **that refusal renders identically
to feature 17's unverifiable state** — which is precisely why spec 0019's probe minted a fresh fixture user per
test and asserted it was not the seeded id.

---
## Verdict

### Is this honestly ready to be called v1?

**Yes — as "the v1 core loop, shipped and live" — and not yet as "v1 complete," for one structural reason and
one evidential one.**

**What is unambiguously true, all verified in this session:** 20 of 33 features done, 19 of 19 specs Accepted,
635 commits, a clean tree, 1,221 unit tests and 132 integration tests green with zero failures and zero skips
that are not the deliberate paid-call gate, lint + typecheck + format all exit 0, and a real production
deployment at `https://usejobhunt.dev` serving exactly `origin/main` (`7a2c83c`), answering 200 in 279 ms,
with its protected routes redirecting correctly, its old host still 308ing, its production Postgres awake and
refusing anonymous callers on all nine tables, and its production Sentry sampling at 1.0. The project's own v1
completion test — profile, search, ranked results with reasoning, click through, record — is met in code and
has been driven end to end in a browser.

**The two things that stop "v1 complete" being the honest phrase:**

1. **Two of v1's own four slices are empty.** Features 18, 19 and 20 are `planned`, `needs a decision`, and sit
   above the `## v1.5` heading in the project's own scope document. Nobody has reclassified them. Until someone
   does, a reader of `scope.md` sees v1 at 20 of 23 features.
2. **The loop has never run on the deployed site.** Every browser verification ran against a local production
   build with `*.test` fixture identities. Production has proved the OAuth handshake and nothing past it. That
   leaves the production database's gate path, the production `usage_cap` rows, and the production Sentry
   monitors all unexercised.

Both are cheap to close. (1) is one commit. (2) is one sign-in, one profile, one search, one apply — a few
cents and fifteen minutes — and it would simultaneously give the production monitors their first denominator,
turn the largest caveat in this audit into a verified claim, and let the resume say "end to end" without an
asterisk. **I would do (2) before saying "v1" out loud in an interview**, not because the code is suspect but
because it is the one sentence a skeptical interviewer can test with a browser while you are talking.

### Does anything on the current resume need to change?

**Three of the four bullets are accurate as written.** One word in bullet 1 is wrong, one word in bullet 2 is
overstated, and one word in bullet 4 is overstated. Everything else checks out, including every specific number
— 23 policies, 15 of 16 pairs, 15 accounts / cap of 5 / exactly 5 allowed, under a minute, COBOL. I went
looking for a wrong number and did not find one.

**Must change — one claim is factually wrong:**

> "backed by a six-table Postgres schema under 23 row-level-security policies"

There are **nine** tables. Six carry the 23 policies; three (`app_settings`, `usage_cap`,
`usage_gate_counter`) carry zero by design. The pairing is internally consistent with every spec in the repo,
but "six-table Postgres schema" is a false statement about the schema, and it is the kind of thing an
interviewer can check by asking "what are the tables?" Suggested rewrite, which is also a stronger claim:

> "…backed by a nine-table Postgres schema with row-level security forced on every table and 23 per-row
> policies over the six holding user data."

That is verified exactly: nine tables, `relrowsecurity` and `relforcerowsecurity` true on all nine, 23
policies, all `to authenticated`.

**Should soften — two words that an interviewer will press on:**

1. **"Proved the production safety net"** → the chain was proved in the **development** environment, which is
   what the scope row specified ("in a non production project"), and it covers 2 of 23 registered spans. Either
   say "proved the alerting chain end to end in a non-production environment" (accurate, and the deliberate
   choice is a point in your favour), or close the gap first with one production sign-in and then keep the word.
2. **"Closed the remaining anti-fabrication gap"** → it closes the *skill-match* gap. The `reasoning` prose the
   reader actually reads passes through byte-for-byte with no second-vendor check. Suggested: "Closed the
   skill-match fabrication gap with a cross-vendor grounding check…". Smaller claim, and it survives the
   follow-up question "what about the explanation text?", which the current wording does not.

**Worth adding a hedge to, or being ready to say unprompted:**

- **"end to end"** in bullet 1 is true of the code and of a local browser run, not of the deployed site.
  Either close it (recommended) or be ready to say so first — "the loop is driven end to end in a browser
  against a local production build; the deployed site has the OAuth leg proved and I haven't run the full loop
  on it yet" is a fine answer and a bad thing to be caught not knowing.
- **"15 of 16 pairs"** is a real measured run, and the pair that failed is the one whose expectation was then
  corrected. If asked, the strong version is: "15 of 16 on the second of two full runs; the one failure was a
  ground-truth entry I'd got wrong, which a separate review corrected by arguing from the rubric text that
  already existed — the model was right and I wasn't. No full-set run since that correction." That answer is
  better than the bullet.
- **`control-one-gap` passes 3-2**, the minimum the harness accepts, and one rerun either way would leave no
  majority. Know that number before anyone asks it.
- **"application tracking"** is one row and one list today. `application_answer`, which four of the 23 policies
  guard, is read and written by nothing.

**Nothing needs removing.** No bullet claims something that did not happen, no number is inflated, and the two
softenings above are about scope words, not about evidence. The bullets are unusually well supported for
resume prose — the recorded evidence behind each one is more specific than what the bullet asserts, which is
the right direction for that to run.

---

_Audit performed 2026-09-10 against local `HEAD` `2cb6bd1` and production deployment
`dpl_x3zFxHyFRbg7o76XofaCBoQCYMe9` (`7a2c83c`). No vendor money spent: `pnpm eval` was not run and
`TEST_LIVE_MODEL_CALLS_ENABLED` was never set. Commands run: `pnpm test` ×1, `pnpm test:integration` ×6,
`pnpm lint`, `pnpm typecheck`, `pnpm format:check`, direct `psql` against the local stack, authenticated
`curl` against the production Postgres as `anon`, unauthenticated `curl` against six production URLs,
`vercel ls` / `inspect` / `env ls` / `env pull`, the Vercel deployments API, `gh api` for branch protection,
and direct parsing of the three recorded eval report files in the gitignored `test/eval/.output/`._

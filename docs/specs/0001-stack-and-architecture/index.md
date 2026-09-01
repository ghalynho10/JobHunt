# 0001. Stack and architecture for JobHunt

**Date**: 2026-08-19
**Status**: Accepted

## Summary

JobHunt is built as one Next.js application on Supabase, deployed to Vercel, with all data reads and writes happening on the server. Postgres row level security (a rule in the database itself that decides which rows a request may see) is the real guarantee that one user never reads another user's data, rather than a check in application code that could be forgotten. Failures are returned as values that the type system forces you to handle, not thrown and possibly swallowed, and every failure reports itself to Sentry at the moment it is created. Three tooling choices (the component source, the test runners, the linter) are deliberately left open and belong to features 5, 8 and 2.

## Decision

**Chosen option**: Option 1: One Next.js application on Supabase and Vercel, server first.

Build JobHunt as a single Next.js 16 application whose data path runs entirely on the server through `@supabase/ssr`, with authorisation enforced by Postgres row level security and no object relational mapper in between.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-sdk-setup` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-sdk-setup/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning, the options weighed, the landscape check behind the version numbers, and references: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | Single application, no services | One developer, expected users in the tens. A monolith is the only pattern that is cheap to build, debug and operate at this size. |
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax` | `noUncheckedIndexedAccess` catches unchecked array and record access. Note: it does **not** answer the reference project's anchor bug. That shape (a value read as an object when it was an array) came from a wrong declared type, which no strictness flag disagrees with; it is answered by generated types plus Zod parsing at the boundary. |
| Runtime | Node, current Active LTS line, pinned in `.nvmrc` and `engines` | One version across local, CI and Vercel, so a version difference is never a suspect during debugging. Confirm the exact LTS line at scaffold time. |
| Package manager | pnpm, enabled through corepack | Refuses to resolve a package that was never declared, so the dependency list stays honest. |
| Framework | Next.js 16.3, App Router | Current stable and LTS as of 3 August 2026. Turbopack is the default builder in 16. |
| Data path | Server Components for reads, Server Actions for writes | Every Supabase call and every session check runs on the server. No database credential and no query shape reaches the browser. |
| Primary database | Postgres, hosted by Supabase | Relational data with real relationships, and `pgvector` available if the deferred retrieval tool ever arrives. |
| Database access | `@supabase/supabase-js` with `@supabase/ssr`, no object relational mapper | Every query carries the caller's token, so row level security applies by construction. There is no code path that can quietly bypass it. |
| Complex operations | Postgres functions, hand written SQL | Anything that must be atomic (the feature 10 usage gate above all) is one statement in the database, not a read then write in application code. |
| Schema and migrations | Supabase CLI, hand written SQL files in git, local stack in Docker | The repository is the source of truth for schema and policy. Tests run against a real Postgres with the real policies applied. |
| Authentication | Supabase Auth, OAuth only, Google and GitHub | Two providers cover the named audience. No transactional email service and no verification flow needed in v1. |
| Authorisation | Row level security in Postgres, plus a session check in the protected layout and again in every Server Action | The database is the guarantee. The layout check makes the denial visible. The per action check exists because a Server Action is a callable endpoint whatever page renders it. |
| API keys | Publishable key (`sb_publishable_…`) in the browser. Secret key (`sb_secret_…`) only inside `src/lib/supabase/secret.ts`, see binding rule 1 | The current Supabase key format. The legacy `anon` and `service_role` JWT keys are deprecated by the end of 2026 and are not used at all. |
| Validation | Zod 4 at every boundary | Nothing untrusted enters the application unparsed: the Adzuna response, every model output, every form input, every environment variable. |
| Forms | react-hook-form with the Zod resolver | The profile form is long, and per field errors without a server round trip matter there. |
| Client state | None. URL search params plus `useTransition` | Filter state in the URL is what feature 18 needs anyway, and `useTransition` keeps previous results on screen during a refetch, which is the direct fix for the repeat search wipes results bug. |
| Error model | A `Result` discriminated union at every boundary | Under `strict`, the data cannot be read without first narrowing the union, so ignoring a failure is a compile error rather than a habit. |
| AI access | AI SDK 7 with direct provider packages, one key per vendor | Keeps personal data flowing only to the vendors the privacy notice names, and keeps the AI layer independent of the hosting choice. |
| Model tier configuration | A checked in module, keys in environment variables | A model change is a reviewable commit that can trigger the eval harness. What is deployed always matches what is in git. |
| Jobs data | Adzuna REST API | Already decided, terms already checked, and it supports the structured filters feature 18 needs. |
| Styling | Tailwind CSS v4 | Theming moved into CSS through the `@theme` directive, and colours to OKLCH. |
| Hosting | Vercel, Node runtime rather than Edge | First party Next.js support with no adapter to keep working, preview deployment per push, free tier for a non commercial project. |
| Observability | Sentry | Errors and the expected failure rate signal both land somewhere a person actually sees. |
| Environment config | `@t3-oss/env-nextjs` with Zod, validated at build and at boot | A missing variable fails the build. Importing a server only secret into client code becomes a build error. |
| Repository | Single package, single application | The eval harness is a script importing the real scoring code, not a copy of it. |
| Version control | git, initialised before the scaffold | The brief and the scope are real work that deserves history before generated code lands on top of them. |

**Deliberately left open**, owned by other features and not decided here:

| Layer | Owner | Leading candidate carried forward | Must satisfy |
|---|---|---|---|
| UI component source | Feature 5, design system and UI foundation | shadcn/ui, components copied into the repository. Decide it together with the `@theme` port of the seven token palette, because Tailwind v4 made those one decision rather than two. | WCAG 2.2 AA on the v1 loop: every primitive keyboard reachable, with a visible focus state and a real label. Themed from the seven token palette through `@theme`, not from a library's own design language. |
| Test runners | Feature 8, test foundation | Vitest for unit and integration, Playwright for end to end. | Must drive a Server Action without a browser. Must run against the local Supabase stack with the real policies applied, not a mock. Must authenticate through the development only session mint from binding rule 1. |
| Linter and formatter | Feature 2, coding standards and tooling | ESLint with Prettier. | Must enforce accessibility rules at `jsx-a11y` level, and must enforce the `src/lib/supabase/secret.ts` import restriction from binding rule 1. A tool that cannot do both is not a candidate. |

## Directory layout

```
src/
  app/
    (marketing)/        public routes, no session required
    (app)/              protected routes; its layout verifies the session
    api/                route handlers, only where an external caller needs HTTP
  features/
    <feature>/          that feature's actions, queries, components, types, schemas
  components/ui/        shared design system primitives (feature 5)
  lib/
    supabase/
      server.ts         request scoped server client, carries the user token
      secret.ts         the ONLY place a secret key client may be constructed
    ai/
      tiers.ts          tier to vendor and model map, checked in
      client.ts         the feature 13 router
    adzuna/
    result.ts           the Result union and the failure() constructor
  env.ts                validated environment variables
supabase/
  migrations/           hand written SQL, source of truth for schema and policy
docs/
  observability/        alert rule definitions, kept in git for review
```

Routes live only in `src/app`. A feature's own code lives in `src/features/<feature>/`. Anything shared by two features moves to `src/lib` or `src/components/ui`.

**Amended 2026-08-29 by spec [0007](../0007-auth-and-per-user-isolation/index.md).** This tree listed a fourth file, `lib/supabase/browser.ts`, "publishable key client", reserved for the OAuth handshake in feature 7. Feature 7 does that handshake entirely on the server, so the browser client never gained a caller and is deleted rather than left as a module whose doc comment claims a purpose it no longer has. The trail is kept here rather than the line silently vanishing: this project's data path is server only, and the one exception this file was held open for turned out not to be one.

## Binding rules

These are load bearing and not open to per feature reinterpretation.

**1. The secret key is constructible in exactly one file.** `src/lib/supabase/secret.ts` is the only module that may build a client with the secret key (`sb_secret_…`), which carries `BYPASSRLS` and skips every policy. Importing it from anywhere under `src/app` is forbidden and must be enforced by a lint rule. Every legitimate caller is listed here and this list is the allow list:

- the development only test session mint (feature 8), hard blocked outside development
- the kill switch read, `src/lib/kill-switch.ts`. Built in feature 3, not feature 10 as first written: spec 0002 needs the switch to exist before the first external call, so feature 10 inherits this read rather than writing it. Corrected 2026-08-21 by spec 0002's build task 19, which this rule's own closing sentence requires.
- the seeded demo account (feature 31)

Adding a fourth caller means editing this spec.

**2. Every failure is constructed through `failure()`, which reports.** `src/lib/result.ts` exports the only constructor for a failure variant, and reporting to Sentry happens inside it. There is no way to create a failure without it being reported. Call sites may attach extra context; they cannot opt out. This is structural rather than a convention, because the reference project's own spec specified the right behaviour and it was skipped.

**3. Every failure carries a severity and a kind, both required by the type.** `failure()` does not compile without them:

- `unexpected` (an Adzuna timeout, a malformed model response, a database error) reports to Sentry as an error.
- `expected` (a validation error, a usage cap reached, an empty search) reports at info level.

The **kind** is a value from a `FailureKind` union exported from `src/lib/result.ts`, never a free text string. The Sentry fingerprint is derived from it mechanically. This matters because rule 4 depends on all instances of one kind grouping into a single issue with a live event count, and free text across thirty features would either fragment one kind into many issues or collide two unrelated kinds into one. Adding a kind means adding a member to the union.

**4. Expected failures are alerted on by rate, not only by volume.** A correct per instance classification is not enough. In the reference project every denial was genuinely "expected", and the outage existed only in the aggregate: one hundred percent of metered actions denied, for every user, for two weeks. With a handful of users the absolute event count stayed tiny throughout, so any volume threshold would have stayed silent for the full two weeks.

The alert combines two conditions:

- a **ratio**: the share of attempts for a given operation that end in failure, which catches total failure regardless of how few users there are
- an **absolute floor**: a minimum number of attempts before the ratio can fire, so one failure out of two attempts does not page anyone

The ratio needs a denominator, so attempts must be counted, not just failures. Two mechanisms, deliberately not one:

- **For every operation**: `failure()` marks the active Sentry span as failed, so attempts are counted as spans. **The named span must open as the first statement of the operation, before any early return, denial, or guard clause.** Otherwise a total denial outage produces no spans at all, the ratio has no denominator, and the alert stays silent through exactly the failure it exists to catch. The span name is declared in `docs/observability/` beside the alert it feeds, so grouping is defined rather than incidental.
- **For gated operations**, which are the ones carrying the named financial risk: the attempt counter is incremented inside feature 10's atomic gate function itself, at the moment the gate decision is made. Built with that function, not deferred. The span rule above is a convention someone has to follow, and nothing fails to compile when a later feature adds an early return above the span. A counter inside the atomic gate has no placement to get wrong. Feature 28's spend visibility inherits these counters rather than originating them.

**Trace sampling must be 1.0 on any operation whose failure rate is alerted on.** A sampled ratio at this traffic volume is noise, not a signal.

Alert rule definitions live in `docs/observability/` in git, so they are reviewable even though Sentry is what enforces them.

**5. An exception escaping an external boundary call is converted, not left to escape.** Any call to something outside this application (`fetch`, a provider SDK, the database driver) may throw rather than return, and such a throw never passes through `failure()`, so it carries no severity and no kind. Those calls are wrapped and their exceptions converted into a failure variant with severity `unexpected` and a real kind.

This applies to external boundary calls only. A programmer bug still throws and still reaches an error boundary with its stack trace intact. Funnelling every escaping exception into a return value would swallow real bugs into data, which is the opposite of what this error model is for.

**6. Authorisation is never decided in the proxy.** The proxy (`src/proxy.ts`, the file Next.js called `middleware.ts` before 16) refreshes the Supabase session cookie and does nothing else. The protected layout verifies the session, and every Server Action verifies its own caller independently, because a Server Action is a callable endpoint whatever page renders it. Row level security in Postgres is the guarantee behind both.

**Route handlers under `src/app/api/` may not read or write user data.** They exist for callers with no session cookie, and this spec defines no authorisation rule for that case. The feature 16 eval harness runs in process as a script and imports the scoring code directly, so v1 is not expected to need one. A route handler that must touch user data means writing its authorisation rule into this spec first.

> **AMENDED, 2026-08-31, by spec [0008](../0008-app-shell-and-navigation/index.md), which is Accepted and shipped.** Two changes were owed to this rule when feature 32 shipped, and both have now landed: the proxy echoes the requested path as a request header, and two route handlers read a user data table. The note is kept in full rather than deleted, because a rule that quietly changed shape would be worse than one whose amendment a reader can see.
>
> **One, "and does nothing else" widened by one job.** The proxy also echoes the requested path as a request header, on every request, unconditionally, using the `{ request: { headers } }` form so the value travels upstream only. This is wording, not substance, and the distinction is load bearing: the proxy still reads no session, still holds no list of routes, and still cannot tell a protected path from a public one. The guard is mechanical rather than a promise. `src/proxy.test.ts` lines 49 to 62 assert the proxy treats a protected route exactly as it treats a public one, and lines 64 to 70 assert it sets no cookies. **Both must keep passing unmodified**, and spec 0008 AC-9 exists to hold them. An earlier draft of that spec had the proxy write a cookie for protected paths only, which would have broken both, and it was rejected for that reason.
>
> **Two, the authorisation rule this spec asks for is hereby written.** `/go` and `/auth/callback` are the first route handlers here to read a user data table (`public.profile`, for row existence only). Both sit outside `src/app/api/`, so the paragraph above does not forbid them, but its closing sentence asks for the rule and this is it: each verifies its own caller through the session before the read, neither writes user data, neither accepts a user supplied identifier for the row it reads, and row level security remains the guarantee behind the read rather than the handler's own check.

**7. The Supabase MCP server, if connected, is connected under all five of these conditions.** An agent holding elevated database credentials, reading content that users typed, with a path to send data outward, is the documented prompt injection shape. JobHunt has user typed profile fields and saved job descriptions from Slice 1 onward, so the untrusted content is genuinely present.

- Supabase MCP only. No other server connected alongside it.
- `read_only=true`.
- Scoped with `--project-ref` to the development project.
- Per call confirmation left on.
- Never pointed at a project holding real user data.

Feature 3 owns the environment half of this decision.

**8. The deferred tooling choices are not free choices.** Each row of the "Deliberately left open" table above carries a **Must satisfy** column. Those constraints come from decisions made in this spec, and a candidate tool that cannot meet them is not a candidate.

## Consequences

**Positive**

- Isolation between users is enforced in Postgres, so it holds for every query including ones nobody remembered to guard. This is what makes the GA level claim in features 4 and 7 provable rather than asserted.
- Two of the reference project's three named failure modes are answered mechanically rather than by intention: a swallowed failure becomes a compile error, and the array read as an object is caught by parsing the response at the boundary rather than asserting a type onto it. Note that the second is a runtime guarantee from Zod plus generated types, not a compile time one; a wrong declared type cannot be caught by the compiler that was given it.
- The third, a correctly classified failure that was wrong only in aggregate, is answered by the ratio alert.
- A model swap is a reviewable commit, and the eval harness runs against a named configuration rather than whatever happened to be deployed.
- No credential and no query shape reaches the browser, because there is no client side data path.

**Negative and tradeoffs**

- No object relational mapper means complex joins are written by hand and typed from generated types rather than inferred. Feature 4's schema work carries more weight as a result.
- The `Result` union is more ceremony than throwing. Every boundary call has a narrowing step, and it will feel like overhead in the first week.
- Reporting from inside `failure()` means Sentry sees failures constructed during tests unless the test environment disables the transport. That has to be handled at scaffold time or the first test run will produce noise and burn quota.
- Binding rule 4's span placement is a convention, not something the compiler enforces. It is the one rule in this spec that a later feature can break silently by adding an early return above the span. The gated attempt counter exists precisely because of that weakness, but it covers only gated operations; every other operation's denominator still rests on the convention holding.
- Sampling at 1.0 on gated operations costs more Sentry quota than a sampled configuration. Acceptable at this traffic volume, and it needs revisiting if volume ever grows.
- Server Actions are harder to exercise with a plain HTTP client than route handlers, so feature 8's fixtures carry more of the testing burden.
- Vercel's free tier prohibits commercial use. Fine today because the project is explicitly non commercial, and it becomes a real constraint if that ever changes.
- Three tooling decisions are open, so `/develop` cannot scaffold the test setup or the linter from this spec alone.

**Neutral**

- Tailwind v4 configuration lives in CSS, not JavaScript. Any Tailwind guidance written for v3 needs translating.
- Next.js 16 builds with Turbopack by default.
- Docker is required locally for the Supabase stack.
- The legacy Supabase key names appear in most existing tutorials. This project uses the current publishable and secret keys throughout, so tutorial code will need adjusting.

## Follow-up

- [ ] **The scaffold includes one trivial but completely real end to end thread**: a protected page that reads one row from Supabase through the real server client and renders it. This proves the framework, the client, the session, the policy, the deployment and the error path all connect, at Foundation rather than at feature 11. It mirrors feature 1's done when clause in the scope, and it is here rather than only in `rationale.md` because `/develop` does not read that file. Note the ordering consequence: the Supabase project and its first table have to exist during feature 1, not feature 4.
- [ ] Initialise the git repository before the scaffold, so the brief, the scope and this spec are the first commit rather than being buried under generated code.
- [ ] Confirm the exact Node Active LTS line at scaffold time and pin it in `.nvmrc` and `engines`.
- [ ] Confirm the current Sentry alert configuration for a failure rate condition against Sentry's own documentation at build time. The mechanism (mark the span failed inside `failure()`, alert on the failure share with an attempt floor) is settled; the exact product surface for configuring it was not verified during this design and the `sentry-sdk-setup` skill is installed to help.
- [ ] Disable the Sentry transport in the test environment before the first test run, or `failure()` will report during tests.
- [ ] **Feature 10 owns building binding rule 4 and must say so in its done when clause.** Nothing currently commits anyone to building the rate alert, which is the mechanism this spec's whole error model exists to serve. Its done when clause needs: the alert rule defined in `docs/observability/`, trace sampling at 1.0 on the alerted operations, the attempt counter incremented inside the atomic gate function, and a forced failure smoke test proving the alert actually fires end to end in a non production project. The smoke test is the load bearing half, because it proves the whole chain (span, sampling, fingerprint, threshold, delivery) rather than proving a rule exists on paper.
- [ ] Drift detection between Sentry's live alert rules and `docs/observability/` is a v1.5 item, not v1. A scheduled diff proves the rule exists, not that it fires, and costs a scheduler plus API credentials. Add it once the forced failure smoke test has shown the alert works.
- [ ] Decide the UI component source in feature 5, together with the `@theme` port of the seven token palette. Tailwind v4 made those a single decision.
- [ ] Decide the test runners in feature 8.
- [ ] Decide the linter and formatter in feature 2, against the two constraints in binding rule 8.
- [ ] Feature 3 owns the environment half of the MCP decision: which project the development connection points at, and confirmation that no production project is ever reachable from it.
- [ ] The four installed skills (`supabase`, `supabase-postgres-best-practices`, `sentry-sdk-setup`, `sentry-nextjs-sdk`) are not yet referenced anywhere in project context. All four are project wide, so their conventions belong in root `AGENTS.md` once feature 2 creates it.
- [ ] **Install `sentry-nextjs-sdk` and remove `sentry-node-sdk` from `.agents/skills/`.** This spec originally named the Node SDK skill; the router skill points Next.js projects at the Next.js one, and the SDK wiring built during `/develop` follows the Next.js package. The spec text above is corrected, but the installed skill directory still has to be brought in line before feature 2 writes skill conventions into `AGENTS.md`.
- [ ] The Vercel MCP server is present in the environment but not authorised, and it cannot be authorised from a non interactive session. Authorise it through `claude mcp` or `/mcp` in an interactive session if it is wanted; binding rule 7 says Supabase MCP only, so this needs a deliberate decision rather than a default.
- [ ] Residual from the brief, unchanged by this spec: a direct email to Adzuna confirming the multi user reading of their terms.

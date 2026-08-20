# 0001. Stack and architecture, decision record

The build spec is in [index.md](index.md). This file holds the reasoning, the options weighed, and the evidence. `/develop` does not read it.

## Context

> ⚠️ Premise note: the scope puts eight foundation features ahead of the first slice, in a project whose stated build approach is Tracer Bullet. Those two are in tension. The point of a tracer bullet is that the whole pipe is proven end to end while it is still cheap to change, and eight foundation features means the first real thread is not fired until well into the build, which is exactly when the pipe's real problems surface and are most expensive to fix. This is the same shape of risk the brief already identified once, where individually justified work accumulated ahead of anything being proven. The fix is small and belongs here rather than in a scope revision: the feature 1 scaffold should include one deliberately trivial but completely real end to end thread, a protected page that reads one row from Supabase through the real server client and renders it. That proves the framework, the client, the session, the policy, the deployment and the error path all connect, at Foundation, using code that costs an hour. Without it, the first genuine end to end proof does not happen until feature 11, and by then six specs have been written against assumptions nobody tested.

JobHunt replaces a prior project on the author's portfolio and is meant to be genuinely used during a real job search, by the author, a few friends, and recruiters evaluating it. It is free, non commercial, and multi user, which means real people's resumes and personal details are in the database from Slice 1 onward. The author is currently unemployed, so uncontrolled external API cost is a specific named financial risk rather than a theoretical one.

The forces that actually shaped this decision come almost entirely from two audits of the reference project, JobPilot, which are empirical rather than speculative. Three findings matter here. A usage gating function returned an array, the calling code read it as a single object, every metered action was silently denied for every account for two weeks, and all six test mocks encoded the same wrong assumption so the suite passed throughout. A scoring feature passed every test while returning a nearly constant meaningless number, because no test had any notion of output quality. And nine further defects surfaced in twenty minutes of actually using the product, none of which the static audit or 480 passing tests had caught.

The common thread is not insufficient process. Nineteen specs and 480 tests were present. The process was skipped, and nothing about the system made skipping it visible. That is the constraint this stack decision is really working against: wherever a choice exists between a rule someone must remember and a property the compiler or the database enforces, the enforced property wins, even when it costs more to build.

Against that sits a hard practical limit. This is one developer, unemployed, with no budget for paid tooling and a strong reason to ship something usable soon. Any decision that trades a week of foundation work for a marginal safety gain is the wrong trade, and the brief's own review already caught the project once for accumulating individually reasonable work.

Several decisions were already made before this spec and are treated as settled input: Supabase as the combined backend and authentication platform, Next.js with Tailwind CSS, Adzuna as the jobs source, a tiered cross vendor model strategy behind one thin router, no billing, and a locked visual language of seven colour tokens with Space Grotesk and JetBrains Mono.

## Options considered

### Option 1: One Next.js application on Supabase and Vercel, server first

A single Next.js 16 application. All data access happens on the server through `@supabase/ssr`, carrying the caller's token, so Postgres row level security decides what every query returns. No object relational mapper. Schema and policies are hand written SQL migrations in git. Hosting on Vercel with a free tier.

**Pros**

- Row level security applies to every query by construction, so isolation does not depend on remembering a check (basis: your governing principle that the developer writes and owns the policies by hand).
- Nothing to operate. One developer, no infrastructure work during a job search.
- Supabase publishes a first party MCP server, so the agent assisted debugging path that found the reference project's outage is available (basis: named in your own brief as a reason Supabase won).
- Postgres is one database doing relational data, full text search, atomic functions and, if the deferred retrieval tool ever arrives, vectors.

**Cons**

- Two hosted platforms, so two free tiers, two dashboards, two sets of limits to understand.
- Vercel's free tier prohibits commercial use, which is fine now and a constraint if that ever changes.
- No object relational mapper means complex joins are hand written SQL against generated types.
- Server Actions are harder to drive from a plain HTTP client than route handlers, pushing weight onto feature 8's fixtures.

### Option 2: Next.js with self managed Postgres and a self hosted auth library

Next.js in front, a Postgres instance you provision yourself, Drizzle for typed queries and migrations, and an authentication library you host rather than a platform's built in auth. Deployed to a container platform.

**Pros**

- No platform lock. Every piece is replaceable and the whole thing is portable.
- Drizzle gives better typed complex joins than a generated client, and migrations are TypeScript rather than SQL.
- One bill instead of two, and predictable at scale.

**Cons**

- Row level security stops being automatic. Drizzle connects over a Postgres connection string, and policies apply only if the client is configured correctly. A misconfiguration silently returns other users' rows, which is precisely the failure class the reference project already suffered once.
- Self hosting authentication correctly means owning token rotation, session fixation, CSRF and secure storage. This is the one area where building it yourself is a known bad trade.
- Real operational work: provisioning, backups, connection pooling, upgrades, all during a job search.
- Loses the first party MCP debugging path entirely.

### Option 3: A React single page application with a separate API service

Split the product: a React application served as static files, and a dedicated API service (Node with Fastify, or similar) holding all the logic, talking to Postgres.

**Pros**

- A clean, explicit HTTP contract between the two halves, which is genuinely easier to test with ordinary tools.
- The API is reusable by anything later, including the deferred retrieval tool.
- Conventional and very well understood by any reviewer.

**Cons**

- Two deployables, two build pipelines, two things to keep in sync, for one developer and an audience in the tens.
- Data fetching moves to the browser, so token handling, loading states and caching all become your problem again.
- Every page needs its own endpoint, roughly doubling the surface for the same features.
- No server rendering by default, so the entry page that recruiters open loses its metadata and social preview story.

### Option 4: Keep the reference project's original backend platform

Stay on InsForge, the backend the reference project used, with Next.js in front.

**Pros**

- Familiar. No platform migration and no new mental model.
- Agent oriented provisioning is genuinely fast for getting a backend standing.

**Cons**

- Its model is an agent provisioning the backend autonomously, which is the direct opposite of the stated principle that the developer writes and owns the schema and policies by hand.
- Far less production track record and name recognition than the alternative, which matters for a piece whose purpose is partly to be evaluated by recruiters.
- Already reasoned through and rejected in the brief. Reopening it here would re litigate a settled decision without new evidence.

## Rationale

Option 1 wins on the single force that dominates this project's history: the reference project failed at things that were specified correctly and then not done. Row level security is the strongest available answer to that, because it is not a rule anyone can skip. It sits in the database, applies to every query, and holds for the route that someone adds in a hurry six weeks from now. Option 2's Drizzle path is technically better at typed joins and would be the right call on a team with a database specialist, but it converts isolation from an automatic property back into a configuration that has to be right, and this project has already lost two weeks to exactly that class of mistake (basis: your own audit of the reference project's usage gating function).

The same reasoning drove the two decisions that cost the most in daily ergonomics. `noUncheckedIndexedAccess` and the `Result` union are both friction. They are worth it because between them they turn the reference project's anchor bug from a runtime surprise into two separate compile errors: reading an array as an object stops compiling, and ignoring a returned failure stops compiling. Neither depends on anyone remembering anything.

Options 3 and 4 fail on operational reality rather than on architecture. Option 3 doubles the number of things to build and operate to buy a contract boundary that one developer does not need. Option 4 is a settled and reasoned rejection in the brief and nothing found during this design changes it.

Two choices deserve their reasoning recorded because the runner up was close.

**AI access.** The Vercel AI Gateway would satisfy feature 13's requirement more directly than the chosen path: one key, one endpoint, and a tier swap becomes a model string change with no new package. It also brings provider fallback and a zero data retention routing filter (basis: AI SDK 7 and AI Gateway documentation, verified during this design). Direct provider packages won anyway for two reasons specific to this project. Real resumes and personal details flow through these calls, and every additional party in that path is one more thing feature 21's privacy notice has to name and justify. And the gateway would couple the AI layer to the hosting vendor, which is a separate spec's decision that this one should not pre empt. The AI SDK's own provider abstraction already makes a model swap a configuration change, so the gateway's marginal benefit here is spend visibility, and it remains easy to adopt later because it is the same SDK.

**The expected failure rate signal.** The obvious design, classify each failure and send the unexpected ones to Sentry, is correct per instance and would still have missed the reference project's outage entirely, because every denial in that outage was genuinely an expected failure. The anomaly lived only in the aggregate, and with a handful of users the absolute volume was too small for any count threshold to notice. That is why the alert is a ratio with an attempt floor rather than a count, and why attempts have to be counted at all.

The denominator ended up coming from two places rather than one, and the reason is worth recording. The first draft counted attempts as Sentry spans only, marking the active span failed inside `failure()`. An independent cross check found that this reproduces the original bug: if a gated operation runs its gate check before opening its span, a total denial outage produces no spans, so the ratio has no denominator and the alert stays silent. Requiring the span to open first closes that, but it is a convention, and nothing fails to compile when a later feature adds an early return above it. So gated operations, the ones carrying the named financial risk, also increment an attempt counter inside feature 10's atomic gate function, where the increment happens at the moment the gate decision is made and there is no placement to get wrong. The marginal cost is near zero inside a function that has to be written anyway, and feature 28's spend visibility inherits the counters.

The residual cost of this design: trace sampling must stay at 1.0 on the alerted operations, since a sampled ratio at this traffic volume is noise, and the span convention still carries the denominator for every operation that is not gated.

## Cross check outcome, 19 August 2026

An independent read on a different model found seven decision completeness gaps and two soundness objections. All nine were applied. The load bearing ones, recorded because they shaped the spec rather than merely tidying it:

- No feature owned building the rate alert. Feature 10's done when clause now has to carry it, including a forced failure smoke test that proves the alert fires rather than proving the rule exists.
- The span denominator could be zeroed by the exact bug it watches for, as described above.
- An exception escaping an external call never passes through `failure()`, so it carries no severity and no kind. Binding rule 5 converts those. It was deliberately scoped to external boundary calls only: funnelling every escaping exception into a return value would swallow programmer bugs into data, which is the opposite of what the error model is for.
- The failure kind was free text, which would have fragmented or collided the per kind grouping that the alert depends on. It is now a union type.
- Route handlers were in the directory layout with no authorisation rule attached to them.

The reviewer also argued that the Postgres counter should have won outright over the Sentry mechanism, on the grounds that the project trusts Postgres guarantees absolutely everywhere else and the Sentry surface was unverified. That argument is partly accepted: the counter is now built for gated operations rather than deferred. It did not displace Sentry as the alert home, because the counter only covers operations passing through the gate function, and failures elsewhere (a malformed model response, an Adzuna timeout) need somewhere to land too.

## Evidence: landscape check, 19 August 2026

Five searches, no page fetches, run because the brief correctly notes this space moves fast enough that a snapshot goes stale.

- **Next.js 16.3.0**, released 3 August 2026, current stable and carrying an LTS designation. Notable: substantially lower memory in long development sessions, and Instant Navigations.
- **`@supabase/ssr`** is the recommended client for the App Router, requiring two client types, one for the browser and one for the server. Its API is documented as still subject to change, which is worth knowing before pinning.
- **Supabase API keys** have moved to publishable (`sb_publishable_…`) and secret (`sb_secret_…`) formats. The legacy `anon` and `service_role` JWT keys are deprecated by the end of 2026. Both formats work simultaneously during the transition. The secret key carries the Postgres `BYPASSRLS` attribute. A practical advantage beyond the naming: secret keys can be revoked and rotated individually, which the legacy JWT keys cannot.
- **Tailwind CSS v4** moved configuration from `tailwind.config.js` into CSS via the `@theme` directive, and colours from HSL to OKLCH. shadcn/ui is fully compatible. This is why the component source decision and the token port are one decision rather than two.
- **AI SDK 7** is current, and Vercel now operates an AI Gateway fronting many vendors behind one endpoint and one key, with provider routing, fallback, per provider timeouts, and a zero data retention routing filter.
- **Biome versus ESLint**: Biome is ten to thirty five times faster on Next.js projects above roughly 500 files and covers about eighty percent of common ESLint rules, but has no plugin system, so a missing rule cannot be added. Relevant to feature 2's constraint about `jsx-a11y`.
- **Drizzle with Supabase** is the common 2026 pairing, generally recommended as a hybrid with `supabase-js` retained for authentication. Rejected here for the row level security reason given above, not because the pairing does not work.

## References

**Project sources** (verifiable, in this repo)

- `jobhunt-idea-brief.md`: the two JobPilot audits, the settled platform and framework decisions, the named risk retention rule, the process rules, and the Adzuna terms reading
- `docs/scope/scope.md`: feature 1's stated done when clause, the Tracer Bullet build approach, and the feature boundaries that put the component source, test runners and linter in features 5, 8 and 2
- Installed skills: `supabase` and `supabase-postgres-best-practices` (`supabase/agent-skills`), `sentry-sdk-setup` and `sentry-node-sdk` (`getsentry/sentry-for-ai`), all four in `.agents/skills/`

**Practices and standards**

- Row level security as the enforcement point, application code as convenience, never as the guarantee
- Monolith first: extract services only when a specific bottleneck or ownership boundary forces it
- Never build authentication from scratch
- Make the safe path the only path: prefer a property the compiler or the database enforces over a rule a person must remember
- The lethal trifecta for agent tooling: elevated credentials, untrusted input, and an outbound path. Removing any one of the three removes the attack
- WCAG 2.2 AA as the accessibility floor for the v1 loop

**Links** (verified during the 19 August 2026 landscape check; for a human to follow, not fetched again)

- Next.js 16.3 release notes: https://nextjs.org/blog/next-16-3
- Supabase server side auth for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Creating a Supabase client for server side rendering: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Migrating to publishable and secret API keys: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- Understanding Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- shadcn/ui on Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- AI SDK 7 announcement: https://vercel.com/blog/ai-sdk-7
- AI SDK AI Gateway provider: https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
- Supabase Postgres best practices skill: https://skills.sh/supabase/agent-skills/supabase-postgres-best-practices
- Sentry SDK setup skill: https://skills.sh/getsentry/sentry-for-ai/sentry-sdk-setup

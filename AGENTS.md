<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# JobHunt

## Stack

- **Language / Runtime**: TypeScript `strict` plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax` · Node 24, pinned in `.nvmrc` and `engines`
- **Framework**: Next.js 16.3 App Router, React 19.2, server first (no client data path)
- **Key dependencies**: `@supabase/ssr` and `@supabase/supabase-js` (no object relational mapper) · Zod 4 · `@t3-oss/env-nextjs` · `@sentry/nextjs` · Tailwind CSS v4
- **Package manager**: pnpm 11.22

## Build approach

Tracer Bullet: prove the whole pipe works end to end, narrow but real, before building any single part of it fully.

## Commands

```bash
pnpm install / dev / build / typecheck
pnpm db:start    # local Supabase stack, needs Docker
pnpm db:reset    # reapply migrations and seed
pnpm db:types    # regenerate src/lib/supabase/database.types.ts
```

Test runners are not chosen yet. Feature 8 decides them; do not install one before that.

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.
Spec [0001](docs/specs/0001-stack-and-architecture/index.md) is accepted and its **binding rules are not open to per feature reinterpretation**. Read it before changing anything below.

## Rules

- **Functional and immutable.** Plain functions, no classes. `readonly` and `const` throughout, never mutate in place. Module level variables are constants only. Side effects live at the edges and stay explicit. Prefer `undefined` in a union over `null`.
- **Errors are values.** Every failure is built by `failure()` in [src/lib/result.ts](src/lib/result.ts), which reports to Sentry itself. Never write a failure object literal and never throw for an expected failure. Severity and kind are required, and kind is a member of `FailureKind`, never free text.
- **Open the named span first.** In any operation whose failure rate matters, `Sentry.startSpan` is the *first* statement, before any guard clause or early return, then register the name in [docs/observability/spans.md](docs/observability/spans.md). A span opened later leaves the rate alert with no denominator.
- **Wrap external calls in `attempt()`.** `fetch`, provider SDKs and the database driver may throw. A programmer bug should still throw and reach an error boundary.
- **The secret key has exactly one home.** Only [src/lib/supabase/secret.ts](src/lib/supabase/secret.ts) may build a secret key client. Importing it from anywhere under `src/app` is forbidden.
- **Authorisation is never decided in middleware.** Middleware only refreshes the session cookie. The protected layout checks the session and every Server Action checks its own caller independently. Row level security in Postgres is the real guarantee. Route handlers under `src/app/api/` may not read or write user data.
- **Server Components read, Server Actions write.** No Supabase call and no session check runs in the browser.
- **Parse at every boundary** with Zod: external responses, model output, form input, environment variables.
- **Folder by feature.** A feature's code lives in `src/features/<feature>/`. Routes live only in `src/app`. Anything two features share moves to `src/lib` or `src/components/ui`.
- **Named exports and doc comments.** No default exports except where Next.js demands one (`page.tsx`, `layout.tsx`, `global-error.tsx`). File names are kebab-case, components included. Every export carries a doc comment, and comments say *why*, citing the binding rule or spec number when the line is load bearing, so a later session cannot simplify a rule away without seeing it.
- **Accessibility is WCAG 2.2 AA** on the v1 loop: keyboard reachable, visible focus, real labels.
- **No silent failures, and store raw.** A failure is always visible, never a default that reads like success. Values are stored raw and formatted at render.
- **Tests use real dependencies**, never a mock encoding the same assumption as the code under test. Fixtures carry no real personal data, and anything that scores or generates needs expected ranges, not just schema shape.

## Tooling

Chosen here, installed by `/develop tooling`. Nothing below exists yet.

- **Lint and format**: ESLint plus Prettier. Must enforce `jsx-a11y` rules and, per binding rule 1, a `no-restricted-imports` override blocking `src/lib/supabase/secret.ts` from `src/app/**`.
- **Before commit**: lint, format and typecheck on changed files.
- **CI**: GitHub Actions on push and pull request, running lint, typecheck and build. The test job waits for feature 8.

## Git

- integration: on
- branch prefix: `feat/`
- commit: per-milestone

Messages are conventional (`feat:`, `fix:`, `docs:`, `chore:`). Push and pull requests always confirm with the engineer first.

## Agent skills

- [supabase](.agents/skills/supabase/): `supabase/agent-skills`, Supabase client, auth and SSR conventions.
- [supabase-postgres-best-practices](.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, schema, migrations, row level security and indexes. Read before any database change.
- [sentry-nextjs-sdk](.agents/skills/sentry-nextjs-sdk/): `getsentry/sentry-for-ai`, the Next.js Sentry SDK wiring behind the error model.
- [sentry-sdk-setup](.agents/skills/sentry-sdk-setup/): `getsentry/sentry-for-ai`, Sentry setup routing and alert configuration.
- [vercel-react-best-practices](.agents/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React 19 and Next.js App Router performance and rendering patterns.

Declined: `vercel-labs@web-design-guidelines`, `vercel-labs@vercel-composition-patterns`, `addyosmani@accessibility`.
Reconsider at slice 2: `vercel/ai@ai-sdk`, since spec 0001 picks AI SDK 7 and nothing uses it yet.
MCP servers: none connected. The Supabase MCP is permitted only under all five conditions of spec 0001 binding rule 7; feature 3 owns the environment half of that decision.

## Circuit breaker

If the same problem persists after one corrective prompt, stop and run /recover before trying
again. It diagnoses an isolated bug (routes to /debug), a session gone wrong through repeated
patching (hard reset), or a foundation resting on a wrong assumption (rethink).

/recover states its diagnosis without asking, but pauses for confirmation before a hard reset
ends the session or a rethink changes code. A hard reset note goes to `docs/session-notes.md`,
which /checkpoint reads and ages out.

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

# JobHunt

A multi user job search web app: enter a profile, search real listings, see them
ranked with the reasoning shown, click through to apply, and record that you
applied.

One Next.js application on Supabase, deployed to Vercel, with the whole data path
on the server. See [spec 0001](docs/specs/0001-stack-and-architecture/index.md)
for the architecture decision and the binding rules, and
[the scope](docs/scope/scope.md) for what is built and what is next.

## Running it locally

You need Node 24 (the version in `.nvmrc`), pnpm through corepack, and Docker
running for the local Supabase stack.

```bash
corepack enable pnpm
pnpm install

cp .env.example .env.local     # then fill it in, see below
pnpm db:start                  # starts the local Supabase stack in Docker
pnpm db:reset                  # applies migrations, then seeds two dev users
pnpm dev
```

`pnpm db:start` prints the API URL, the publishable key and the secret key. Put
those three into `.env.local`. Everything in `src/env.ts` is parsed at build and
at boot, so a missing one fails loudly rather than surfacing later as a confusing
runtime error.

Other commands: `pnpm build`, `pnpm typecheck`, `pnpm db:stop`, and `pnpm
db:types` to regenerate `src/lib/supabase/database.types.ts` after a schema
change.

## Seeing the scaffold thread

The scaffold proves one real end to end thread: a protected page reading a row
from Supabase through the real server client, under a real policy, with a real
session.

Visit `/sign-in` and sign in as `dev-one@example.test`, password
`devpassword123`. You land on `/health`, which shows the one row that user owns.
Sign out, sign in as `dev-two@example.test` with the same password, and the page
must show a different row. If both users see the same row, row level security is
not working and the scaffold has proved nothing.

That password sign in is development only and hard blocked anywhere else. Spec
0001 decided OAuth only (Google and GitHub) for the real product, and feature 7
builds it and removes this.

## Layout

```text
src/
  app/
    (marketing)/   public routes, no session required
    (app)/         protected routes; its layout verifies the session
  features/        each feature's own actions, queries, components, schemas
  lib/
    supabase/      browser, server and secret key clients
    result.ts      the Result union and the failure() constructor
  env.ts           validated environment variables
  proxy.ts         refreshes the session cookie, decides nothing
supabase/
  migrations/      hand written SQL, the source of truth for schema and policy
docs/
  observability/   alert rule and span definitions, kept in git for review
```

Routes live only in `src/app`. A feature's own code lives in
`src/features/<feature>/`. Anything two features share moves to `src/lib` or
`src/components/ui`.

## Rules worth knowing before you write code

These come from spec 0001 and are not open to per feature reinterpretation. The
full list is in the spec; these are the ones you will hit first.

- **The secret key is constructible in exactly one file**, `src/lib/supabase/secret.ts`.
  It carries BYPASSRLS and skips every policy. The list of callers allowed to
  import it is closed, and adding one means editing the spec.
- **Every failure goes through `failure()`** in `src/lib/result.ts`, which reports
  to Sentry itself. There is no way to make a failure that goes unreported.
- **Every failure carries a severity and a kind**, both required by the type. The
  kind comes from a union, never a free text string, because the Sentry
  fingerprint is derived from it.
- **Authorisation is never decided in `proxy.ts`.** It refreshes the session
  cookie and nothing else. The protected layout verifies the session, every
  Server Action verifies its own caller, and row level security is the guarantee
  behind both.
- **A named span opens as the first statement of an operation**, before any early
  return or guard. Span names are registered in `docs/observability/spans.md`.

# src/features/auth

Sign in, sign out, and the one account rule. Built by feature 7, governed by [spec 0007](../../../docs/specs/0007-auth-and-per-user-isolation/index.md).

OAuth only, Google and GitHub, with no password path anywhere in the product. The whole handshake runs on the server.

## What lives here

| File | What it owns |
|---|---|
| [actions.ts](actions.ts) | The two sign in Server Actions and `signOut()` |
| [callback.ts](callback.ts) | The return leg: the code exchange, and how a failed arrival is classified |
| [failure-codes.ts](failure-codes.ts) | The closed enum of five error codes, with the kind and severity each carries |
| [copy.ts](copy.ts) | The six sentences the sign in page renders, written by the engineer |
| [provider-forms.tsx](provider-forms.tsx) | One submit form per provider, rendered by `/sign-in` and by the entry page |

Three things this feature owns live outside this folder, because their locations are forced:

- [src/app/auth/callback/route.ts](../../app/auth/callback/route.ts), the route handler. Thin by design: it turns `completeSignIn()`'s outcome into a redirect and nothing else.
- [src/app/(marketing)/sign-in/page.tsx](<../../app/(marketing)/sign-in/page.tsx>), the page.
- [supabase/migrations/20260830230000_before_user_created_hook.sql](../../../supabase/migrations/20260830230000_before_user_created_hook.sql), the refusal hook.

## Rules that are easy to break by accident

- **Nothing here may cross the client boundary.** The controls are `<form action={...}>` submits, which work with JavaScript switched off. A click handler would drag every page that renders them across the boundary and break spec 0006's contract that the entry page ships zero client JavaScript.
- **The directive is described, never quoted, in this tree.** Spec 0006's AC-4 is checked by a plain recursive grep for that phrase across `src/`, so a comment spelling it out answers the check with itself. Write "the client boundary directive" instead.
- **The callback must not move under `src/app/api/`.** Binding rule 6 forbids a route handler there from reading or writing user data, and this one writes the session cookies. `/auth/callback` keeps that rule intact rather than carving an exception into it.
- **`redirectTo` comes from `currentOrigin()`, never `canonicalSiteUrl`.** The second is the production origin in every environment, so substituting it would break sign in everywhere except production, which is the one place nobody would notice.
- **Sign in must be started on the host it will return to.** The PKCE code verifier is a host only cookie, so a sign in begun on a per commit preview URL fails at the exchange. That is documented expected behaviour, not a misconfiguration, and `COPY-4` tells the person to start again from the sign in page, which is exactly what fixes it.
- **`redirect()` goes outside the span and outside `attempt()`.** It works by throwing, so a call inside either records the operation as having failed when it succeeded.
- **The failure table is a value, not a `switch` at each call site.** `AUTH_FAILURES` fixes the kind and severity per code, so no caller picks a severity in the moment. Adding a code means adding an enum member and a row, and the type makes both mandatory.
- **The copy is the engineer's and is used verbatim.** Six slots, no em dash, no en dash, no semicolon, in any of them. Several say "below", which is a layout constraint: the error line renders ABOVE both provider forms. `COPY-2` says "the other sign in option", which is true only because the set is closed at two.
- **No provider text ever reaches a rendered page.** Provider strings go to Sentry as context. The `error` query value is parsed against the closed enum and an unrecognised value renders the one generic sentence rather than itself.

## The hook, and the one string it shares with this code

`public.before_user_created_hook` refuses a second unlinked account for an email that already belongs to an identity, and refuses on its own internal error too rather than failing open.

**`ACCOUNT_EXISTS_MARKER` in [callback.ts](callback.ts) must stay byte for byte identical to the opening of that function's refusal message.** GoTrue forwards a hook refusal to the callback as `error=server_error` with an EMPTY `error_code`, so the message is the only channel carrying anything specific. An integration test drives the real function and feeds its real message through the real classifier, so rewording one side fails the suite instead of silently degrading `account_exists` into `no_code`.

Three findings that cost real time and are easy to hit again:

- **`NULLIF` is a SQL construct, not a `pg_catalog` function.** Under `set search_path = ''` a qualified `pg_catalog.nullif(...)` does not resolve and the whole hook falls into its own exception handler, so every signup is refused with the internal error message: fail closed working and the hook broken at the same time.
- **GoTrue prunes an unconfirmed user AND its identity before calling the hook.** The hook therefore correctly allows on that path, because nobody owns the address at the moment it is asked. A test written against a clean fixture asserts the opposite.
- **Enablement is dashboard state that no file here records.** The migration ships the function; the switch is flipped per hosted project, so the two can drift. Rollback is one step: set `enabled = false` on the `config.toml` stanza and in each dashboard.

## Testing

Unit tests sit beside the code (`pnpm test`, the `node` environment, no jsdom). They cover the pure decisions: which code an arrival is classified as, and what the page renders for a given query value.

Everything touching the database or a real session is an integration test against the real local stack (`pnpm test:integration`).

**The hook cannot be tested through the Data API, deliberately.** Its `execute` is revoked from `public` and granted to `supabase_auth_admin` alone, so `service_role` gets `permission denied for function`, and GoTrue answers a duplicate signup with `user_already_exists` before the hook is consulted. So its tests call the real function over a direct connection, through [test/helpers/database.ts](../../../test/helpers/database.ts), which is guarded by `TEST_DIRECT_DB_ENABLED` and refuses any host that is not local.

What no automated test here covers, and why: the real handshake needs a browser and real provider accounts, and this feature deliberately does not bring an end to end runner. Those steps live in [verify.md](../../../docs/specs/0007-auth-and-per-user-isolation/verify.md).

_Drafted by /sync from the introducing change, worth a quick human pass._

# Session notes

Short lived context that does not belong in scope, a spec, or AGENTS.md yet.
Written by /checkpoint save, read by /checkpoint restore.

## Open threads

- Spec 0002 tasks 2, 7 and 8 were built and proved green (typecheck, lint, and the build failing by name with the variable missing then passing with it set), then reverted whole at the engineer's request, because `/develop` had been started without being asked for it. Nothing of that work survives on disk. Rebuilding it is the first step of the next build and should be quick.
- The conditional Sentry DSN rule that worked, so it is not re derived from scratch: `createFinalSchema(shape, isServer)` in `@t3-oss/env-core` 0.13.11. The `isServer` flag matters because env core builds the client shape without server variables in it, so `SENTRY_DSN` can only be demanded on the server pass. `z.stringbool()` in Zod 4.4.3 covers `DEV_SESSION_ENABLED` and rejects a malformed value rather than quietly reading it as false.

## Standing instructions

- Nothing in this environment can read Vercel state directly: the Vercel CLI is not installed and the Vercel MCP server is unauthorised. Ask the engineer for anything behind the Vercel login rather than inferring it from documentation defaults.

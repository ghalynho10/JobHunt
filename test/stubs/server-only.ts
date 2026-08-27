/**
 * The `server-only` marker, neutralised for Vitest (spec 0004, "Module
 * resolution under Vitest").
 *
 * `server-only@0.0.1` maps the `react-server` export condition to an empty file
 * and EVERY other condition to a module whose whole body is a `throw`. Vitest
 * resolves the default condition, so a bare `import "server-only"` explodes at
 * import time. That import is the first statement of
 * `src/lib/supabase/secret.ts`, `src/lib/supabase/server.ts` and
 * `src/features/profile/queries.ts`, which is every module the integration
 * thread has to load, so without this alias the whole feature cannot run.
 *
 * Aliased here rather than by adding `react-server` to `resolve.conditions`,
 * which is not scoped to one package and would pull React's own server build
 * into every test.
 *
 * This is a TEST ONLY concession. The marker still does its real job in the
 * application build, where the `react-server` condition genuinely applies.
 */
export {};

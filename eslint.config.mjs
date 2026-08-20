import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier/flat";

/**
 * Flat config, run through the ESLint CLI (`pnpm lint`).
 *
 * Next.js 16 removed `next lint` and its `eslint` config option, so the CLI is
 * the only supported entry point now. See
 * `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`.
 *
 * Order matters: later entries override earlier ones. The accessibility block
 * raises the rules `eslint-config-next` only warns about, and `prettier` comes
 * last so it can switch off every formatting rule that would fight Prettier.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,

  /**
   * BINDING RULE 8 (spec 0001): the linter must enforce accessibility at
   * `jsx-a11y` level. `eslint-config-next` turns on eight of these rules as
   * warnings, which is below the WCAG 2.2 AA floor this project committed to, so
   * the full strict set is layered on as errors. A warning is a silent failure
   * with extra steps.
   *
   * Only the rules are taken, never the plugin registration: `eslint-config-next`
   * already registers `jsx-a11y`, and flat config refuses to define the same
   * plugin name twice. Both configs resolve to the same plugin version, so the
   * rule names below match the rules that actually run.
   */
  {
    files: ["**/*.{jsx,tsx}"],
    rules: jsxA11y.flatConfigs.strict.rules,
  },

  /**
   * BINDING RULE 1 (spec 0001): the secret key is constructible in exactly one
   * file. `src/lib/supabase/secret.ts` builds a client that carries BYPASSRLS
   * and skips every row level security policy, so nothing under `src/app` may
   * import it. The typescript-eslint version of the rule is used because it also
   * catches `import type`, which the base rule lets through.
   *
   * The allow list lives in spec 0001 binding rule 1: the development only test
   * session mint, the kill switch read, and the seeded demo account. Adding a
   * fourth caller means editing that spec, not this file.
   */
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/supabase/secret",
                "**/lib/supabase/secret",
                "**/supabase/secret",
              ],
              message:
                "Binding rule 1 (spec 0001): the secret key client skips row level security and may not be imported from src/app. Read data through src/lib/supabase/server.ts instead.",
            },
          ],
        },
      ],
    },
  },

  /**
   * Config files at the repo root are plain Node modules, not app code. They run
   * outside the bundler and are not covered by the app's TypeScript project.
   */
  {
    files: ["*.mjs", "*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  prettier,

  globalIgnores([
    // The defaults of eslint-config-next, restated because setting any
    // globalIgnores replaces them.
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from the live database by `pnpm db:types`. Editing it by hand,
    // or reformatting it, is pointless: the next generation overwrites it.
    "src/lib/supabase/database.types.ts",
    // Documentation and design exports, not shipped code.
    "docs/**",
    // Local agent tooling and Supabase CLI scratch state.
    ".agents/**",
    ".claude/**",
    "supabase/.temp/**",
  ]),
]);

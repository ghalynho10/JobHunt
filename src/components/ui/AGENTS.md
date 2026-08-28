# src/components/ui

The design system: the token layer's consumers, and the only sanctioned way to render these patterns. Built by feature 5, governed by [spec 0005](../../../docs/specs/0005-design-system-and-ui-foundation/index.md), which is `Accepted`.

## What lives here

One component per file, kebab-case, named exports only. All server components: none holds state, takes an event handler, or crosses the client boundary. A consuming feature adds its own `"use client"` boundary where it needs real interactivity; a base component never does.

| File | What it owns |
|---|---|
| [tv.ts](tv.ts) | The configured `tailwind-variants` instance. Read its header before touching anything else here. |
| [text.tsx](text.tsx) | The five type registers, and the mono versus sans rule |
| [heading.tsx](heading.tsx) | The three heading sizes of the locked scale |
| [button.tsx](button.tsx) | The one sanctioned control, button or link |
| [card.tsx](card.tsx) | The two container idioms, plus `Header` / `Body` / `Footer` slots |
| [chip.tsx](chip.tsx) | The fill versus outline grammar at chip scale |
| [match-bar.tsx](match-bar.tsx) | The segmented match bar, deriving its own cells |
| [section.tsx](section.tsx) | Page rhythm, background alternation, and the divider rule |
| [icons.tsx](icons.tsx) | The five icons, plain SVG, no icon library |

Token values are NOT here. They live in [src/app/globals.css](../../app/globals.css) as raw values in `:root` mapped through a non-inline `@theme`. The art direction and the verified palette live in [docs/design/brand-tokens.md](../../../docs/design/brand-tokens.md); this project has no `design.md`, those two files plus spec 0005 are the design system of record.

## Rules that are easy to break by accident

- **Import `tv` from [./tv.ts](tv.ts), never from `tailwind-variants` directly.** The package's stock configuration cannot tell this project's custom `text-*` sizes from text colours, so it files each size as a colour and silently drops one of the pair. That shipped once: an eyebrow rendered at 17px instead of 12px and a button rendered ink instead of teal, with no error and no failing build.
- **A size added to `globals.css` must be added to `tv.ts` too.** [tv.test.ts](tv.test.ts) reads the scale out of the CSS and fails if the two drift, so the guard is automatic, but the fix is manual.
- **The `@theme` block in `globals.css` must stay non-inline.** `@theme inline` bakes values in at build time, which silently kills the `prefers-contrast: more` override, the responsive body size, and the responsive section rhythm. All three work by redefining a raw variable and letting every utility follow.
- **A rounded, bordered container is what `Card` is for.** Hand composing one outside this directory is an ESLint error (`no-restricted-syntax`, see [eslint.config.mjs](../../../eslint.config.mjs)).
- **`Card` is one idiom or the other.** Elevated is shadow led with a low opacity edge hint; flat is border led with no shadow. A flat card that grows a shadow erases the distinction the whole split exists for.
- **`Section`'s divider rule is caller enforced.** A hairline goes between two sections that share a background; two sections with different backgrounds take none. The component cannot see its siblings, so nothing catches a wrong value.
- **No component ships a default entrance animation.** The match cell stagger is the only sanctioned default motion, and it is the precedent any future request is judged against.

## Accessibility floor

WCAG 2.2 AA, and most of it is centralised rather than per component. `globals.css` owns the one `:focus-visible` ring, so a new component cannot ship without one. `forced-colors`, `prefers-contrast` and `prefers-reduced-motion` are handled there in native CSS with no JavaScript media query code. What a component still owns: a real accessible name on every control, `aria-hidden` on every decorative icon, and keeping state readable by shape rather than by colour alone.

## Testing

Tests sit beside each component and run in the unit project (`pnpm test`), which is the `node` environment. There is no jsdom and no testing library, deliberately: these are stateless server components, so calling one is its whole behaviour and the element it returns is its whole output. [test/helpers/react-element.ts](../../../test/helpers/react-element.ts) walks that returned tree.

Anything needing a real browser (computed sizes, the focus ring, media queries, layout, overflow) is not faked here. It lives in [verify.md](../../../docs/specs/0005-design-system-and-ui-foundation/verify.md) and is proved by `/check verify`.

`button.test.ts` uses `@ts-expect-error` as a compile time assertion, which `tsc --noEmit` enforces. Keep each of those calls on one line: the directive only suppresses the line directly beneath it, so a call Prettier wraps moves the error out from under its directive and the test then asserts the opposite of what it means.

_Drafted by /sync from the introducing change, worth a quick human pass._

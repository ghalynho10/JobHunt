# UI registry

What has actually been built, and the values every later component is measured against. Owned by `/imprint`.

This is a record, not a standard. The standard is [docs/design/brand-tokens.md](docs/design/brand-tokens.md) plus [spec 0005](docs/specs/0005-design-system-and-ui-foundation/index.md), and the token values themselves live in [src/app/globals.css](src/app/globals.css). Where this file and those disagree, they win and this file is wrong.

## Baseline, established 2026-08-29

Source: audit of the existing codebase, 22 UI files (9 base components, 9 entry page modules, 3 routes), never previously tracked. Three conflicts were found and the engineer resolved all three; the values below are the resolved ones, so two of them do not yet match the code. See `## Components to fix`.

### Radius, by kind of object

Radius follows what the object *is*, never how big it is. A component that renders at two sizes keeps one radius.

| Object | Confirmed value |
| --- | --- |
| Card, both idioms | `rounded-2xl` |
| Button, all variants and sizes | `rounded-lg` |
| Chip, all three states | `rounded-md` |
| Score badge, both sizes | `rounded-md` |
| Match bar cell | `rounded-sm` |
| Continuous comparison bar | `rounded-full` (deliberately a different object from the match bar) |

### Surfaces

| Property | Confirmed value |
| --- | --- |
| Card, elevated | `bg-surface` + `border border-line/25` + the one shadow, `shadow-[0_1px_2px_rgba(26,26,26,0.04),0_12px_32px_-16px_rgba(26,26,26,0.18)]` |
| Card, flat | `bg-paper` + `border border-line`, no shadow |
| Page section ground | `bg-paper` or `bg-surface-sunken`, alternating |
| Sticky header | `bg-surface-sunken/85` with `backdrop-blur` |
| Dark band | `bg-primary-800` |
| Card padding | `p-6 sm:p-7` |

An elevated card that grows a border led look, or a flat card that grows a shadow, erases the only distinction between the two idioms.

### Controls

| Property | Confirmed value |
| --- | --- |
| Button primary | `bg-primary-800 text-paper`, hover `bg-primary-900` |
| Button secondary | `border border-line bg-surface text-ink`, hover `border-ink bg-primary-50` |
| Button tertiary | `text-primary-800`, underline on hover only |
| Button size md / sm | `px-5 py-2.5` / `px-3.5 py-2` |
| Disabled | `disabled:cursor-not-allowed disabled:opacity-55` (buttons only; an anchor can never be disabled) |
| Focus ring | not set per component. `globals.css` owns one `:focus-visible` ring, `2px solid var(--primary-600)` at `2px` offset |

### Text

| Register | Confirmed value |
| --- | --- |
| Eyebrow | `text-caption` sans, uppercase, `tracking-[0.08em]`, `text-muted` |
| Mono label, a short literal | `text-small` mono, `tracking-[0.02em]`, `text-muted` |
| Mono data, written reasoning | `text-small` mono, `leading-[1.6]`, `text-secondary` |
| Body | `text-body` sans, `text-ink`, capped at `65ch` |
| Muted prose | `text-small` sans, `text-muted`, capped at `65ch` |
| Headings | `text-display` / `text-h2` / `text-h3`, level and size are one choice |

**The scale is closed at six sizes.** Nothing renders at an arbitrary `text-[Npx]`. A seventh size means editing both `globals.css` and `tv.ts`, or `tv.test.ts` fails.

### Colour rules that are easy to break

| Rule | Value |
| --- | --- |
| Amber `--accent-300` | the match score, and nothing else |
| Teal `--primary-*` | evidence: matched cells, matched chips, the dark band |
| A gap or a missing skill | never red. Outline plus a dashed icon, never colour alone |
| Text and line colours | `--ink`, `--secondary`, `--muted`, `--line` only. No stock Tailwind colour appears anywhere |
| Hardcoded hex | none in any component. The only literal colours live in `og-tokens.ts`, which Satori forces, and they are drift guarded against `globals.css` |

### Spacing rhythm

| Property | Confirmed value |
| --- | --- |
| Section rhythm | `py-section-compact` / `-standard` / `-generous`, responsive pairs |
| Content column | `mx-auto w-full max-w-6xl px-6` |
| Two column split | `grid-split` (3fr 2fr) at `lg`, for a primary and a secondary column |
| Chip cluster gap | `gap-1.5` |
| Card slot rhythm | header `gap-1`, body `mt-4`, footer `mt-6` |

### Motion

One sanctioned default animation exists: the match cell stagger. Nothing else animates on load. Delays and durations are both zeroed under `prefers-reduced-motion`, and [globals.test.ts](src/app/globals.test.ts) fails if a future motion property is added without a reset.

## Components to fix

Both are the audit's confirmed resolutions, not yet applied to the code.

- `src/features/entry-page/score-badge.tsx`: the `compare` size uses `rounded-lg` where the `card` size uses `rounded-md`. Radius follows the object, not the size, so both become `rounded-md`.
- `src/components/ui/chip.tsx`: the `status` state uses plain `rounded` and `text-[10px]`. Both are off pattern: it becomes `rounded-md` to match `matched` and `missing`, and `text-caption` instead of the arbitrary 10px, which keeps the closed scale meaningful rather than adding a seventh size for one badge.

## Known and excluded

`src/app/(marketing)/sign-in/page.tsx` and `src/features/dev-session/sign-in-form.tsx` use no design system component and no token: raw `border px-2 py-1`, and `text-red-700`, a stock Tailwind colour that is not in the palette at all. They are development only scaffold and **feature 7 deletes both outright**, so they are recorded here rather than put on the fix list. Do not spend effort styling them.

---
*Established by `/imprint audit` on 2026-08-29. Ordinary `/imprint` keeps new components measured against this.*

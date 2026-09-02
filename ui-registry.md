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
| Application status | Locked in `brand-tokens.md`, not yet built anywhere: Applied `#2A526F` on white, Interviewing `#FCD581` on ink, Offer `#6B2E52` on white, Rejected `#733D26` on white. Not the teal evidence colour and not a chip state, its own colour per status. |

### Spacing rhythm

| Property | Confirmed value |
| --- | --- |
| Section rhythm | `py-section-compact` / `-standard` / `-generous`, responsive pairs |
| Content column, marketing pages | `mx-auto w-full max-w-6xl px-6` |
| Content column, app shell screens | `880px` wide, `24px` gutter. Deliberately narrower than the marketing column: a dense list of result cards reads better on a narrower measure than a marketing hero. Confirmed 2026-08-30 against `docs/design/jobhunt-app-shell.html`, which is the only place this value has been used so far. |
| Two column split | `grid-split` (3fr 2fr) at `lg`, for a primary and a secondary column |
| Chip cluster gap | `gap-1.5` |
| Card slot rhythm | header `gap-1`, body `mt-4`, footer `mt-6`, three different values by slot, not one flex gap for the whole card |

### Motion

One sanctioned default animation exists: the match cell stagger. Nothing else animates on load. Delays and durations are both zeroed under `prefers-reduced-motion`, and [globals.test.ts](src/app/globals.test.ts) fails if a future motion property is added without a reset.

## Design tool import audit, 2026-08-30

Source: `docs/design/jobhunt-app-shell.html`, a design tool export of the app shell screens (search, dense search, role detail, profile, applications), checked against the baseline above, `brand-tokens.md`, and the real components in `src/components/ui`. This file is a reference mock, not shippable code, so there is nothing here to edit directly. The list below is what a future build of these screens must correct rather than carry over from the mock.

Colours, both typefaces, and the focus ring all matched the baseline exactly and needed no correction.

### What the mock gets wrong

- **Score badge radius.** Mock renders `10px` and `8px`. Real `score-badge.tsx` is `rounded-md` (6px) at both sizes, confirmed above.
- **Chip radius, all four instances.** Mock renders every chip and the applications screen's status pill at `999px`. Real `chip.tsx` is `rounded-md` for matched, missing, and status alike, confirmed above.
- **Two invented border colours.** The mock never uses `--line`. It uses `#EDE6E8` on the elevated card and `#D9D1D4` (matching the secondary button mismatch already found by hand) on the flat card, the secondary button, the search bar, and the segmented control. Both are warm, rose tinted greys; `--line` is a cool slate grey. Correct all of these to `--line`, full strength on flat surfaces and controls, 25% opacity as the elevated card's hairline hint.
- **Card padding is fixed, not responsive.** Mock: `22px` / `20px` at every width. Real `card.tsx`: `p-6 sm:p-7`, `24px` below `sm` and `28px` at and above it.
- **Elevated card has one shadow, not two.** Real `card.tsx` layers a 1px contact shadow with the wide lift shadow on purpose, "so the edge reads at rest." The mock's single shadow drops the contact shadow.
- **Gap (missing skill) chip is teal, not muted.** Real `chip.tsx`'s `missing` state is `border-line`, `bg-surface`, `text-muted`, quiet on purpose. The mock's `.chip-gap` borders in teal and sets the heavier `--ink2` text colour, which reads as a weaker "matched" rather than "missing."
- **Application status colours are unused.** The mock's one status shown, Applied, is styled as the teal matched chip look instead of the locked `#2A526F` on white from `brand-tokens.md`, see the Colour rules table above.
- **Several text sizes fall off the closed six step scale.** Most visibly: the search and applications screen title at `28px`, where the profile screen's own title correctly uses `30px`/`text-h2`; the search bar and key/value labels at `11px` where the Eyebrow register is `12px`; and a `14px` value repeated across roughly eight rules (screen subtitle, profile meta line, empty state subtitle, entry description) that should collapse to `text-small` (13px) rather than be treated as a real seventh step.

### Open, not written as a value

- **ScoreBadge needs a third size.** Confirmed 2026-08-30: the mock's dense rows and applications list need a badge smaller than the current `card` size (`text-h3`, 20px). Which step on the locked scale that third size should take is not decided yet. Route to `/architect` or the spec that builds the app shell before `score-badge.tsx` grows a third variant.
- **Search input and segmented control have no real component yet.** Nothing in `src/components/ui` covers either, so there is no baseline to check the mock's `.input` and `.seg` styling against. Once `Input` or a segmented control exists, re run this section against it; expect the same `--border-strong` issue to show up there too.

## Known and excluded

`src/app/(marketing)/sign-in/page.tsx` and `src/features/dev-session/sign-in-form.tsx` use no design system component and no token: raw `border px-2 py-1`, and `text-red-700`, a stock Tailwind colour that is not in the palette at all. They are development only scaffold and **feature 7 deletes both outright**, so they are recorded here rather than put on the fix list. Do not spend effort styling them.

---
*Established by `/imprint audit` on 2026-08-29, extended by a design tool import audit on 2026-08-30. Ordinary `/imprint` keeps new components measured against this.*

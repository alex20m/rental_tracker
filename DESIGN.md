# Rental Tracker design system

This is the design system the app is built on. Every screen follows it, and
every change to how the app looks either fits inside it or changes this file in
the same commit. `tests/design-doc.test.ts` fails if a token exists in the
stylesheets without a line here, or if this file names a token that no longer
exists. The `design-system` skill (`.claude/skills/design-system/SKILL.md`) is
the procedure for working with it.

The system is called **Mono**: black and white like the app's logo, round and
calm, with colour kept for status.

## Principles

1. **Black and white like the logo.** The logo is a near-black tile with a white
   building. The app's chrome (paper, text, buttons, menus, fields, links) is
   the same two values plus greys between them. Primary buttons are black;
   in dark mode the logo is inverted and they are white.
2. **Colour means status, and only status.** Green: rent that came in, things
   that are done. Red: unpaid rent, errors, deleting. Amber: what needs a look
   (to-dos, warnings such as "not deductible"). Yellow: costs in the chart.
   Grey: vacant, not yet logged, disabled. Colour is never decoration, never a
   brand accent and never on a button that is not destructive.
3. **One idea per screen, set big.** The screen's main figure sits bare on the
   paper at display size; its parts sit in columns under a hairline.
4. **Surfaces by role, not one card for everything.** Lists are white sheets on
   a soft shadow (no hairline border). To-dos, the month grid and segmented
   controls sit in sunken grey trays. Nothing is a card inside a card.
5. **Round and quiet.** Pills for every control, 20px cards, 14px tiles and
   fields. Motion reports a state; it never decorates.
6. **Nothing tappable moves after a page opens.** Entrances fade in place. A
   slide-in once let a tap land during the animation's delay and miss.

## Where it lives

| File | What it holds |
| --- | --- |
| `app/tokens.css` | The raw theme (Mono colours, faces, radii, shadows) and the shared scales: spacing, type, motion, z-index. |
| `app/base.css` | Base rules every page gets: box sizing, `overflow-x: clip`, focus ring, headings, reduced motion. |
| `app/globals.css` | The app's own token names mapped onto the theme, the dark palette, and every component. Its first lines are the Hallmark stamp. |
| `app/layout.tsx` | Loads Plus Jakarta Sans (self-hosted from `@fontsource-variable/plus-jakarta-sans`, so a build never needs the network) as `--font-jakarta`; the browser's theme colours for light and dark. |
| `public/manifest.webmanifest` | The installed app's background (the light paper) and theme colour (the logo's black). |
| `public/icon.svg`, `public/*.png` | The logo. `components/ui.tsx` holds the same mark as `Icon.logo`. |
| `tests/theme.test.ts` | Asserts the system: greys for chrome, status hues, contrast, heights, radius. |
| `tests/design-doc.test.ts` | Keeps this file in step with the stylesheets. |

Components use the app tokens in `globals.css`, never the raw `--color-*`
theme tokens and never a literal colour. A colour or font literal outside a
token block is a Hallmark Floor failure.

## Colour

All values are OKLCH. A chroma of 0 is a pure grey; the theme test holds every
chrome token to that.

### The theme's raw colours (`app/tokens.css`, dark values in `globals.css`)

| Token | Light | Dark | Meaning |
| --- | --- | --- | --- |
| `--color-paper` | 99% 0 0 | 14.5% 0 0 (the logo's black) | The page ground. |
| `--color-paper-2` | 97.2% 0 0 | 17.5% 0 0 | A step off the paper. |
| `--color-paper-3` | 94.8% 0 0 | 21% 0 0 | Two steps off: trays. |
| `--color-ink` | 14.5% 0 0 (#0a0a0a, the logo) | 96% 0 0 | Text and the primary. |
| `--color-ink-2` | 32% 0 0 | 84% 0 0 | Secondary text. |
| `--color-muted` | 47% 0 0 | 70% 0 0 | Labels, captions, hints. |
| `--color-rule` | 91% 0 0 | 27% 0 0 | Hairlines between rows. |
| `--color-accent` | 14.5% 0 0 | 96% 0 0 | The primary: black, white at night. |
| `--color-accent-deep` | 14.5% 0 0 | 96% 0 0 | The primary as text. |
| `--color-accent-soft` | 93.5% 0 0 | 27% 0 0 | Soft fills: avatars, the "you" chip. |
| `--color-accent-ink` | 100% 0 0 | 14.5% 0 0 | Text on the primary. |
| `--color-focus` | 14.5% 0 0 | 92% 0 0 | The focus ring. |
| `--color-error` | 52% 0.19 27 | 74% 0.14 27 | Errors and deleting. |
| `--color-success` | 50% 0.12 150 | (unchanged) | Scaffold token; the app uses `--good`. |
| `--glint` | 100% 0 0 / 0 | (unchanged) | A top highlight, switched off in Mono. |

### The app's tokens (`app/globals.css`), the ones components use

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | the paper | | Page background. |
| `--surface`, `--card` | 100% 0 0 | 18.5% 0 0 | Lists, sheets, fields, month tiles. |
| `--text` | the ink | | Body text. |
| `--text-2` | ink-2 | | Secondary text. |
| `--muted` | muted | | Labels and hints. |
| `--line` | the rule | | Hairlines. |
| `--tint` | paper-2 | 17.5% 0 0 | Sidebar, hover fills, vacant months, the quiet button. |
| `--tray` | paper-3 | 21% 0 0 | Sunken trays: to-dos, the month grid, segmented controls. |
| `--raised` | the card | 27% 0 0 | The chosen segment, the current menu item. |
| `--brand` | accent (black) | white | Primary buttons, the add button. |
| `--brand-deep` | 30% 0 0 | 84% 0 0 | A primary button under the pointer. |
| `--brand-ink` | accent-ink | | Text on a primary button. |
| `--brand-soft` | accent-soft | | Avatars, the "you" chip. |
| `--good` | 46% 0.12 150 | 78% 0.13 150 | Green status text: paid amounts, "+800,00 €", ticks. |
| `--good-soft` | 94.5% 0.045 150 | 29% 0.06 150 | Paid month tiles, tick dots. |
| `--warn` | 50% 0.11 68 | 82% 0.12 80 | Amber status text: to-do markers, warning chips. |
| `--warn-soft` | 95.5% 0.05 85 | 30% 0.06 75 | Their fills. |
| `--bad` | the error colour | | Unpaid months, errors, delete actions. |
| `--bad-soft` | 95% 0.03 27 | 28% 0.05 27 | Unpaid month tiles, error notes. |
| `--bar-rent` | 52% 0.13 150 | 62% 0.13 150 | Rent bars in the chart. |
| `--bar-cost` | 78% 0.15 80 | 84% 0.13 82 | Cost bars in the chart (yellow). |
| `--field-edge` | 62% 0 0 | 46% 0 0 | A field's border, kept at 3:1. |
| `--scrim` | 0% 0 0 / 0.38 | 0% 0 0 / 0.62 | Behind dialogs and the menu. |
| `--knob` | 100% 0 0 | 96% 0 0 | A switch's bead. |
| `--chevron` | an ink chevron | a light chevron | The dropdown arrow, drawn as an SVG data URI so it can sit 16px in from the edge. |

`--bar-rent` and `--bar-cost` differ in lightness as well as hue (2.55:1 light,
2.08:1 dark; the test asks for at least 1.8:1), so the chart still reads for
someone who cannot tell red from green. Never draw two data series in red and
green of similar lightness.

### Status, in one place

| State | Where it shows | Colour |
| --- | --- | --- |
| Rent paid | month tile, amount | `--good-soft` tile, `--good` amount |
| Rent unpaid | month tile | `--bad-soft` tile, `--bad` text |
| Vacant | month tile | `--tint`, no border |
| Not logged yet | month tile | transparent, dashed `--muted` border |
| Future month | month tile | transparent, muted text |
| Done | tick dot, "all set" | `--good` on `--good-soft` |
| Needs a look | to-do dot, warning chip | `--warn` on `--warn-soft` |
| Error, delete | note, link, button text | `--bad` (on `--bad-soft`) |
| Income in a list | "+800,00 €" | `--good` |
| Costs, losses | amounts | the text colour; a minus sign carries it |

## Type

One face, **Plus Jakarta Sans**, self-hosted with `next/font/local` as `--font-jakarta` and
used for `--font-display` (heads and figures), `--font-body` and
`--font-outlier`. Weights 400, 500, 600 and 700. `--font` is the body face.

| Token | Value | Use |
| --- | --- | --- |
| `--text-xs` | 0.75rem | Chips, chart labels. |
| `--text-sm` | 0.875rem | Labels, captions, secondary rows, popovers (never below 14px). |
| `--text-md` | 1rem | Body and fields (16px keeps iOS from zooming). |
| `--text-lg` | 1.2rem | Section heads, the apartment name. |
| `--text-xl` | 1.44rem | Stat figures, dialog titles, the amount field. |
| `--text-2xl` | 1.728rem | Page heads, the desktop apartment name. |
| `--text-3xl` | 2.074rem | The sign-in head; × 1.44 is the big figure. |
| `--text-display-s`, `--text-display`, `--text-section`, `--text-title`, `--text-lead` | 1.44, 1.728, 1.2, 1 and 1rem | Scaffold sizes used by `base.css` heads. |
| `--tracking-display` | -0.03em | Heads and figures. |
| `--display-weight` | 700 | Heads. |

Figures in columns use tabular numerals; display figures use proportional ones
so the cents sit close. The big figure shows the cents smaller and muted.

## Space, shape and depth

- **Spacing** is the scale `--space-3xs` 2px, `--space-2xs` 4px, `--space-xs`
  8px, `--space-sm` 12px, `--space-md` 16px, `--space-lg` 24px, `--space-xl`
  40px, `--space-2xl` 64px, `--space-3xl` 96px, `--space-4xl` 144px. Padding,
  margin and gap use these; a raw length where a token exists is a Floor fail.
- **Radius:** `--radius-card` 20px for cards and trays (also `--radius`),
  `--radius-input` 14px for fields and month tiles, `--radius-pill` 999px for
  every button, tab, chip and the year picker. Dialogs are the card radius plus
  8px. `--rule-hair` is 1px.
- **Control height:** `--control-height` 48px for every single-line field,
  select and button, so a field never sits taller than the button beside it.
  Small buttons are 40px; hit targets are never under 44px.
- **Depth:** `--shadow-card` lifts lists and month tiles (no border with it),
  `--shadow-lift` lifts what floats or hovers (also `--shadow`),
  `--shadow-sheet` lifts dialogs and the menu, `--shadow-edge` is the card
  shadow under another name, `--seg-shadow` lifts the chosen segment,
  `--knob-shadow` the switch bead, `--shadow-inset` and `--shadow-inset-deep`
  sink trays.
- **Layout scaffold** (from Hallmark, mostly unused by this app's shell):
  `--container` 1440px, `--gutter` 64px, `--gap-columns` 32px,
  `--section-gap-s`, `--section-gap`, `--section-gap-l` 120, 144 and 176px.
  Layers: `--z-base` 1, `--z-raised` 10, `--z-dropdown` 100, `--z-sticky` 200,
  `--z-sticky-nav` 300, `--z-modal` 400, `--z-toast` 500, `--z-tooltip` 600.

The shell is 560px on a phone, 720px from 640px, and from 960px a 232px sidebar
with two-column pages up to 1040px. The first line of each column sits at the
same height: nothing goes above the left column's first figure that the right
column does not also have.

## Components

- **Buttons:** pill, 48px, weight 600. Default: white with a hairline ring.
  `.primary`: black (white at night). `.quiet`: tint fill. `.danger`: red text.
  `.small`: 40px. `.block`: full width and block-level, so it lines up with a
  field beside it. Hover lifts 1px with a shadow; press scales to 0.97.
  Disabled: tint fill, muted text, not-allowed cursor.
- **Fields:** 48px, `--field-edge` border, 14px radius, focus ring inside.
  Selects draw `--chevron` 16px in from the right. Labels sit above, 14px,
  weight 500.
- **Segmented control** (`.seg`): a pill tray; the chosen segment is raised.
- **Share switch** (co-owned apartments, Home and Tax): a segmented control,
  "Your share (n %)" or "Whole apartment". On a phone it sits above the
  figures; from 960px it moves to the top bar beside the year picker, since
  both decide what the page shows, and both columns then start on the same line
  under the title.
- **Choices** (`.choice`): pills; the chosen one is soft-filled.
- **Lists:** a white sheet; rows with a hairline between them and none under
  the last.
- **Month grid:** a tray of twelve tiles, three across on a phone, four from
  640px, six from 960px. States as in the status table.
- **Chart:** rent and cost bars per month on one baseline; bars grow from it
  on load.
- **Dialogs** (`Sheet`): the title stays put while the body scrolls; Escape,
  the backdrop and × close it, from the first frame it is on screen.
- **Menu:** a drawer on phones (hidden only once scripts run), a sidebar from
  960px; the current item is raised.
- **Chips:** tiny pills; `.warn` is amber.

## Motion

`--ease-out` (an exponential ease-out) for everything; `--ease-in` and
`--ease-in-out` exist but are unused. Durations: `--dur-micro` 120ms (press,
popovers), `--dur-short` 220ms (hover, the menu), `--dur-long` 420ms
(entrances, dialogs). Page sections and month tiles fade in, staggered a few
tens of milliseconds; chart bars scale up from the baseline; dialogs rise 16px
and scale from 0.98. Only opacity and transform are animated. Under
`prefers-reduced-motion` every animation shows its end state.

## Dark mode

Dark mode is the logo inverted, not a recolour. It is declared twice in
`globals.css` with identical values: under `prefers-color-scheme: dark` (unless
Light is chosen) and under `[data-theme='dark']` (Dark chosen). The theme test
fails if the two drift apart. A dark value is set only for tokens that differ;
the rest follow the light mapping.

## Copy

- No middle-dot meta strings (`A · B · C`): use commas, parentheses or a
  second line.
- No dashes in prose: a comma, colon, full stop or parentheses. Ranges such as
  `1–28` keep the en dash.
- Labels in sentence case, never tracked capitals.
- English, Swedish and Finnish change together (`lib/i18n/`).

## Accessibility

- Text pairs are at least 4.5:1 in both schemes; the theme test lists every
  pair the stylesheet draws, including a hovered primary button.
- A visible focus ring on every control, appearing instantly.
- 48px controls; 16px fields on phones.
- Reduced motion respected; nothing tappable moves after the page opens.

## Checking a change

1. `npx vitest run tests/theme.test.ts tests/design-doc.test.ts`
2. The Hallmark sweep, where the skill is installed:
   `node ~/.claude/skills/hallmark/scripts/sloplint.mjs app/globals.css app/tokens.css app/base.css components --genre modern-minimal --scope app`.
   It must show 0 FAIL.
3. `npm run test:e2e`: 100 % end-to-end coverage.
4. Look at it: phone and desktop, light and dark (the `ui-preview-screenshot`
   skill).

## Changelog

- **2026-11:** The share switch moved into the top bar on desktops, beside the
  year, so Home's and Tax's two columns start on the same line; the rule above
  Home's occupancy and yield went with it on desktops.
- **2026-11 (#82):** Mono. A full Hallmark redesign: black and white like the
  logo, Plus Jakarta Sans, round controls, trays and sheets, status colour,
  the month grid, the category dropdown, one control height, the logo's door
  line removed.

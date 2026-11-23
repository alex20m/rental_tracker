---
name: design-system
description: >-
  Work inside this app's design system, and keep DESIGN.md true as it changes.
  Use for any change to how the app looks or moves: a new screen or component,
  a colour, font, size, spacing, radius, shadow or animation, a dark-mode fix, an
  icon, a restyle or a redesign, and whenever someone asks what the design rules
  are. Covers reading DESIGN.md first, using the app tokens instead of literals,
  where colour is allowed, how to add or change a token so the docs test passes,
  the checks to run, and the traps that have already cost a change.
---

# Work inside the design system

`DESIGN.md` at the repo root is the design system: principles, every token
with its light and dark value and its use, components, motion, copy rules and
how to check a change. It is the source of truth for how the app looks, and
`tests/design-doc.test.ts` holds it in step with the stylesheets: a token
declared in `app/tokens.css`, `app/globals.css` or `app/base.css` without a line
in DESIGN.md fails, and so does a backticked `--token` in DESIGN.md that no
stylesheet declares. A design tool that honours a root `DESIGN.md` (Hallmark
does) treats it as the locked system and builds inside it.

## The procedure

1. **Read DESIGN.md before you touch a style.** The answer to "what colour,
   what size, what radius" is almost always already there. Decide whether your
   change fits inside the system or changes it.
2. **Fitting inside it:** use the app tokens from `globals.css` (`--text`,
   `--card`, `--good`, `--space-md`, `--radius-input`, `--control-height`, ...).
   Never a literal colour, a raw `font-family`, or a raw length where a spacing
   token exists; never the raw `--color-*` theme tokens in a component. If you
   catch yourself wanting a literal, the system is missing a token: go to 3.
3. **Changing it** (a new token, a new value, a new rule): change the
   stylesheet and DESIGN.md in the same commit.
   - New token: declare it in the token block (light on bare `:root`, dark in
     **both** dark blocks with identical values), give it a row in the right
     DESIGN.md table with its light value, dark value and use.
   - Changed value: update its row. Changed rule (where colour may appear, a
     component's states): update the prose.
   - Removed token: delete its row, or the docs test fails.
   - Add a line to DESIGN.md's **Changelog**: the date, the PR, what changed
     and why, in a sentence.
4. **If the change is a rule a test can hold, hold it.** `tests/theme.test.ts`
   resolves tokens through both stylesheets and asserts the system: chrome is
   pure grey, status hues, every drawn text pair at 4.5:1 in both schemes,
   48px controls. A new text-on-fill pair goes into its contrast list; a new
   rule ("cost bars are yellow") gets an assertion. Watch it fail against a
   deliberately wrong value before you trust it.
5. **Check, then look.** Run what DESIGN.md's "Checking a change" lists: the
   theme and docs tests, the Hallmark sweep where installed (0 FAIL), the e2e
   suite at 100 % coverage, and screenshots on a phone and a desktop in light
   and dark (`ui-preview-screenshot`). A visual change nobody looked at in dark
   mode is not checked.

## The rules that are easiest to break

- **Colour means status.** The chrome is black and white like the logo. Green
  is rent in and done, red is unpaid, errors and deleting, amber needs a look,
  yellow is cost in the chart, grey is vacant or not logged. A colour on a
  non-destructive button, a link, a menu or as decoration is outside the system.
- **Two data series never differ by hue alone.** Pair a dark and a light colour
  (rent green against cost yellow); red and green of similar lightness merge
  for red-green colour blindness. The theme test asks for 1.8:1 between the
  chart's bars.
- **A token that does double duty breaks in the other scheme.** Splitting the
  hover colour of the primary from the green text colour was needed because one
  token, fine in light mode, put white text on light sage in dark mode. When a
  token serves two roles, check the pair in both schemes, or split it.
- **Both dark blocks, identical.** `prefers-color-scheme: dark` and
  `[data-theme='dark']` carry the same values; the theme test compares them.
- **Every single-line field and button is `--control-height`.** A field's
  padding plus line height plus border silently made a date field 52px beside a
  48px button.
- **Nothing tappable moves after a page opens.** Entrances fade in place. A
  slide-in let a test (and a fast thumb) tap during the animation's delay and
  miss. Animate only opacity and transform, never layout properties, and give
  every animation the reduced-motion end state (base.css does this globally).
- **A dialog's key handling and focus belong in a layout effect.** A plain
  `useEffect` runs after paint, so an Escape in the dialog's first frame did
  nothing.
- **Two shape edges that meet exactly leave a hairline.** Both are
  anti-aliased, and the background shows through between them: the logo's door
  ended on the building's edge and drew a grey line. Run the shape past the
  edge, or trace one outline around both. Re-render the PNG icons from the SVG
  afterwards, keeping each format (the iOS icon is opaque RGB).

## What I am unsure of

- Whether every design tool reads a root `DESIGN.md` as a locked system;
  Hallmark does. Others need pointing at it.
- The token-coverage test checks names, not values: a value changed in CSS but
  not in DESIGN.md's table still passes. Step 3 is what keeps the values right.

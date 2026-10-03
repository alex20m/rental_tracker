---
name: ui-component-tests
description: >-
  Test React UI behaviour — flows, popovers, sheets, forms — with vitest, jsdom
  and Testing Library, without giving the rest of the suite a DOM it does not
  need. Use whenever a change adds or reshapes something a person clicks, types
  into or reads, and whenever a component test is flaky, finds "multiple
  elements", or passes while the markup is invalid. Covers the per-file jsdom
  opt-in, what to mock at the module boundary and why, faking only the clock's
  Date, querying by role so the test doubles as an accessibility check, the
  nested-interactive and layered-Escape traps, and the mutation check that shows
  which stated behaviours nothing asserts.
---

# Test what a person does, not what the component is

The suite is the only reviewer (see `test-first`). For UI that means a test
drives the real component the way a person would — click, type, read — and
asserts on what they would perceive. It cannot see CSS (jsdom applies none; use
`ui-preview-screenshot` for that), so it is the right tool for *behaviour*:
what opens, what closes, what is disabled, what gets sent.

## Setup

- devDependencies: `jsdom`, `@testing-library/react`, `@testing-library/dom`,
  `@testing-library/user-event`.
- **Keep the global vitest environment `node`** and opt in per file with
  `// @vitest-environment jsdom` as the first line. The database and pure-logic
  tests stay fast and never grow a `window` they could accidentally lean on.
- Name files `*.test.tsx` — the default include already matches them.
- vitest here runs without `globals`, so Testing Library cannot register its
  own cleanup: call `afterEach(cleanup)` yourself, or renders pile up in the
  document and every query finds two of everything.

## Mock the module boundary, never the thing under test

- Replace the **network module** (`vi.mock('@/lib/client/api', …)`), the router
  hook, and heavy libraries the page imports statically (PDF, zip). Leave every
  component real — a mocked child tests the mock.
- `vi.mock` is hoisted above the imports, so its factory cannot see top-level
  variables. Build the `vi.fn()`s inside `vi.hoisted(() => ({ … }))` and
  reference them from both the factory and the tests.
- If the code does `instanceof ApiError`, the factory must export a real class,
  not `vi.fn()`.
- Reset the mocks and `localStorage` in `beforeEach`; assert on the calls the
  UI made (`toHaveBeenCalledWith(id, { … })`) — that is the observable contract.

## Time and locale

- `vi.useFakeTimers({ toFake: ['Date'] })` plus `vi.setSystemTime(…)`. Fake
  **only `Date`**: faking `setTimeout` too stalls `userEvent` and `waitFor`.
  Anything that reads "this year" or "today" is otherwise a test that starts
  failing on 1 January.
- `Intl` currency output uses non-breaking spaces (`1 234,50 €`). Match with
  `\s` in a regex or normalise before comparing; never paste the glyph.

## Query by role and accessible name

`getByRole('button', { name: 'Add cost' })` fails if the control is unlabelled,
the wrong element, or hidden — so the test is also an accessibility check. Fall
back to `getByTestId` only for a figure with no role (a headline number).

Traps this found in practice:

- **A button inside a `<label>` or inside another `<button>`.** An "info" icon
  placed inside a form label makes `getByLabelText` match the icon as well, and
  a button nested in a button is invalid HTML. React only *logs* the latter
  (`<button> cannot be a descendant of <button>`) and jsdom runs it happily — a
  green test with the warning in stderr. Read stderr; put the icon beside the
  label, not inside it.
- **Layered dismissal.** A popover inside a modal sheet: both listen for
  Escape, so one keypress closes both. The inner layer must listen in the
  *capture* phase and `stopPropagation()`. Test it with both open — pressing
  Escape once must close only the popover, twice the sheet.
- **Portals.** A popover rendered into `document.body` is still found by
  `screen`, but not by `within(dialog)`. Assert on it through `screen`.

## Check the test can fail

Before trusting a UI test, break the source line it is meant to guard (flip a
condition, delete a `stopPropagation`) and watch it go red; restore, watch it
go green. When a mutation *survives*, a behaviour you wrote down — in a comment,
a commit message, the README — has no test. Example: "switching apartment keeps
you on the same section" survived until its own test was written.

## Not sure about

- Written against vitest 2.1.9, jsdom 29, Testing Library React 16 and
  user-event 14 (Oct 2026). Layout-dependent behaviour (a popover flipping above
  its anchor) is tested as pure geometry in a separate function; jsdom returns
  all-zero rectangles, so do not try to assert it through the DOM.
- `user-event` with *all* timers faked was not tried here — only `Date` was.

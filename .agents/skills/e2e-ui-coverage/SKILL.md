---
name: e2e-ui-coverage
description: >-
  Hold an app's UI to 100 % coverage from end-to-end tests: Playwright driving
  the production build in a real browser, V8 coverage mapped back through
  source maps, and a gate that fails the run below 100 %. Use when adding or
  changing anything that runs in the browser, when writing or fixing a
  Playwright test, when the coverage gate names a gap, when setting the suite
  up in a new app, and when deciding whether a branch deserves a test or
  deletion. Covers what the gate measures and why, faking the backend at the
  network boundary, closing a gap honestly, and the traps that make the number
  lie or the suite flake.
---

# 100 % of the UI, measured from the browser

Unit tests render components into a DOM with no layout, no stylesheet and no
real network; they cannot see a button that never fires, a fetch that is
never made, or a page that throws only once two screens are connected. The
end-to-end suite drives the *built* app in a real browser and is the only
place those bugs are visible. Coverage measured there answers a question no
other number does: **is there any code the user can reach that no test ever
ran?** At 100 %, the answer is no.

The number is a floor, not the goal. A test that clicks through a screen and
asserts nothing gets lines covered and protects nothing — every rule in
`test-first` still applies: assert what the user sees and what was sent.

## What the gate measures

- **Every module that runs in the browser.** In a Next app that is every file
  starting with `'use client'`, plus browser-only helpers they import. The
  gate finds them **on disk**, not from the coverage data: V8 only reports
  scripts that were loaded, so a file no test ever loaded is simply absent,
  and a gate that read only the report would score it as nothing to cover —
  a vacuous 100 %. Absent must count as 0.
- **Statements, branches, functions and lines, all at 100 %.** Branches are the
  one that matters most: a line can run while its `else`, its `?? fallback` or
  its `?.` never does, and that untaken branch is exactly where error handling
  hides.
- **Not server code.** Route handlers and server components never reach the
  browser, so browser coverage cannot see them. They are the unit and
  integration suite's job. Keep server components thin, so there is nothing in
  them to miss.
- **No escape hatches.** `v8 ignore` / `istanbul ignore` comments are disabled
  in the reporter (`v8Ignore: false`), files are not excluded, and the
  threshold is not lowered. Each of those turns "untested" into "declared
  tested".

## The harness

1. **Build for coverage, separately.** Browser source maps on and a separate
   output directory, both behind one environment flag, so the real build in
   the deploy is untouched and its maps are not published:
   `productionBrowserSourceMaps: flag, distDir: flag ? '.next-e2e' : '.next'`.
   The npm script builds with the flag, then runs Playwright, whose
   `webServer` starts that build with the same flag.
2. **Record coverage in a fixture every test uses.** Override `page`: start
   `page.coverage.startJSCoverage({ resetOnNavigation: false })`, hand the page
   on, stop, and add the result to the reporter
   (`monocart-coverage-reports` merges V8 data through source maps). Tests
   import `test`/`expect` from the fixture file, never from `@playwright/test`
   — a test that bypasses the fixture adds nothing to the number.
3. **Gate in the global teardown.** Generate the merged report, compare it
   with the on-disk list of browser modules, and throw with one line per file
   that is short: which metric, which lines never ran, which ran only partly,
   and the line:column of each branch never taken. A gate that only says
   "branches 54/55" costs a debugging session per gap; one that says
   `branch not taken at 143:3` costs a glance. Clean the reporter's cache in
   the global setup, so an earlier run cannot fill this run's gaps.
4. **Test the gate.** It runs after everything else, so nothing would notice
   it stop failing. Unit-test that it fails a file one branch short, fails a
   file no test loaded, finds `'use client'` modules and ignores server files
   — and assert in the pipeline test that the teardown is still configured and
   that both workflows run the suite. This is the vacuous-detector trap from
   `deploy-gate`, again.
5. **Run it in CI on both workflows** with retries at 0. A test that needs a
   retry to pass is broken; a retry hides it.

## Faking the backend

The suite tests what the person using the app sees; the server is tested
against a real database elsewhere. So answer the app's API **at the network
boundary**, with `page.route('**/api/**')`, not by adding a test mode to the
app — a bypass compiled into production code is a bypass in production.

- **Make the fake stateful.** "Add an apartment, then see it in the list" is
  the flow users take; a fake that only replays canned JSON cannot follow it.
  Keep it small and copy the real routes' shapes and status codes.
- **Fail on anything it does not know.** Answer unknown requests with an error
  *and* record them, and have the fixture fail the test if any were recorded —
  otherwise a UI calling a route that does not exist passes.
- **Inject failures per test**: a status with an error body, a status with a
  non-JSON body (proxies answer with HTML), and an aborted request (offline).
  Those three are different branches in any decent fetch wrapper, and each
  needs a test.
- **Fake third-party endpoints too** (an auth provider's proxy routes), and
  read the SDK's source to see what it really does on failure. An SDK can
  *throw* where its upstream library *returns* `{ error }` — code checking
  `result.error` then never runs, and only an end-to-end test, or a coverage
  gap on that branch, shows it.

## Closing a gap

When the gate names a line or branch, decide which of two things it is:

- **Behaviour no test exercises** — the save that fails, the empty list, the
  second page of a PDF, the clock passing the moment a timer fires. Write the
  test the way a user would get there, with a real assertion.
- **Code nothing can reach** — `ref.current?.` on a ref that always exists
  after mount, `?? 0` for a value that is always present, an error callback on
  an API that rejects instead. Delete it. Defensive branches that cannot run
  are not safety; they are untested code that looks like safety.

Never satisfy the gate with a test that only loads a screen; ask what bug the
test would catch.

## Traps

- **Something else on the page has `role="alert"`.** Next's route announcer
  does, so `getByRole('alert')` matches two elements. Scope it to your own
  alert's class or container.
- **Labels match by substring.** `getByLabel('Email')` also matches "Code from
  the email"; `getByRole('heading', { name: 'Portfolio' })` also matches
  "Your share of the portfolio". Use `exact: true` by habit.
- **"Remembered" must differ from the default.** A test that a choice survives
  a reload proves nothing if the remembered value is also what the app shows
  with no memory at all — the first item, the current year. Pick the second
  item, then reload. A test shaped the first way passed for weeks over code
  that erased the stored choice on every load.
- **A `<label for>` names the control it points at.** A button with
  `id="receipt"` and `<label for="receipt">Receipt</label>` is called
  "Receipt" by the accessibility tree, whatever text it shows; find it by that
  name and assert its text separately.
- **The browser's own validation stops a submit.** A `max` on an input means
  the form never sends — assert `validity.rangeOverflow` and that no request
  was made, rather than waiting for a server error that never comes.
- **Clicking a button that opens a file picker** is the only way to cover its
  handler. `setInputFiles` straight on the hidden input skips it; use
  `page.waitForEvent('filechooser')` around the button click.
- **Timers and dates.** `page.clock.setFixedTime` for "today"-dependent UI;
  `page.clock.install()` then `runFor()` for a delayed callback (an object URL
  revoked after a download). Waiting real seconds is slow and flaky.
- **A race with the initial load.** Registering a failure after `goto` can be
  consumed by a request the first render is still making. Wait for the screen
  to settle before arming it.
- **React's hooks lint rule flags Playwright fixtures**, whose callback is
  named `use`. Turn `react-hooks/rules-of-hooks` off for the e2e directory
  only.
- **Lint and type-check the suite, and ignore its output.** The e2e build
  directory, the coverage report and Playwright's results folders need adding
  to the lint ignores and `.gitignore`, or the next lint run reads thousands of
  generated files.
- **Next edits `tsconfig.json` on the first coverage build**, adding the
  separate build directory's generated types to `include`. Commit that change
  with the harness; otherwise every local run leaves the tree dirty.
- **A sandbox's browser may not match the Playwright version.** Pass the
  pre-installed binary through an environment variable into
  `launchOptions.executablePath` rather than downloading; CI installs its own
  with `npx playwright install --with-deps chromium`. Launch with
  `--no-proxy-server` where an HTTP proxy is set, or it swallows `localhost`.
- **Coverage vanishes across a full navigation on newer Chromium.** With
  Chromium's RenderDocument on, each cross-document navigation (`page.reload`,
  `window.location.assign`, a plain link) gets a new frame host and DevTools
  agent. The old agent's exit stops precise coverage, which resets V8's
  counters, so whatever ran in the replaced document is missing from the read
  at the end of the test. It shows up as a handful of lines the suite plainly
  runs reading as uncovered in CI and not locally, where the browser builds
  differ. `resetOnNavigation: false` does not help. Reading coverage from a
  route handler that holds the navigation does not work either: Chromium holds
  DevTools messages to the page while a navigation is pending, so the read
  deadlocks. Launch with RenderDocument disabled instead. Chromium honours
  only the **last** `--disable-features` switch, so a second one silently
  discards every feature Playwright disables. Read the switch Playwright
  actually passed (`launchServer(...).process().spawnargs`) in a worker-scoped
  `launchOptions` fixture and append to it. To reproduce on an older build,
  launch with `--enable-features=RenderDocument:level/all-frames`.

## Where this is least certain

- Verified with `@playwright/test@1.63`, `monocart-coverage-reports@2.13` and
  Next 16 (Turbopack builds). Source-map paths differ between bundlers
  (`turbopack:///[project]/…`, `webpack://_N_E/./…`); normalise them to
  repo-relative paths and test that normalisation.
- V8 branch counts come from the transpiled output mapped back to source. They
  have matched real source branches so far, but a transpiler could introduce
  one with no source equivalent. If a gap points at code with no branch in it,
  read the mapped position before writing a test for it — and say so in the
  PR rather than working around it.
- The RenderDocument diagnosis was reproduced on Chromium 141 (build 1194)
  by forcing the feature on. The CI browser (Chrome for Testing 153) was not
  run locally. If disabling the feature stops working on some later build,
  the feature may have been removed and made unconditional, and coverage
  will need reading before each navigation some other way.

## One gate per viewport

Run the suite as one Playwright project per layout (phone, desktop) and hold
**each** project to 100 % on its own, with a separate coverage report per
project. A single merged report lets the phone run fill the desktop's gaps (and
the reverse), so it says nothing about whether each layout was exercised.

Consequences worth knowing before you start:

- Code behind a layout-only control (a ☰ that is hidden above a breakpoint)
  cannot be reached from the other project at its default viewport. Give the
  tests of that control an explicit `test.use({ viewport })` at the layout where
  it exists, and add one test per layout asserting the other layout's
  difference (sidebar visible, no ☰) rather than skipping anything.
- Shared helpers must work in both layouts, and must **wait** for the layout to
  render before choosing: `isVisible()` does not wait, so "click ☰ if visible"
  silently skips the click on a slow render. Wait for `toggle.or(sidebar).first()`.
- Verified against Playwright 1.x with `devices['Pixel 7']` and `devices['Desktop Chrome']`;
  not verified for WebKit/Firefox projects.

import { test as base, expect, type BrowserType, type LaunchOptions } from '@playwright/test';
import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions } from './coverage';
import { FakeApi } from './fakeApi';

/**
 * Every end-to-end test gets a page whose JavaScript coverage is recorded, and
 * a fresh fake API installed on it. Import `test` and `expect` from here, never
 * from '@playwright/test' — a test that bypasses this fixture adds nothing to
 * the coverage the gate counts.
 */
export const test = base.extend<{ api: FakeApi }>({
  launchOptions: [
    async ({ launchOptions, playwright }, use) => {
      await use(await keepingCoverageAcrossNavigations(playwright.chromium, launchOptions));
    },
    { scope: 'worker' },
  ],
  api: async ({}, use) => {
    await use(new FakeApi());
  },
  page: async ({ page, api }, use) => {
    await api.install(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.coverage.startJSCoverage({ resetOnNavigation: false });

    await use(page);

    const coverage = await page.coverage.stopJSCoverage();
    await new CoverageReport(coverageOptions).add(coverage);
    expect(api.unhandled, 'requests the fake API does not implement').toEqual([]);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

/**
 * Launch options under which coverage survives a full navigation.
 *
 * With Chromium's RenderDocument, every cross-document navigation
 * (`page.reload`, `window.location.assign`, a plain link) gets a new frame
 * host and a new DevTools agent, and the old agent's exit stops precise
 * coverage, which resets V8's counters. Whatever ran in the old document is
 * then missing from the coverage read at the end of the test: lines the suite
 * plainly runs read as uncovered, on browser builds where RenderDocument is on
 * and not on older ones. Reading coverage before the navigation instead is
 * not possible: while a navigation is pending, Chromium holds DevTools
 * messages to the page, so a read from a route handler deadlocks.
 *
 * So the feature is turned off. Chromium honours only the last
 * `--disable-features` switch, so adding a second one would silently drop
 * every feature Playwright itself disables; the switch Playwright actually
 * passed is read from a probe launch and extended instead.
 */
async function keepingCoverageAcrossNavigations(chromium: BrowserType, options: LaunchOptions): Promise<LaunchOptions> {
  const probe = await chromium.launchServer(options);
  const spawned = probe.process().spawnargs;
  await probe.close();
  const prefix = '--disable-features=';
  const current = spawned.filter((arg) => arg.startsWith(prefix)).pop()?.slice(prefix.length);
  const features = [...(current ? current.split(',') : []), 'RenderDocument'];
  return { ...options, args: [...(options.args ?? []), prefix + features.join(',')] };
}

export { expect };

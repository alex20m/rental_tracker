import { test as base, expect } from '@playwright/test';
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

export { expect };

import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end UI tests: the production build, in a real browser, with the API
 * answered by an in-memory fake at the network boundary (e2e/fakeApi.ts). The
 * server's own behaviour — access control, SQL — is tested against a real
 * Postgres in tests/; these tests are about what the person using the app
 * sees and does.
 *
 * `npm run test:e2e` builds first (with source maps, into .next-e2e) and then
 * runs this. The global teardown fails the run unless every browser module is
 * 100 % covered — see e2e/coverage.ts.
 */

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  // A test that needs a retry to pass is broken; fix it rather than hide it.
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/globalSetup.ts',
  globalTeardown: './e2e/globalTeardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // A sandbox may pre-install Chromium at a fixed path; CI installs Playwright's own.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      // An HTTP(S)_PROXY in the environment would otherwise swallow localhost.
      args: ['--no-proxy-server'],
    },
  },
  // Each project is held to 100 % coverage on its own (e2e/coverage.ts).
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `next start -p ${PORT}`,
    env: { E2E_COVERAGE: '1' },
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

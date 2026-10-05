import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openAccount } from './nav';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

const popup = (page: Page) => page.getByRole('dialog', { name: 'Install Rental Tracker' });

/** What Chromium does when it decides the app is installable. */
const offerInstall = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        w.__prompted += 1;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });

test.describe('install popup', () => {
  test.use({ installPopup: true, userAgent: DESKTOP_UA });

  test('opens on its own in a browser, with the steps for this computer', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');

    await expect(popup(page)).toBeVisible();
    await expect(popup(page).getByRole('heading', { name: 'Install on this computer' })).toBeVisible();
    await expect(popup(page).getByText('Look for the install icon at the end of the address bar.')).toBeVisible();
  });

  test('also opens on the sign-in page, before anyone has an account', async ({ page, api }) => {
    api.signedIn = false;
    await page.goto('/sign-in');

    await expect(popup(page)).toBeVisible();
  });

  test('"Not now" closes it for this visit only, so it is back after a reload', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await popup(page).getByRole('button', { name: 'Not now' }).click();
    await expect(popup(page)).toBeHidden();

    await page.reload();

    await expect(popup(page)).toBeVisible();
  });

  test('Escape closes it for this visit, and it is back after a reload', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toBeHidden();

    await page.reload();

    await expect(popup(page)).toBeVisible();
  });

  test('"Don’t show again" keeps it away on later visits', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await popup(page).getByRole('button', { name: 'Don’t show again' }).click();
    await expect(popup(page)).toBeHidden();

    await page.reload();

    await expect(page.getByRole('button', { name: 'Menu', exact: true }).or(page.getByRole('navigation', { name: 'Sections' })).first()).toBeVisible();
    await expect(popup(page)).toBeHidden();
  });

  test('the account page still offers the install after the popup was silenced', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await popup(page).getByRole('button', { name: 'Don’t show again' }).click();

    const account = await openAccount(page);

    await expect(account.getByRole('heading', { name: 'Install the app' })).toBeVisible();
    await expect(account.getByText('Choose Install, or find it under the browser’s ⋮ menu.')).toBeVisible();
  });

  test('a one-tap button replays the browser’s own install prompt when it offers one', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await offerInstall(page);

    await expect(popup(page).getByRole('heading', { name: 'Install on this computer' })).toBeHidden();
    await popup(page).getByRole('button', { name: 'Install app' }).click();

    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  });

  test('goes away once the browser reports the app installed', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await offerInstall(page);
    await expect(popup(page)).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));

    await expect(popup(page)).toBeHidden();
  });

  test('is silent in the installed app, and so is the account page', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes('display-mode: standalone') ? ({ ...real('all'), matches: true, media: query } as MediaQueryList) : real(query);
    });
    await page.goto('/');
    const account = await openAccount(page);

    await expect(account.getByRole('heading', { name: 'Language' })).toBeVisible();
    await expect(popup(page)).toBeHidden();
    await expect(account.getByRole('heading', { name: 'Install the app' })).toBeHidden();
  });

  test('can still be closed for the visit when the browser refuses to store the choice', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage disabled');
        },
      });
    });
    await page.goto('/');

    await popup(page).getByRole('button', { name: 'Don’t show again' }).click();

    await expect(popup(page)).toBeHidden();
  });

  test.describe('on an iPhone', () => {
    test.use({ userAgent: IPHONE_UA });

    test('says where the Share button is, since Safari has no install prompt', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');

      await expect(popup(page).getByText('Tap the Share button in Safari.')).toBeVisible();
      await expect(popup(page).getByText('Scroll down and choose “Add to Home Screen”.')).toBeVisible();
    });
  });

  test.describe('on Android', () => {
    test.use({ userAgent: ANDROID_UA });

    test('points at the browser menu', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');

      await expect(popup(page).getByText('Choose “Install app” or “Add to Home screen”.')).toBeVisible();
    });
  });

  test.describe('with a Finnish browser', () => {
    test.use({ locale: 'fi-FI' });

    test('speaks Finnish', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');

      await expect(page.getByRole('dialog', { name: 'Asenna Rental Tracker' })).toBeVisible();
    });
  });
});
